function parseAmount(value) {
  if (!value) return 0;
  const s = String(value).trim();
  const neg = s.includes('(') && s.includes(')');
  const n = parseFloat(s.replace(/[,"()]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return neg ? -Math.abs(n) : n;
}

/* ── نموذج العملة الموحّد ──
 * الأساس دائماً بالدولار (USD) من عمود "القيمة $".
 * التحويل إلى الدينار (IQD) يتم عند الطلب فقط، بسعر الصرف من عمود "تعادل العملة"
 * لكل سجل، ومع سعر افتراضي احتياطي قابل للضبط عبر متغيّر البيئة IQD_RATE.
 * لا توجد "عملة مشروع" — كل الأرقام دولار ويُحوَّل العرض حسب طلب المستخدم.
 */
const IQD_RATE = Number(process.env.IQD_RATE) > 1 ? Number(process.env.IQD_RATE) : 1470;

let DISPLAY_CURRENCY = 'USD';
function setDisplayCurrency(c) {
  DISPLAY_CURRENCY = String(c || '').toUpperCase() === 'IQD' ? 'IQD' : 'USD';
  return DISPLAY_CURRENCY;
}
function getDisplayCurrency() {
  return DISPLAY_CURRENCY;
}

/** سعر صرف السجل (USD→IQD): من الجدول إن توفّر (>1)، وإلا السعر الافتراضي */
function recordRate(r) {
  const x = Number(r && r.exchangeRate);
  return x && x > 1 ? x : IQD_RATE;
}

/** قيمة السجل بالدينار = |الصافي بالدولار| × سعر صرف السجل */
function localVal(r) {
  return Math.abs(r.net) * recordRate(r);
}

/** منسّق مبالغ يراعي عملة العرض المختارة.
 *  usd: القيمة بالدولار. iqd: القيمة بالدينار إن حُسبت مسبقاً (اختياري). */
function money(usd, iqd, short = false) {
  const useIqd = DISPLAY_CURRENCY === 'IQD';
  const value = useIqd ? (iqd === undefined || iqd === null ? usd * IQD_RATE : iqd) : usd;
  const cur = useIqd ? 'IQD' : 'USD';
  if (short && Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M ${cur}`;
  }
  return `${Math.round(value).toLocaleString('en-US')} ${cur}`;
}

/** يبقى للتوافق: يعرض دائماً بعملة العرض الحالية (الأساس دولار) */
function formatUSD(n, short = false) {
  return money(n, undefined, short);
}

/** منسّق قيمة مطلقة بعملة العرض (يتجاهل الوسيط القديم للعملة) */
function formatLocalAmount(usd) {
  return money(Math.abs(usd));
}

/** عمود العملة المعروض حالياً (لعناوين الجداول) */
function currencyLabel() {
  return DISPLAY_CURRENCY;
}

/** قيمة رقمية للمخططات بعملة العرض */
function chartVal(usd, iqd) {
  if (DISPLAY_CURRENCY === 'IQD') return (iqd === undefined || iqd === null) ? usd * IQD_RATE : iqd;
  return usd;
}

/** كشف عملة العرض من نص السؤال (يتقدّم على اختيار الواجهة عند وجوده) */
function detectCurrency(query) {
  const q = String(query || '').toLowerCase();
  if (/\biqd\b|دينار|بالدينار|بالدنانير|دنانير|عراقي/.test(q)) return 'IQD';
  if (/\busd\b|دولار|بالدولار/.test(q)) return 'USD';
  return null;
}

/** لم يعد هناك عملة مشروع — العملة الفعّالة هي عملة العرض المختارة */
function dominantCurrency() {
  return DISPLAY_CURRENCY;
}

/** قيمة السجل معروضة بعملة العرض (موقّعة) */
function formatLocalCurrency(rec) {
  return money(rec.net, rec.net * recordRate(rec));
}

/** ألوان المخططات — لوحة احترافية */
const CHART_THEME = {
  revenue: '#2d6a4f',
  costs: '#9b2226',
  profit: '#1e3a5f',
  accent: '#ca9a2e',
  margin: '#457b9d',
  palette: ['#1e3a5f', '#2d5a7b', '#457b9d', '#5c8eb3', '#73a9c9', '#ca9a2e', '#2d6a4f', '#6b705c'],
};

const TYPE_LABELS = {
  revenue: 'ايراد',
  expense: 'المصاريف',
  services: 'خدمات',
  reservation: 'حجز',
  contractor: 'مقاول/مجهز/مورد',
  auction: 'مزاد',
  other: 'أخرى',
};

function interpretRecord(rec) {
  const cls = classifyRecord(rec);
  const net = rec.net;
  const amt = (v) => money(v, v * recordRate(rec));
  const typeName = rec.recordType || TYPE_LABELS[cls];

  switch (cls) {
    case 'revenue':
      return `نوع: ${typeName} — إيراد ${amt(Math.abs(net))}`;
    case 'expense':
      if (rec.recordType === 'خدمات') {
        return `نوع: خدمات — مصروف مدفوع ${amt(net)}`;
      }
      return `نوع: ${typeName} — مصروف مدفوع ${amt(net)}`;
    case 'reservation':
      return `نوع: ${typeName} — حجز ضمان ${amt(net)} (منفصل عن الإيراد)`;
    case 'contractor':
      if (net > 0) return `نوع: ${typeName} — مصروف لم يُدفع بعد ${amt(net)}`;
      if (net < 0) return `نوع: ${typeName} — أعمال/توريد ستُقدَّم لاحقاً ${amt(Math.abs(net))}`;
      return `نوع: ${typeName} — متوازن`;
    case 'auction':
      if (net < 0) return `نوع: ${typeName} — ربح فرق عملة ${amt(Math.abs(net))}`;
      if (net > 0) return `نوع: ${typeName} — خسارة فرق عملة ${amt(net)}`;
      return `نوع: ${typeName}`;
    default:
      return `نوع: ${typeName} — صافي ${amt(net)}`;
  }
}

/** توحيد أسماء أنواع السجلات القادمة من الجدول إلى الصيغة المعتمدة داخلياً */
function canonicalRecordType(t) {
  const s = String(t || '').trim();
  const map = {
    'الخدمات': 'خدمات',
    'الايراد': 'ايراد',
    'الإيراد': 'ايراد',
    'الحجز': 'حجز',
    'المزاد': 'مزاد',
  };
  return map[s] || s;
}

function normalizeRecord(raw) {
  return {
    num: raw['#'],
    accountCode: (raw['الرمز'] || '').trim(),
    accountName: raw['الحساب'] || '',
    group: raw['الحساب الاب'] || '',
    // اختصار المشروع = كود مختصر | مركز الكلفة = الاسم الكامل للمشروع
    projectCode: raw['اختصار المشروع'] || '',
    projectName: raw['مركز الكلفة'] || raw['المشروع'] || raw['اختصار المشروع'] || '',
    net: parseAmount(raw['القيمة $']),
    recordType: canonicalRecordType(raw['النوع']),
    // سعر الصرف (الاسم الجديد) مع دعم "تعادل العملة" القديم للتوافق
    exchangeRate: parseAmount(raw['سعر الصرف'] || raw['تعادل العملة']) || 0,
    // القيمة IQD محسوبة مسبقاً في الجدول (اختيارية — تُستخدم كتحقق)
    iqdValue: parseAmount(raw['القيمة IQD']),
  };
}

function classifyRecord(rec) {
  const { accountCode, recordType } = rec;
  if (recordType === 'حجز') return 'reservation';
  if (recordType === 'ايراد') return 'revenue';
  if (recordType === 'مزاد') return 'auction';
  // نوع السجل أولاً — لا يُلغى بكود الحساب
  if (recordType === 'خدمات' || recordType === 'الخدمات' || recordType === 'المصاريف') return 'expense';
  if (recordType === 'المقاوليين' || recordType === 'المجهزيين' || recordType === 'الموردين' || recordType === 'الالتزامات') {
    return 'contractor';
  }
  if (accountCode.startsWith('11')) return 'reservation';
  if (accountCode.startsWith('20')) return 'contractor';
  if (accountCode.startsWith('32')) return 'expense';
  return 'other';
}

function extractRole(message) {
  const m = message.match(/أنا\s+(مدير عام|مدير مالي|مدير مشروع|محاسب)/);
  return m ? m[1] : null;
}

function cleanQuery(message) {
  return message
    .replace(/^أنا\s+(مدير عام|مدير مالي|مدير مشروع|محاسب)\.\s*/i, '')
    .trim();
}

const QUERY_STOP_WORDS = new Set([
  'تقرير', 'مشروع', 'اعرض', 'عرض', 'حسب', 'عملة', 'ال', 'في', 'من', 'على', 'مع',
  'و', 'او', 'أو', 'انا', 'أنا', 'مدير', 'عام', 'مالي', 'محاسب', 'بعملة', 'بالدولار',
  'بالدينار', 'دينار', 'دنانير', 'بالدنانير', 'دولار', 'عراقي',
  'usd', 'iqd', 'الصافي', 'القيمه', 'القيمة', 'بين', 'جميع', 'كل', 'هذا', 'هذه', 'عن',
  'اريد', 'أريد', 'اعطني', 'أعطني', 'كم', 'ما', 'هل', 'للمشروع', 'لشركة', 'الشركه', 'الشركة',
]);

/** مرادفات عربي ↔ إنجليزي — تُوسَّع تلقائياً من أسماء المشاريع */
const CROSS_LANG_ALIASES = {
  كربلاء: ['karbala', 'karbalaa', 'كربلا'],
  karbala: ['كربلاء', 'كربلا'],
  pip: ['karbala pip', 'كربلا pip'],
  واحه: ['waha', 'al-waha', 'alwaha', 'oasis', 'الواحه', 'الواحة'],
  waha: ['واحة', 'الواحة', 'al-waha'],
  'al-waha': ['واحة', 'الواحة', 'waha'],
  غراف: ['graph', 'algharaf', 'الغراف', 'al gharaf'],
  algharaf: ['غراف', 'الغراف', 'graph'],
  زيونه: ['zayona', 'zayouna', 'بناء زيونة', 'زيونة'],
  فيلا: ['villa', 'فيلا العمارة', 'العمارة'],
  chemical: ['كيميائي', 'مستودع', 'warehouse'],
  warehouse: ['مستودع', 'chemical'],
  power: ['باور', 'طاقة', 'كهرباء'],
  diesel: ['ديزل'],
  generator: ['مولد', 'مولدات'],
  ohtl: ['خط', 'نقل', 'ترقية'],
  upgrade: ['ترقية', 'تطوير', 'ohtl'],
  fsf: ['fsf', 'epcc'],
  epcc: ['fsf', 'epcc'],
  lighting: ['اناره', 'إنارة', 'انارة'],
  esp: ['esp', 'مضخة'],
  pump: ['مضخة', 'pump'],
  well: ['بئر', 'well', 'pad'],
  pad: ['منصة', 'well pad'],
  provision: ['توفير', 'provision'],
  single: ['single', 'مصدر'],
  source: ['مصدر', 'single'],
  ebs: ['ebs'],
  camp: ['مخيم', 'camp'],
  station: ['محطة', 'station'],
};

function normalizeForSearch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\w\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandAliases(term) {
  const aliases = new Set();
  const n = normalizeForSearch(term);
  if (!n) return [];
  aliases.add(n);
  if (CROSS_LANG_ALIASES[n]) {
    CROSS_LANG_ALIASES[n].forEach(a => aliases.add(normalizeForSearch(a)));
  }
  for (const [key, vals] of Object.entries(CROSS_LANG_ALIASES)) {
    const keyN = normalizeForSearch(key);
    if (n === keyN || n.includes(keyN) || keyN.includes(n)) {
      aliases.add(keyN);
      vals.forEach(v => aliases.add(normalizeForSearch(v)));
    }
    for (const v of vals) {
      const vN = normalizeForSearch(v);
      if (n === vN || n.includes(vN) || vN.includes(n)) {
        aliases.add(keyN);
        aliases.add(vN);
      }
    }
  }
  return [...aliases];
}

function extractQueryTokens(query) {
  let q = normalizeForSearch(cleanQuery(query));
  q = q.replace(/^(انا\s+)?(مدير عام|مدير مالي|مدير مشروع|محاسب)\s*/g, '');
  q = q.replace(/\b(تقرير|مشروع|اعرض|عرض|قارن|مقارنه|مقارنة|بين|جميع|كل|حسب|عمله|عملة|المشروع|الشركه|الشركة|للمشروع)\b/g, ' ');
  return q.split(/\s+/).filter(t => t.length >= 2 && !QUERY_STOP_WORDS.has(t));
}

function buildProjectSearchTerms(project) {
  const terms = new Set();
  const addRaw = (s) => {
    if (!s) return;
    const n = normalizeForSearch(s);
    if (n.length >= 2) terms.add(n);
    expandAliases(n).forEach(a => terms.add(a));
    n.split(/\s+/).forEach(t => {
      if (t.length >= 2) {
        terms.add(t);
        expandAliases(t).forEach(a => terms.add(a));
      }
    });
  };
  addRaw(project.code);
  addRaw(project.name);
  String(project.name).split(/[\s\-_/،]+/).forEach(addRaw);
  String(project.code).split(/[\s\-_/]+/).forEach(addRaw);
  return [...terms];
}

function getProjectIndex(records) {
  return getAllProjects(records).map(p => ({
    ...p,
    terms: buildProjectSearchTerms(p),
  }));
}

function detectRecordType(query) {
  const q = normalizeForSearch(query);
  if (/المقاولين|مقاولين|مقاول/.test(q)) return 'المقاوليين';
  if (/المجهزين|مجهزين|مجهز/.test(q)) return 'المجهزيين';
  if (/الموردين|موردين|مورد/.test(q)) return 'الموردين';
  if (/الالتزامات|التزامات|التزام|المستحقات|مستحقات/.test(q)) return 'الالتزامات';
  if (/الخدمات|خدمات/.test(q)) return 'خدمات';
  // «مصاريف» و«تكاليف» كلاهما = كل التكاليف (المصاريف + الخدمات) لتطابق تقرير المشروع/الشركة
  if (/المصاريف|مصاريف|التكاليف|تكاليف|مصروفات|المصروفات/.test(q)) return 'تكاليف';
  if (/الحجوزات|حجز/.test(q)) return 'حجز';
  if (/مزاد|فرق عمل/.test(q)) return 'مزاد';
  if (/الايراد|الإيراد|ايراد|إيراد|ايرادات|إيرادات/.test(q)) return 'ايراد';
  return null;
}

const RECORD_TYPE_LABEL = {
  ايراد: 'ايراد',
  المصاريف: 'المصاريف',
  خدمات: 'خدمات',
  حجز: 'حجز',
  المقاوليين: 'المقاوليين',
  المجهزيين: 'المجهزيين',
  الموردين: 'المقاوليين/المجهزيين/الموردين',
  الالتزامات: 'الالتزامات (مقاولون/مجهزون/موردون)',
  مزاد: 'مزاد',
  تكاليف: 'المصاريف + خدمات',
};

const OBLIGATION_TYPES = ['المقاوليين', 'المجهزيين', 'الموردين', 'الالتزامات'];

function filterByRecordType(records, typeKey) {
  if (!typeKey) return records;
  if (typeKey === 'تكاليف') {
    return records.filter(r => r.recordType === 'المصاريف' || r.recordType === 'خدمات');
  }
  if (typeKey === 'الالتزامات') {
    return records.filter(r => classifyRecord(r) === 'contractor');
  }
  if (typeKey === 'الموردين') {
    return records.filter(r => OBLIGATION_TYPES.includes(r.recordType));
  }
  return records.filter(r => r.recordType === typeKey);
}

function recordTypeMeaning(typeKey, net) {
  switch (typeKey) {
    case 'ايراد': return `إيراد ${formatUSD(Math.abs(net))}`;
    case 'المصاريف':
    case 'خدمات':
    case 'تكاليف': return net >= 0 ? 'مصروف مدفوع' : 'مرتجع/خصم';
    case 'حجز': return 'حجز ضمان (منفصل عن الإيراد)';
    case 'المقاوليين':
    case 'المجهزيين':
    case 'الموردين':
    case 'الالتزامات':
      if (net > 0) return 'مصروف لم يُدفع بعد';
      if (net < 0) return 'أعمال/توريد ستُقدَّم لاحقاً';
      return 'متوازن';
    case 'مزاد':
      if (net < 0) return 'ربح فرق عملة';
      if (net > 0) return 'خسارة فرق عملة';
      return 'متوازن';
    default: return '—';
  }
}

function sumRecordTypeRows(records, typeKey) {
  const filtered = filterByRecordType(records, typeKey);
  let netUsd = 0;
  let netLocal = 0;
  for (const r of filtered) {
    if (typeKey === 'ايراد') {
      netUsd += Math.abs(r.net);
      netLocal += localVal(r);
    } else {
      netUsd += r.net;
      netLocal += r.net >= 0 ? localVal(r) : -localVal(r);
    }
  }
  return { filtered, count: filtered.length, netUsd, netLocal };
}

function detectRecordTypeQuery(query, records) {
  const type = detectRecordType(query);
  if (!type) return null;

  const scopeAll = /كل المشاريع|جميع المشاريع|لكل المشاريع|كل مشروع|على مستوى الشركة|مشاريع الشركة|كل المشروع/.test(query);

  let project = null;
  let ambiguous = false;
  let candidates = [];

  if (records && !scopeAll) {
    const res = resolveProjectQuery(records, query);
    if (res.status === 'unique') project = res.project;
    else if (res.status === 'ambiguous') {
      ambiguous = true;
      candidates = res.candidates;
    }
  }

  return {
    type,
    label: RECORD_TYPE_LABEL[type] || type,
    project,
    scopeAll: scopeAll || (!project && !ambiguous),
    ambiguous,
    candidates,
  };
}

const EXPENSE_GENERIC_TERMS = new Set([
  'مصاريف', 'مصروف', 'مصروفات', 'تكاليف', 'المصاريف', 'خدمات', 'الخدمات',
  'مصروفات', 'مدفوع', 'مجموعه', 'مجموعة', 'بند', 'نوع', 'السجل', 'حساب',
]);

function getExpenseRecords(records) {
  return records.filter(r => classifyRecord(r) === 'expense');
}

function getAllExpenseGroups(records) {
  const map = new Map();
  for (const r of getExpenseRecords(records)) {
    const name = (r.group || '').trim();
    if (!name) continue;
    if (!map.has(name)) map.set(name, { name, recordCount: 0 });
    map.get(name).recordCount++;
  }
  return [...map.values()];
}

function expenseGroupSpecificTokens(groupName) {
  return normalizeForSearch(groupName)
    .split(/\s+/)
    .filter(t => t.length >= 2 && !EXPENSE_GENERIC_TERMS.has(t));
}

function scoreExpenseGroupMatch(groupName, query) {
  const groupN = normalizeForSearch(groupName);
  const qNorm = normalizeForSearch(cleanQuery(query));
  const tokens = extractQueryTokens(query).filter(t => !EXPENSE_GENERIC_TERMS.has(t));
  let score = 0;

  if (groupN && qNorm.includes(groupN)) score += 55;

  const groupTokens = expenseGroupSpecificTokens(groupName);
  if (groupTokens.length) {
    const matched = groupTokens.filter(t => qNorm.includes(t));
    if (matched.length === groupTokens.length) score += 45;
    else if (matched.length) score += matched.length * 16;
  }

  for (const token of tokens) {
    if (token.length < 2) continue;
    if (groupN === token) score += 28;
    else if (groupN.includes(token)) score += token.length >= 3 ? 18 : 10;
    else if (token.length >= 4 && groupN.split(/\s+/).some(w => w.startsWith(token) || w === token)) {
      score += 14;
    }
  }

  const phrase = tokens.filter(t => t.length >= 2).join(' ');
  if (phrase.length >= 5 && groupN.includes(phrase)) score += 38;

  return score;
}

function findMatchingExpenseGroups(records, query) {
  return getAllExpenseGroups(records)
    .map(g => ({ ...g, score: scoreExpenseGroupMatch(g.name, query) }))
    .filter(g => g.score >= 12)
    .sort((a, b) => b.score - a.score);
}

function scoreExpenseAccountMatch(accountName, query, groupName) {
  const accN = normalizeForSearch(accountName);
  const qNorm = normalizeForSearch(cleanQuery(query));
  const tokens = extractQueryTokens(query).filter(t => !EXPENSE_GENERIC_TERMS.has(t));
  let score = 0;

  if (accN && qNorm.includes(accN)) score += 50;
  for (const token of tokens) {
    if (token.length >= 3 && accN.includes(token)) score += 15;
  }
  if (groupName && normalizeForSearch(groupName).split(/\s+/).some(t => accN.includes(t))) {
    score -= 5;
  }
  return score;
}

function findMatchingExpenseAccounts(records, query, groupName, project = null) {
  const groupNorm = normalizeForSearch(groupName);
  let scoped = getExpenseRecords(records).filter(r => normalizeForSearch(r.group) === groupNorm);
  if (project) scoped = filterByProject(scoped, project);
  const groupN = normalizeForSearch(groupName);
  const accounts = new Map();
  for (const r of scoped) {
    const name = (r.accountName || '').trim();
    if (!name) continue;
    if (!accounts.has(name)) accounts.set(name, { name, code: (r.accountCode || '').trim(), score: 0 });
    const entry = accounts.get(name);
    if (!entry.code && r.accountCode) entry.code = String(r.accountCode).trim();
    entry.score = Math.max(entry.score, scoreExpenseAccountMatch(name, query, groupName));
  }
  const qNorm = normalizeForSearch(cleanQuery(query));
  const codeNums = qNorm.match(/\d{2,}/g) || [];
  return [...accounts.values()]
    .filter(a => {
      const accN = normalizeForSearch(a.name);
      const codeHit = a.code && codeNums.includes(normalizeForSearch(a.code));
      if (codeHit) return true;
      // اسم حساب متضمَّن في اسم المجموعة (مثل "مصاريف الرواتب" داخل
      // "مصاريف الرواتب والاجور"): ذكره في السؤال يعني المجموعة لا الحساب الفرعي
      if (groupN.includes(accN)) return false;
      return a.score >= 18 && accN.length >= 3 && qNorm.includes(accN);
    })
    .sort((a, b) => b.score - a.score);
}

function filterByExpenseGroup(records, groupName) {
  const target = normalizeForSearch(groupName);
  return getExpenseRecords(records).filter(r => normalizeForSearch(r.group) === target);
}

function sumExpenseGroupRows(records, groupName, accountName = null) {
  let filtered = filterByExpenseGroup(records, groupName);
  if (accountName) {
    const accTarget = normalizeForSearch(accountName);
    filtered = filtered.filter(r => normalizeForSearch(r.accountName) === accTarget);
  }
  let netUsd = 0;
  let netLocal = 0;
  for (const r of filtered) {
    netUsd += r.net;
    netLocal += r.net >= 0 ? localVal(r) : -localVal(r);
  }
  return { filtered, count: filtered.length, netUsd, netLocal };
}

function detectExpenseGroupQuery(query, records) {
  if (!records?.length) return null;

  const matches = findMatchingExpenseGroups(records, query);
  if (!matches.length) return null;

  const top = matches[0];
  const second = matches[1];
  const specificTokens = extractQueryTokens(query).filter(t => !EXPENSE_GENERIC_TERMS.has(t));
  const groupN = normalizeForSearch(top.name);
  const qNorm = normalizeForSearch(cleanQuery(query));
  const fullGroupInQuery = groupN.length >= 4 && qNorm.includes(groupN);
  const groupSpecific = expenseGroupSpecificTokens(top.name);
  const matchedSpecific = groupSpecific.filter(t => qNorm.includes(t));
  const hasSpecificity = specificTokens.length > 0 && (
    fullGroupInQuery ||
    matchedSpecific.length >= 1 ||
    top.score >= 20
  );

  if (!hasSpecificity) return null;

  const scopeAll = /كل المشاريع|جميع المشاريع|لكل المشاريع|كل مشروع|على مستوى الشركة|مشاريع الشركة/.test(query);

  let project = null;
  let projectAmbiguous = false;
  let projectCandidates = [];

  if (records && !scopeAll) {
    const res = resolveProjectQuery(records, query);
    if (res.status === 'unique') project = res.project;
    else if (res.status === 'ambiguous') {
      projectAmbiguous = true;
      projectCandidates = res.candidates;
    }
  }

  const groupAmbiguous = Boolean(
    second &&
    top.score - second.score < 12 &&
    second.score >= top.score * 0.75 &&
    top.score < 50
  );

  const accountMatches = findMatchingExpenseAccounts(records, query, top.name, project);
  const account = accountMatches[0] || null;

  return {
    group: top,
    account,
    project,
    scopeAll: scopeAll || (!project && !projectAmbiguous),
    groupAmbiguous,
    groupCandidates: groupAmbiguous ? matches.slice(0, 5) : [],
    projectAmbiguous,
    projectCandidates,
  };
}

function buildExpenseGroupDisambiguationTable(records, candidates) {
  const curL = currencyLabel();
  return {
    title: 'مجموعات مصاريف متشابهة — يرجى التحديد',
    headers: ['#', 'المجموعة (الحساب الاب)', 'عدد السجلات', `الإجمالي (${curL})`, 'تطابق السؤال'],
    rows: candidates.map((g, i) => {
      const s = sumExpenseGroupRows(records, g.name);
      return [
        String(i + 1),
        g.name,
        String(s.count),
        money(s.netUsd, s.netLocal),
        i === 0 ? `الأقرب (درجة ${g.score})` : `متشابه (درجة ${g.score})`,
      ];
    }),
  };
}

function buildExpenseGroupByProjectTable(records, groupName) {
  const projects = getAllProjects(records);
  const rows = projects.map(p => {
    const scoped = filterByProject(records, p);
    const s = sumExpenseGroupRows(scoped, groupName);
    if (!s.count) return null;
    const a = analyzeProjectRecords(scoped);
    const pct = a.totalCosts > 0 ? (s.netUsd / a.totalCosts) * 100 : 0;
    return [
      p.name,
      p.code,
      String(s.count),
      money(s.netUsd, s.netLocal),
      pct.toFixed(1) + '%',
    ];
  }).filter(Boolean);

  const total = sumExpenseGroupRows(records, groupName);
  rows.push([
    'الإجمالي',
    '—',
    String(total.count),
    money(total.netUsd, total.netLocal),
    '—',
  ]);

  return {
    title: `مجموعة المصروف: ${groupName} — حسب المشروع`,
    headers: ['المشروع', 'الكود', 'عدد السجلات', `المبلغ (${currencyLabel()})`, '% من تكاليف المشروع'],
    rows,
  };
}

function buildExpenseGroupReport(records, expenseGroupQ) {
  const { group, account, project, scopeAll, groupAmbiguous, groupCandidates, projectAmbiguous, projectCandidates } = expenseGroupQ;
  let out = `## مجموعة المصروف: **${group.name}** — محسوب مسبقاً\n\n`;

  if (groupAmbiguous) {
    out += `⚠️ مجموعات متشابهة: ${groupCandidates.map(g => g.name).join(' | ')}\n`;
    out += 'حدّد اسم المجموعة بدقة (مثل: مصاريف الفحص والاختبار).\n';
    return out;
  }

  if (projectAmbiguous) {
    out += `⚠️ مشاريع متشابهة: ${projectCandidates.map(p => p.name).join(' | ')}\n`;
    out += 'حدّد المشروع بالكود أو الاسم الكامل.\n';
    return out;
  }

  const scopeRecords = project ? filterByProject(records, project) : records;
  const summary = sumExpenseGroupRows(scopeRecords, group.name, account?.name);
  const scopeLabel = project
    ? `مشروع: ${project.name} (${project.code})`
    : 'كل المشاريع';
  const curL = currencyLabel();

  out += `**النطاق:** ${scopeLabel}\n`;
  out += `**المجموعة (الحساب الاب):** ${group.name}\n`;
  if (account) out += `**الحساب الفرعي:** ${account.name}\n`;
  out += `**عدد السجلات:** ${summary.count}\n`;
  out += `**المجموع (${curL}):** ${money(summary.netUsd, summary.netLocal)}\n`;
  out += `**المعنى:** ${recordTypeMeaning('المصاريف', summary.netUsd)}\n\n`;

  if (!summary.count) {
    out += `⚠️ لا توجد سجلات في مجموعة "${group.name}"${project ? ` للمشروع ${project.name}` : ''}.\n`;
    return out;
  }

  if (scopeAll && !project) {
    out += `**[ ملخص حسب المشروع ]**\n`;
    out += `| المشروع | عدد | ${curL} | % من تكاليف المشروع |\n|---------|-----|-----|---------------------|\n`;
    for (const p of getAllProjects(records)) {
      const scoped = filterByProject(records, p);
      const s = sumExpenseGroupRows(scoped, group.name, account?.name);
      if (!s.count) continue;
      const a = analyzeProjectRecords(scoped);
      const pct = a.totalCosts > 0 ? ((s.netUsd / a.totalCosts) * 100).toFixed(1) : '—';
      out += `| ${p.name} | ${s.count} | ${money(s.netUsd, s.netLocal)} | ${pct}% |\n`;
    }
    out += '\n';
  }

  if (!account) {
    const byAccount = new Map();
    for (const r of summary.filtered) {
      const cur = byAccount.get(r.accountName) || { usd: 0, iqd: 0 };
      cur.usd += r.net;
      cur.iqd += r.net * recordRate(r);
      byAccount.set(r.accountName, cur);
    }
    if (byAccount.size > 1) {
      out += `**[ حسب الحساب الفرعي ]**\n`;
      for (const [name, v] of [...byAccount.entries()].sort((a, b) => Math.abs(b[1].usd) - Math.abs(a[1].usd))) {
        out += `- ${name}: ${money(v.usd, v.iqd)}\n`;
      }
      out += '\n';
    }
  }

  if (project && summary.count) {
    const a = analyzeProjectRecords(scopeRecords);
    const pct = a.totalCosts > 0 ? ((summary.netUsd / a.totalCosts) * 100).toFixed(1) : '—';
    out += `**نسبة من إجمالي تكاليف المشروع:** ${pct}%\n\n`;
  }

  return out;
}

function detectIntent(query, records) {
  const q = query.toLowerCase();
  const accountQ = records?.length ? detectAccountQuery(query, records) : null;
  // تطابق حساب قوي وواضح — يتقدّم على تخمين "الشركة" العام (كثير من أسماء الموردين تبدأ بـ "شركة")
  const strongAccount = Boolean(accountQ?.account && !accountQ.ambiguous && accountQ.account.score >= 55);

  if (/إجمالي|كاملاً|كاملا|الشركة|ملخص الشركة|تقرير الشركة/.test(q) && !detectRecordType(query) && !strongAccount) {
    return 'company';
  }
  if (/قارن|مقارنة|هامش|ترتيب|مقارنة بين/.test(q) && !detectRecordType(query)) return 'comparison';
  // أنواع سجلات صريحة (التزامات/مقاولون/مجهزون/موردون/ايراد/حجز/مزاد/خدمات)
  // تتقدّم على تخمين "مجموعة المصروف"؛ أما "مصاريف/تكاليف" العامة فتترك الأولوية للمجموعة المحددة
  const rtype = detectRecordType(query);
  const strongType = rtype && !['المصاريف', 'تكاليف'].includes(rtype);
  if (strongType) {
    const typeQStrong = detectRecordTypeQuery(query, records);
    if (typeQStrong?.type) return 'record_type';
  }
  const expenseGroupQ = records?.length ? detectExpenseGroupQuery(query, records) : null;
  if (expenseGroupQ?.group) return 'expense_group';
  const typeQ = detectRecordTypeQuery(query, records);
  if (typeQ?.type) return 'record_type';
  if (/مقاول|مورد|مجهز/.test(q)) return 'contractor';
  if (accountQ?.account) return 'account';
  if (/بلا إيراد|لا إيراد|بدون إيراد|لا تحتوي.*ايراد|مشاريع.*إيراد/.test(q)) return 'no_revenue';
  if (records) {
    const matched = findMatchingProjects(records, query);
    if (matched.length) return 'project';
  }
  if (/تقرير|مشروع/.test(q)) return 'project';
  return 'general';
}

function getAllProjects(records) {
  const map = new Map();
  for (const r of records) {
    const key = r.projectName || r.projectCode;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { name: r.projectName, code: r.projectCode });
    }
  }
  return [...map.values()];
}

/**
 * يوزّع كل سجل على مشروع واحد فقط حسب هويته الفعلية (اسم/كود المشروع).
 * ضروري للتقارير الإجمالية (الشركة/المقارنة) لتفادي ازدواج العدّ الناتج عن
 * المطابقة الجزئية في filterByProject (مثال: سجل "Karbala PIP" يطابق أيضاً مشروع "Karbala").
 */
function groupRecordsByProject(records) {
  const map = new Map();
  for (const r of records) {
    const key = r.projectName || r.projectCode;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { project: { name: r.projectName, code: r.projectCode }, records: [] });
    }
    map.get(key).records.push(r);
  }
  return [...map.values()];
}

function scoreProjectMatch(project, query, indexEntry) {
  const tokens = extractQueryTokens(query);
  const qNorm = normalizeForSearch(cleanQuery(query));
  const nameN = normalizeForSearch(project.name);
  const codeN = normalizeForSearch(project.code);
  const terms = indexEntry?.terms || buildProjectSearchTerms(project);
  let score = 0;

  const nums = qNorm.match(/\d{2,4}/g) || [];
  for (const n of nums) {
    if (codeN.includes(n) || nameN.includes(n)) score += 18;
  }

  for (const y of extractYearHints(query)) {
    if (projectContainsYear(project, y)) score += 35;
  }

  for (const token of tokens) {
    const aliases = expandAliases(token);
    for (const alias of aliases) {
      if (alias.length < 2) continue;
      if (nameN === alias || codeN === alias) score += 25;
      else if (nameN.includes(alias) || codeN.includes(alias)) score += 14;
      else if (alias.includes(nameN) && nameN.length >= 3) score += 12;

      for (const term of terms) {
        if (term === alias) score += 22;
        else if (term.includes(alias) || alias.includes(term)) {
          score += Math.min(15, alias.length + 2);
        }
      }
    }
  }

  if (codeN && qNorm.includes(codeN)) score += 16;
  if (nameN.length >= 4 && qNorm.includes(nameN)) score += 14;

  // تفضيل التطابق التام للاسم/الكود على التطابق الجزئي
  for (const token of tokens) {
    for (const alias of expandAliases(token)) {
      if (nameN === alias || codeN === alias) score += 20;
      // اسم مشروع ككلمة واحدة أولى عن اسم مركّب (مثل Karbala مقابل Karbala PIP)
      if (nameN === alias && !nameN.includes(' ')) score += 25;
    }
  }

  // تطابق كامل للاسم كما في السؤال
  const queryCore = normalizeForSearch(extractQueryTokens(query).join(' '));
  if (queryCore && (nameN === queryCore || codeN === queryCore)) score += 45;

  return score;
}

function extractYearHints(query) {
  const q = cleanQuery(query);
  const hints = new Set();
  (q.match(/\b20\d{2}\b/g) || []).forEach(y => hints.add(y));
  (q.match(/(?:^|[\s\-/])(\d{2})(?:\s|$|[^\d])/g) || []).forEach(m => {
    const d = m.replace(/\D/g, '');
    if (d.length === 2) hints.add('20' + d);
  });
  (q.match(/\b\d{2,4}\b/g) || []).forEach(n => {
    if (n.length === 4 && n.startsWith('20')) hints.add(n);
    if (n.length === 2) hints.add('20' + n);
  });
  return [...hints];
}

function sharedProjectStem(p1, p2) {
  const n1 = normalizeForSearch(p1.name);
  const n2 = normalizeForSearch(p2.name);
  const c1 = normalizeForSearch(p1.code);
  const c2 = normalizeForSearch(p2.code);

  if (n1 && n2 && (n1.includes(n2) || n2.includes(n1))) return true;
  if (c1 && c2 && c1.length >= 2 && c2.length >= 2 && (c1.includes(c2) || c2.includes(c1))) return true;

  const GENERIC = new Set([
    'provision', 'of', 'the', 'project', 'مشروع', 'upgrade', 'epcc', 'fsf', 'for', 'and',
    'no', 'camp', 'power', 'station', 'single', 'source',
  ]);
  const tokens = (s) => s.split(/\s+/).filter(t => t.length >= 3 && !GENERIC.has(t));
  const t1 = tokens(n1);
  const t2 = tokens(n2);
  const shared = t1.filter(t => t2.includes(t));
  return shared.length >= 1;
}

function extractProjectNumbers(query) {
  const qNorm = normalizeForSearch(cleanQuery(query));
  const yearSet = new Set(extractYearHints(query).flatMap(y => [y, y.length === 4 ? y.slice(2) : y]));
  return (qNorm.match(/\d{2,4}/g) || []).filter(n => {
    if (yearSet.has(n)) return false;
    if (n.length === 4 && n.startsWith('20')) return false;
    return true;
  });
}

function matchesAllKeyMarkers(query, project) {
  const years = extractYearHints(query);
  const nums = extractProjectNumbers(query);
  if (!years.length && !nums.length) return true;
  const nameN = normalizeForSearch(project.name);
  const codeN = normalizeForSearch(project.code);
  const yearsOk = !years.length || years.every(y => projectContainsYear(project, y));
  const numsOk = !nums.length || nums.every(n => nameN.includes(n) || codeN.includes(n));
  return yearsOk && numsOk;
}

function projectContainsYear(project, year) {
  const nameN = normalizeForSearch(project.name);
  const codeN = normalizeForSearch(project.code);
  if (year.length === 4) {
    if (nameN.includes(year) || codeN.includes(year)) return true;
    const short = year.slice(2);
    const re = new RegExp(`(?:^|[\\s\\-/])${short}(?:$|[\\s\\-/])`);
    return re.test(nameN) || re.test(codeN);
  }
  return nameN.includes(year) || codeN.includes(year);
}

function hasDistinctQueryMarker(query, top, second) {
  const qNorm = normalizeForSearch(cleanQuery(query));
  const topName = normalizeForSearch(top.name);
  const topCode = normalizeForSearch(top.code);
  const secName = normalizeForSearch(second.name);
  const secCode = normalizeForSearch(second.code);

  if (sharedProjectStem(top, second)) {
    const years = extractYearHints(query);
    const nums = (qNorm.match(/\d{2,4}/g) || []).filter(n => n.length >= 2);
    if (years.length && nums.length) {
      const topHasAll = years.every(y => projectContainsYear(top, y)) &&
        nums.some(n => topName.includes(n) || topCode.includes(n));
      const secHasAll = years.every(y => projectContainsYear(second, y)) &&
        nums.some(n => secName.includes(n) || secCode.includes(n));
      if (topHasAll && !secHasAll) return true;
    }
  }

  for (const y of extractYearHints(query)) {
    const inTop = projectContainsYear(top, y);
    const inSec = projectContainsYear(second, y);
    if (inTop && !inSec) return true;
  }

  if (topCode.length >= 3 && qNorm.includes(topCode) && topCode !== secCode && !qNorm.includes(secCode)) {
    return true;
  }

  const tokens = extractQueryTokens(query);
  for (const token of tokens) {
    for (const alias of expandAliases(token)) {
      if (alias.length < 3) continue;
      const hitsTop = topName === alias || topCode === alias;
      const hitsSec = secName === alias || secCode === alias;
      if (hitsTop && hitsSec) continue;
      if (hitsTop && !hitsSec) {
        if (secName.startsWith(alias + ' ') || secName.includes(' ' + alias)) continue;
        return true;
      }
    }
    if (topName === normalizeForSearch(token) && topName !== secName &&
        !secName.startsWith(topName + ' ') && !sharedProjectStem(top, second)) {
      return true;
    }
  }

  return false;
}

function resolveProjectQuery(records, query) {
  const matches = findMatchingProjects(records, query);
  if (!matches.length) {
    return { status: 'none', matches, query };
  }

  const strictMatches = matches.filter(m => matchesAllKeyMarkers(query, m));
  if (strictMatches.length === 1) {
    return { status: 'unique', project: strictMatches[0], matches, query };
  }

  const pool = strictMatches.length > 1 ? strictMatches : matches;
  if (pool.length === 1) {
    return { status: 'unique', project: pool[0], matches, query };
  }

  const top = pool[0];
  const second = pool[1];
  const scoreGap = top.score - second.score;

  if (hasDistinctQueryMarker(query, top, second) && scoreGap >= 8) {
    return { status: 'unique', project: top, matches, query };
  }

  const closeCandidates = pool.filter(m => top.score - m.score <= 45);
  const similarGroup = closeCandidates.filter((p, i) =>
    i === 0 || closeCandidates.slice(0, i).some(prev => sharedProjectStem(p, prev))
  );

  const stemWithSecond = sharedProjectStem(top, second);
  const ambiguousBySimilarity = similarGroup.length > 1 ||
    (stemWithSecond && second.score >= 90 && scoreGap < 80);

  const ambiguousByScore = scoreGap < 35 && ratioSafe(top.score, second.score) > 0.72;

  if (ambiguousBySimilarity && (ambiguousByScore || stemWithSecond)) {
    const group = stemWithSecond
      ? pool.filter(m => top.score - m.score <= 80 && sharedProjectStem(top, m)).slice(0, 5)
      : similarGroup.slice(0, 5);
    return {
      status: 'ambiguous',
      candidates: group.length > 1 ? group : similarGroup.slice(0, 5),
      matches,
      query,
      reason: 'يوجد تشابه بين أسماء المشاريع — يلزم تحديد المشروع بدقة (الكود، السنة، أو الاسم الكامل)',
    };
  }

  if (scoreGap >= 40 && !stemWithSecond) {
    return { status: 'unique', project: top, matches, query };
  }

  if (similarGroup.length > 1 && scoreGap < 50) {
    return {
      status: 'ambiguous',
      candidates: similarGroup.slice(0, 5),
      matches,
      query,
      reason: 'يوجد تشابه بين أسماء المشاريع — يلزم تحديد المشروع بدقة (الكود، السنة، أو الاسم الكامل)',
    };
  }

  return { status: 'unique', project: top, matches, query };
}

function ratioSafe(top, second) {
  if (!top) return 0;
  return second / top;
}

function buildDisambiguationTable(records, candidates) {
  const curL = currencyLabel();
  return {
    title: 'مشاريع متشابهة — يرجى التحديد',
    headers: ['#', 'المشروع', 'الكود', `الإيراد (${curL})`, `التكاليف (${curL})`, 'تطابق السؤال'],
    rows: candidates.map((p, i) => {
      const a = analyzeProjectRecords(filterByProject(records, p));
      return [
        String(i + 1),
        p.name,
        p.code,
        money(a.revenue, a.revenueLocal),
        money(a.totalCosts, a.totalCostsLocal),
        i === 0 ? `الأقرب (درجة ${p.score})` : `متشابه (درجة ${p.score})`,
      ];
    }),
  };
}

function findMatchingProjects(records, query) {
  const index = getProjectIndex(records);
  let results = index
    .map(entry => ({ ...entry, score: scoreProjectMatch(entry, query, entry) }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!results.length) {
    const tokens = extractQueryTokens(query);
    if (tokens.length) {
      results = index
        .map(entry => {
          let score = 0;
          const nameN = normalizeForSearch(entry.name);
          const codeN = normalizeForSearch(entry.code);
          for (const token of tokens) {
            for (const alias of expandAliases(token)) {
              if (alias.length >= 3) {
                if (nameN.startsWith(alias) || codeN.startsWith(alias)) score += 6;
                if (nameN.includes(alias) || codeN.includes(alias)) score += 4;
              }
            }
          }
          return { ...entry, score };
        })
        .filter(p => p.score > 0)
        .sort((a, b) => b.score - a.score);
    }
  }

  return results.map(({ name, code, score }) => ({ name, code, score }));
}

function describeProjectMatch(project, query) {
  const tokens = extractQueryTokens(query);
  const nameN = normalizeForSearch(project.name);
  const codeN = normalizeForSearch(project.code);
  const hits = [];

  for (const token of tokens) {
    const aliases = expandAliases(token);
    const matched = aliases.some(a =>
      nameN.includes(a) || codeN.includes(a) ||
      project.terms?.some(t => t === a || t.includes(a) || a.includes(t))
    );
    if (matched && !hits.includes(token)) hits.push(token);
  }

  if (!hits.length) return '';
  const used = hits.join('، ');
  const isArabicQuery = /[\u0600-\u06FF]/.test(used);
  const isEnglishName = /^[a-z0-9\s\-]+$/i.test(project.name.trim());
  if (isArabicQuery && isEnglishName) {
    return `(تم التعرف على المشروع "${project.name}" من كلمتك "${used}")`;
  }
  if (!isArabicQuery && /[\u0600-\u06FF]/.test(project.name)) {
    return `(تم التعرف على المشروع "${project.name}" من كلمتك "${used}")`;
  }
  return `(تم التعرف على المشروع من: ${used})`;
}

function filterByProject(records, project) {
  if (!project) return records;
  // مطابقة دقيقة بنفس مفتاح getAllProjects/groupRecordsByProject (اسم المشروع أو كوده)
  // تجنّباً للمطابقة الجزئية التي تُدرج سجلات مشروع داخل مشروع آخر يحمل اسماً متضمَّناً
  // (مثال: سجلات "Karbala PIP" كانت تُطابق أيضاً مشروع "Karbala").
  const key = project.name || project.code;
  return records.filter(r => (r.projectName || r.projectCode) === key);
}

function analyzeProjectRecords(records) {
  let revenue = 0;
  let revenueLocal = 0;
  let reservation = 0;
  let reservationLocal = 0;
  let expenses = 0;
  let expensesLocal = 0;
  let expenseServices = 0;
  let auctionNet = 0;
  const expenseGroups = new Map();
  const expenseGroupsLocal = new Map();
  const contractors = new Map();
  const alerts = [];
  const currency = dominantCurrency(records);

  for (const r of records) {
    const cls = classifyRecord(r);
    // قيمة دينار موقّعة بنفس إشارة الدولار — استخدام القيمة المطلقة كان يضخّم
    // مجاميع الدينار عند وجود سجلات سالبة (مرتجعات/خصومات)
    const localSigned = r.net * recordRate(r);

    switch (cls) {
      case 'revenue':
        revenue += Math.abs(r.net);
        revenueLocal += Math.abs(localSigned);
        break;
      case 'reservation':
        reservation += r.net;
        reservationLocal += localSigned;
        break;
      case 'expense':
        expenses += r.net;
        expensesLocal += localSigned;
        if (r.recordType === 'خدمات') expenseServices += r.net;
        expenseGroups.set(r.group, (expenseGroups.get(r.group) || 0) + r.net);
        expenseGroupsLocal.set(r.group, (expenseGroupsLocal.get(r.group) || 0) + localSigned);
        break;
      case 'auction':
        auctionNet += r.net;
        break;
      case 'contractor': {
        const key = r.accountName;
        if (!contractors.has(key)) {
          contractors.set(key, { name: key, net: 0, netLocal: 0, projects: new Set() });
        }
        const c = contractors.get(key);
        c.net += r.net;
        c.netLocal += r.net * recordRate(r);
        c.projects.add(r.projectName);
        break;
      }
      default:
        break;
    }
  }

  const totalCosts = expenses;
  const received = revenue - reservation;
  const profit = revenue - totalCosts;
  const margin = revenue > 0 ? (profit / revenue) * 100 : null;

  if (revenue > 0 && totalCosts / revenue > 0.85) {
    alerts.push('تكاليف > 85% من الإيراد');
  }
  if (reservation > 0 && revenue > 0 && reservation / revenue > 0.15) {
    alerts.push('حجز > 15% من الإيراد');
  }
  for (const [, c] of contractors) {
    if (c.net > 50000) alerts.push(`مصروف مستحق غير مدفوع كبير: ${c.name}`);
    if (c.net < -50000) alerts.push(`التزام أعمال/توريد مستقبلي كبير: ${c.name}`);
  }

  const expenseList = [...expenseGroups.entries()]
    .map(([group, amount]) => ({
      group,
      amount,
      amountLocal: expenseGroupsLocal.get(group) || 0,
      pct: totalCosts > 0 ? (amount / totalCosts) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const salaries = expenseGroups.get('مصاريف الرواتب والاجور') || 0;
  if (totalCosts > 0 && salaries / totalCosts > 0.3) {
    alerts.push('مصاريف الرواتب > 30% من التكاليف');
  }

  return {
    revenue,
    revenueLocal,
    reservation,
    reservationLocal,
    received,
    receivedLocal: revenueLocal - reservationLocal,
    totalCosts,
    totalCostsLocal: expensesLocal,
    expenseServices,
    profit,
    profitLocal: revenueLocal - expensesLocal,
    margin,
    currency,
    auctionNet,
    auctionProfit: auctionNet < 0 ? Math.abs(auctionNet) : 0,
    auctionLoss: auctionNet > 0 ? auctionNet : 0,
    expenseList,
    contractors: [...contractors.values()].map(c => ({
      name: c.name,
      net: c.net,
      netLocal: c.netLocal,
      status: c.net > 0 ? 'مصروف لم يُدفع بعد' : c.net < 0 ? 'أعمال/توريد ستُقدَّم لاحقاً' : 'متوازن',
      projects: [...c.projects],
    })),
    alerts,
    hasRevenue: revenue > 0,
  };
}

function buildProjectReport(records, project) {
  const filtered = filterByProject(records, project);
  const a = analyzeProjectRecords(filtered);

  const curL = currencyLabel();
  let out = `## تقرير مشروع: ${project.name} (${project.code})\n\n`;
  out += `**[ ملخص تنفيذي — محسوب مسبقاً ]**\n`;
  out += `| البند | القيمة (${curL}) |\n|-------|-------------|\n`;
  out += `| الإيراد الكلي | ${money(a.revenue, a.revenueLocal)} |\n`;
  out += `| المستلم فعلاً | ${money(a.received, a.receivedLocal)} |\n`;
  out += `| الحجز لدى العميل | ${money(a.reservation, a.reservationLocal)} |\n`;
  out += `| إجمالي التكاليف | ${money(a.totalCosts, a.totalCostsLocal)} |\n`;
  out += `| الربح التقديري | ${money(a.profit, a.profitLocal)} |\n`;
  out += `| هامش الربح % | ${a.margin !== null ? a.margin.toFixed(1) + '%' : 'غير متاح (لا إيراد)'} |\n\n`;

  if (!a.hasRevenue) out += `⚠️ لا يوجد إيراد مسجل لهذا المشروع\n\n`;

  if (a.expenseList.length) {
    out += `**[ تفصيل التكاليف ]**\n`;
    for (const e of a.expenseList) {
      out += `- ${e.group}: ${money(e.amount, e.amountLocal)} (${e.pct.toFixed(1)}%)\n`;
    }
    out += '\n';
  }

  if (a.contractors.length) {
    out += `**[ المقاولين والمجهزين والموردين — نوع السجل: المقاوليين/المجهزيين/الموردين ]**\n`;
    out += `*(موجب = مصروف لم يُدفع بعد | سالب = أعمال/توريد ستُقدَّم لاحقاً)*\n`;
    out += `| الجهة | القيمة (${curL}) | الوضع |\n|-------|-------------|-------|\n`;
    for (const c of a.contractors) {
      out += `| ${c.name} | ${money(c.net, c.netLocal)} | ${c.status} |\n`;
    }
    out += '\n';
  }

  if (a.auctionProfit || a.auctionLoss) {
    out += `**[ فرق العملة — نوع السجل: مزاد ]**\n`;
    if (a.auctionProfit) out += `- ربح: ${money(a.auctionProfit)}\n`;
    if (a.auctionLoss) out += `- خسارة: ${money(a.auctionLoss)}\n`;
    out += '\n';
  }

  return out;
}

function buildCompanyReport(records) {
  const rows = groupRecordsByProject(records).map(g => ({
    ...g.project,
    ...analyzeProjectRecords(g.records),
  }));

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCosts = rows.reduce((s, r) => s + r.totalCosts, 0);
  const totalReservation = rows.reduce((s, r) => s + r.reservation, 0);
  const totalProfit = totalRevenue - totalCosts;
  const totalRevenueLocal = rows.reduce((s, r) => s + r.revenueLocal, 0);
  const totalCostsLocal = rows.reduce((s, r) => s + r.totalCostsLocal, 0);
  const totalReservationLocal = rows.reduce((s, r) => s + r.reservationLocal, 0);
  const totalProfitLocal = totalRevenueLocal - totalCostsLocal;
  const noRevenue = rows.filter(r => !r.hasRevenue).map(r => r.name);

  let out = `## تقرير الشركة الإجمالي — محسوب مسبقاً\n\n`;
  out += `- الإيرادات الكلية: ${money(totalRevenue, totalRevenueLocal, true)}\n`;
  out += `- التكاليف الكلية: ${money(totalCosts, totalCostsLocal, true)}\n`;
  out += `- الحجوزات (منفصلة): ${money(totalReservation, totalReservationLocal, true)}\n`;
  out += `- المستلم فعلاً: ${money(totalRevenue - totalReservation, totalRevenueLocal - totalReservationLocal, true)}\n`;
  out += `- الربح التقديري: ${money(totalProfit, totalProfitLocal, true)}\n`;
  out += `- هامش الربح: ${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) + '%' : 'غير متاح'}\n`;

  if (noRevenue.length) {
    out += `\n⚠️ مشاريع بلا إيراد مسجل (${noRevenue.length}):\n`;
    out += noRevenue.map(n => `- ${n}`).join('\n') + '\n';
  }

  return out;
}

function buildComparisonReport(records) {
  const groups = groupRecordsByProject(records).map(g => ({
    project: g.project,
    a: analyzeProjectRecords(g.records),
  }));
  const rows = groups.map(({ project: p, a }) => ({
    name: p.name,
    code: p.code,
    revenue: a.revenue,
    revenueLocal: a.revenueLocal,
    costs: a.totalCosts,
    costsLocal: a.totalCostsLocal,
    profit: a.profit,
    profitLocal: a.profitLocal,
    margin: a.margin,
    hasRevenue: a.hasRevenue,
  })).filter(r => r.hasRevenue)
    .sort((a, b) => (b.margin ?? -999) - (a.margin ?? -999));

  const curL = currencyLabel();
  let out = `## مقارنة المشاريع — محسوبة مسبقاً\n\n`;
  out += `| الترتيب | المشروع | الإيراد (${curL}) | التكاليف (${curL}) | الربح (${curL}) | الهامش % |\n`;
  out += `|---------|---------|---------|----------|-------|----------|\n`;

  rows.forEach((r, i) => {
    out += `| ${i + 1} | ${r.name} (${r.code}) | ${money(r.revenue, r.revenueLocal)} | ${money(r.costs, r.costsLocal)} | ${money(r.profit, r.profitLocal)} | ${r.margin !== null ? r.margin.toFixed(1) + '%' : '—'} |\n`;
  });

  const noRev = groups.filter(({ a }) => !a.hasRevenue).map(({ project }) => project);
  if (noRev.length) {
    out += `\nمشاريع بلا إيراد (لا تدخل المقارنة): ${noRev.map(p => p.name).join('، ')}\n`;
  }

  return out;
}

function buildContractorReport(records, query) {
  const q = query.toLowerCase();
  const contractorRecords = records.filter(r => classifyRecord(r) === 'contractor');
  const names = [...new Set(contractorRecords.map(r => r.accountName))];

  let matched = [];
  if (!/كل|جميع|الكل/.test(q)) {
    const scored = names.map(name => {
      let score = 0;
      for (const t of q.split(/\s+/)) {
        if (t.length > 2 && name.toLowerCase().includes(t)) score++;
      }
      return { name, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

    matched = scored.map(x => x.name);
  }

  if (!matched.length) matched = names;

  let out = `## وضع المقاولين والمجهزين والموردين — محسوب مسبقاً\n`;
  out += `*(موجب = مصروف لم يُدفع بعد | سالب = أعمال/توريد ستُقدَّم لاحقاً)*\n\n`;

  for (const name of matched) {
    const recs = contractorRecords.filter(r => r.accountName === name);
    const byProject = new Map();
    let totalNet = 0;
    let totalNetLocal = 0;

    for (const r of recs) {
      totalNet += r.net;
      totalNetLocal += r.net * recordRate(r);
      const key = r.projectName;
      const cur = byProject.get(key) || { usd: 0, iqd: 0 };
      cur.usd += r.net;
      cur.iqd += r.net * recordRate(r);
      byProject.set(key, cur);
    }

    const status = totalNet > 0 ? 'مصروف لم يُدفع بعد' :
      totalNet < 0 ? 'أعمال/توريد ستُقدَّم لاحقاً' : 'متوازن';

    out += `### ${name}\n`;
    out += `- الإجمالي: ${money(totalNet, totalNetLocal)} — ${status}\n`;
    out += `- حسب المشروع:\n`;
    for (const [proj, v] of byProject) {
      out += `  - ${proj}: ${money(v.usd, v.iqd)}\n`;
    }
    out += '\n';
  }

  return out;
}

/* ── التعرّف على الحسابات والبحث عنها وتقاريرها المخصصة ── */

const SCOPE_ALL_RE = /كل المشاريع|جميع المشاريع|لكل المشاريع|كل مشروع|على مستوى الشركة|مشاريع الشركة|كل المشروع/;

const ACCOUNT_GENERIC_TERMS = new Set([
  'حساب', 'الحساب', 'حسابات', 'الحسابات', 'رمز', 'الرمز', 'كود', 'بند', 'البند',
  'مصروف', 'مصاريف', 'قيمه', 'قيمة', 'مجموع', 'اجمالي', 'إجمالي', 'تقرير',
]);

function getAllAccounts(records) {
  const map = new Map();
  for (const r of records) {
    const name = (r.accountName || '').trim();
    if (!name) continue;
    if (!map.has(name)) {
      map.set(name, { name, codes: new Set(), groups: new Set(), types: new Set() });
    }
    const a = map.get(name);
    if (r.accountCode) a.codes.add(String(r.accountCode).trim());
    if (r.group) a.groups.add(r.group);
    if (r.recordType) a.types.add(r.recordType);
  }
  return [...map.values()].map(a => ({
    name: a.name,
    codes: [...a.codes].filter(Boolean),
    groups: [...a.groups].filter(Boolean),
    types: [...a.types].filter(Boolean),
  }));
}

function accountNameTokens(name) {
  return normalizeForSearch(name)
    .split(/\s+/)
    .filter(t => t.length >= 2 && !ACCOUNT_GENERIC_TERMS.has(t) && !QUERY_STOP_WORDS.has(t));
}

function scoreAccountMatch(account, query) {
  const qNorm = normalizeForSearch(cleanQuery(query));
  const tokens = extractQueryTokens(query).filter(t => !ACCOUNT_GENERIC_TERMS.has(t));
  const nameN = normalizeForSearch(account.name);
  let score = 0;

  if (nameN.length >= 3 && qNorm.includes(nameN)) score += 60;

  const codeNums = qNorm.match(/\d{2,}/g) || [];
  for (const code of account.codes) {
    const cN = normalizeForSearch(code);
    if (!cN) continue;
    if (codeNums.includes(cN)) score += 75;
    else if (cN.length >= 3 && qNorm.includes(cN)) score += 45;
  }

  const nameTokens = accountNameTokens(account.name);
  if (nameTokens.length) {
    const matched = nameTokens.filter(t =>
      tokens.some(qt =>
        qt === t ||
        (t.length >= 3 && qt.includes(t)) ||
        (qt.length >= 3 && t.includes(qt))
      )
    );
    if (matched.length === nameTokens.length) score += 42;
    else if (matched.length) score += matched.length * 14;
  }

  return score;
}

function filterByAccount(records, account) {
  const nameN = normalizeForSearch(account.name);
  const codes = (account.codes || []).map(c => normalizeForSearch(c)).filter(Boolean);
  return records.filter(r =>
    normalizeForSearch(r.accountName) === nameN ||
    (r.accountCode && codes.includes(normalizeForSearch(r.accountCode)))
  );
}

function sumAccountRows(records) {
  let netUsd = 0;
  let netLocal = 0;
  const byType = new Map();
  const byProject = new Map();
  const byTypeLocal = new Map();
  const byProjectLocal = new Map();
  for (const r of records) {
    const iqd = r.net * recordRate(r);
    netUsd += r.net;
    netLocal += r.net >= 0 ? localVal(r) : -localVal(r);
    const tk = r.recordType || 'أخرى';
    byType.set(tk, (byType.get(tk) || 0) + r.net);
    byTypeLocal.set(tk, (byTypeLocal.get(tk) || 0) + iqd);
    const pk = r.projectName || r.projectCode || '—';
    byProject.set(pk, (byProject.get(pk) || 0) + r.net);
    byProjectLocal.set(pk, (byProjectLocal.get(pk) || 0) + iqd);
  }
  return { netUsd, netLocal, count: records.length, byType, byProject, byTypeLocal, byProjectLocal };
}

function dominantRecordType(byType) {
  let top = null;
  let max = -Infinity;
  for (const [type, net] of byType) {
    if (Math.abs(net) > max) { max = Math.abs(net); top = type; }
  }
  return top;
}

function detectAccountQuery(query, records) {
  if (!records || !records.length) return null;

  const scored = getAllAccounts(records)
    .map(a => ({ ...a, score: scoreAccountMatch(a, query) }))
    .filter(a => a.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  const top = scored[0];
  if (top.score < 40) return null;

  const second = scored[1];
  const ambiguous = Boolean(
    second &&
    top.score - second.score < 12 &&
    second.score >= 40
  );

  const scopeAll = SCOPE_ALL_RE.test(query);

  let project = null;
  let projectAmbiguous = false;
  let projectCandidates = [];

  if (records && !scopeAll) {
    // إزالة رمز الحساب واسمه من السؤال قبل حلّ المشروع، حتى لا تتسرب
    // أرقام الرمز (مثل 320211) إلى مطابقة أكواد المشاريع (مثل 11kV 020)
    let projectQuery = query;
    for (const code of top.codes || []) {
      projectQuery = projectQuery.split(code).join(' ');
    }
    projectQuery = projectQuery.split(top.name).join(' ');
    if (normalizeForSearch(projectQuery).replace(/\s/g, '')) {
      const res = resolveProjectQuery(records, projectQuery);
      if (res.status === 'unique') project = res.project;
      else if (res.status === 'ambiguous') {
        projectAmbiguous = true;
        projectCandidates = res.candidates;
      }
    }
  }

  return {
    account: top,
    candidates: scored.slice(0, 5),
    ambiguous,
    project,
    scopeAll: scopeAll || (!project && !projectAmbiguous),
    projectAmbiguous,
    projectCandidates,
  };
}

function buildAccountDisambiguationTable(records, candidates) {
  const curL = currencyLabel();
  return {
    title: 'حسابات متشابهة — يرجى التحديد',
    headers: ['#', 'الحساب', 'الرمز', 'الحساب الاب', `الإجمالي (${curL})`, 'تطابق السؤال'],
    rows: candidates.map((a, i) => {
      const s = sumAccountRows(filterByAccount(records, a));
      return [
        String(i + 1),
        a.name,
        (a.codes || []).join('، ') || '—',
        (a.groups || []).join('، ') || '—',
        money(s.netUsd, s.netLocal),
        i === 0 ? `الأقرب (درجة ${a.score})` : `متشابه (درجة ${a.score})`,
      ];
    }),
  };
}

function buildAccountReport(records, accountQuery) {
  const { account, ambiguous, candidates, project, scopeAll, projectAmbiguous, projectCandidates } = accountQuery;
  let out = `## تقرير حساب: **${account.name}** — محسوب مسبقاً\n\n`;

  if (ambiguous) {
    out += `⚠️ حسابات متشابهة: ${candidates.map(c => c.name).join(' | ')}\n`;
    out += 'حدّد اسم الحساب بدقة أو استخدم الرمز.\n';
    return out;
  }

  if (projectAmbiguous) {
    out += `⚠️ مشاريع متشابهة: ${projectCandidates.map(p => p.name).join(' | ')}\n`;
    out += 'حدّد المشروع بالكود أو الاسم الكامل.\n';
    return out;
  }

  const scopeRecords = project ? filterByProject(records, project) : records;
  const accRecords = filterByAccount(scopeRecords, account);
  const s = sumAccountRows(accRecords);
  const scopeLabel = project ? `مشروع: ${project.name} (${project.code})` : 'كل المشاريع';

  const curL = currencyLabel();
  out += `**النطاق:** ${scopeLabel}\n`;
  if (account.codes.length) out += `**الرمز:** ${account.codes.join('، ')}\n`;
  if (account.groups.length) out += `**الحساب الاب:** ${account.groups.join('، ')}\n`;
  out += `**عدد السجلات:** ${s.count}\n`;
  out += `**المجموع (${curL}):** ${money(s.netUsd, s.netLocal)}\n`;

  const domType = dominantRecordType(s.byType);
  if (domType) out += `**المعنى (${domType}):** ${recordTypeMeaning(domType, s.byType.get(domType))}\n`;
  out += '\n';

  if (!s.count) {
    out += `⚠️ لا توجد سجلات للحساب "${account.name}"${project ? ` في مشروع ${project.name}` : ''}.\n`;
    return out;
  }

  if (s.byType.size > 1) {
    out += `**[ حسب نوع السجل ]**\n`;
    for (const [type, net] of [...s.byType.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))) {
      out += `- ${type}: ${money(net, s.byTypeLocal.get(type))} — ${recordTypeMeaning(type, net)}\n`;
    }
    out += '\n';
  }

  if (scopeAll && !project && s.byProject.size > 1) {
    out += `**[ حسب المشروع ]**\n`;
    for (const [proj, net] of [...s.byProject.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))) {
      out += `- ${proj}: ${money(net, s.byProjectLocal.get(proj))}\n`;
    }
    out += '\n';
  }

  return out;
}

function buildNoRevenueReport(records) {
  const projects = getAllProjects(records);
  const list = projects.filter(p => !analyzeProjectRecords(filterByProject(records, p)).hasRevenue);

  let out = `## مشاريع بلا إيراد مسجل — محسوب مسبقاً\n\n`;
  if (!list.length) {
    out += 'جميع المشاريع لديها إيراد مسجل.\n';
    return out;
  }

  for (const p of list) {
    const a = analyzeProjectRecords(filterByProject(records, p));
    out += `- **${p.name}** (${p.code}): تكاليف ${formatUSD(a.totalCosts)} بدون إيراد\n`;
  }

  return out;
}

function getProjectsForUI(records) {
  return getAllProjects(records).map(p => {
    const filtered = filterByProject(records, p);
    const a = analyzeProjectRecords(filtered);
    return {
      code: p.code,
      name: p.name,
      hasRevenue: a.hasRevenue,
      revenue: a.revenue,
    };
  }).sort((a, b) => {
    if (a.hasRevenue !== b.hasRevenue) return Number(b.hasRevenue) - Number(a.hasRevenue);
    return b.revenue - a.revenue;
  });
}

function scopeExpenseRecords(records, { projectCode, projectName, groupName } = {}) {
  let scoped = getExpenseRecords(records);
  if (groupName) scoped = filterByExpenseGroup(scoped, groupName);
  if (projectCode || projectName) {
    scoped = scoped.filter(r =>
      (projectCode && r.projectCode === projectCode) ||
      (projectName && r.projectName === projectName)
    );
  }
  return scoped;
}

function getExpenseGroupsForUI(records, { projectCode, projectName } = {}) {
  const scoped = scopeExpenseRecords(records, { projectCode, projectName });
  const map = new Map();
  for (const r of scoped) {
    const name = (r.group || '').trim();
    if (!name) continue;
    if (!map.has(name)) map.set(name, { name, totalUsd: 0, count: 0 });
    const g = map.get(name);
    g.totalUsd += r.net;
    g.count++;
  }
  return [...map.values()]
    .sort((a, b) => Math.abs(b.totalUsd) - Math.abs(a.totalUsd));
}

function getExpenseAccountsForUI(records, { projectCode, projectName, groupName } = {}) {
  const scoped = scopeExpenseRecords(records, { projectCode, projectName, groupName });
  const map = new Map();
  for (const r of scoped) {
    const name = (r.accountName || '').trim();
    if (!name) continue;
    const key = groupName ? name : `${r.group}::${name}`;
    if (!map.has(key)) {
      map.set(key, {
        name,
        code: (r.accountCode || '').trim(),
        group: r.group || '',
        totalUsd: 0,
        count: 0,
      });
    }
    const a = map.get(key);
    if (!a.code && r.accountCode) a.code = String(r.accountCode).trim();
    a.totalUsd += r.net;
    a.count++;
  }
  return [...map.values()]
    .sort((a, b) => Math.abs(b.totalUsd) - Math.abs(a.totalUsd));
}

function projectSummaryRows(a) {
  const c = currencyLabel();
  return [
    ['الإيراد الكلي', money(a.revenue, a.revenueLocal), 'نوع: ايراد'],
    ['الحجز لدى العميل', money(a.reservation, a.reservationLocal), 'نوع: حجز'],
    ['المستلم فعلاً', money(a.received, a.receivedLocal), 'إيراد − حجز'],
    ['إجمالي التكاليف', money(a.totalCosts, a.totalCostsLocal), 'مصاريف وخدمات مدفوعة'],
    ['الربح التقديري', money(a.profit, a.profitLocal), 'إيراد − تكاليف'],
    ['هامش الربح', a.margin !== null ? a.margin.toFixed(1) + '%' : '—', '—'],
  ];
}

function buildDetailTable(records, title, limit = 50) {
  const curL = currencyLabel();
  const rows = records.slice(0, limit).map(r => [
    r.recordType,
    r.accountCode,
    r.accountName.length > 40 ? r.accountName.slice(0, 40) + '…' : r.accountName,
    money(r.net, r.net * recordRate(r)),
    interpretRecord(r),
  ]);

  return {
    title,
    headers: ['نوع السجل', 'كود الحساب', 'اسم الحساب', `المبلغ (${curL})`, 'المعنى'],
    rows,
  };
}

function buildRecordTypeByProjectTable(records, typeKey) {
  const curL = currencyLabel();
  const projects = getAllProjects(records);
  const rows = projects.map(p => {
    const scoped = filterByProject(records, p);
    const s = sumRecordTypeRows(scoped, typeKey);
    if (!s.count) return null;
    return [
      p.name,
      p.code,
      String(s.count),
      money(s.netUsd, s.netLocal),
      recordTypeMeaning(typeKey, s.netUsd),
    ];
  }).filter(Boolean);

  const total = sumRecordTypeRows(records, typeKey);
  rows.push([
    'الإجمالي',
    '—',
    String(total.count),
    money(total.netUsd, total.netLocal),
    recordTypeMeaning(typeKey, total.netUsd),
  ]);

  return {
    title: `تقرير نوع السجل: ${RECORD_TYPE_LABEL[typeKey]} — حسب المشروع`,
    headers: ['المشروع', 'الكود', 'عدد السجلات', `المبلغ (${curL})`, 'المعنى'],
    rows,
  };
}

function buildRecordTypeReport(records, typeQuery, query) {
  const { type, label, project, scopeAll, ambiguous, candidates } = typeQuery;
  let out = `## تقرير نوع السجل: **${label}** — محسوب مسبقاً\n\n`;

  if (ambiguous) {
    out += `⚠️ ${candidates.map(p => p.name).join(' | ')}\n`;
    out += 'حدّد المشروع بدقة لعرض تقرير النوع.\n';
    return out;
  }

  const scopeRecords = project ? filterByProject(records, project) : records;
  const summary = sumRecordTypeRows(scopeRecords, type);
  const scopeLabel = project ? `مشروع: ${project.name} (${project.code})` : 'كل المشاريع';

  const curL = currencyLabel();
  out += `**النطاق:** ${scopeLabel}\n`;
  out += `**عدد السجلات:** ${summary.count}\n`;
  out += `**المجموع (${curL}):** ${money(summary.netUsd, summary.netLocal)}\n`;
  out += `**المعنى:** ${recordTypeMeaning(type, summary.netUsd)}\n\n`;

  if (!summary.count) {
    out += `⚠️ لا توجد سجلات من نوع "${label}" في هذا النطاق.\n`;
    return out;
  }

  if (scopeAll && !project) {
    const projects = getAllProjects(records);
    out += `**[ ملخص حسب المشروع ]**\n`;
    out += `| المشروع | عدد | ${curL} | المعنى |\n|---------|-----|-----|--------|\n`;
    for (const p of projects) {
      const s = sumRecordTypeRows(filterByProject(records, p), type);
      if (!s.count) continue;
      out += `| ${p.name} | ${s.count} | ${money(s.netUsd, s.netLocal)} | ${recordTypeMeaning(type, s.netUsd)} |\n`;
    }
    out += '\n';
  }

  if (OBLIGATION_TYPES.includes(type)) {
    const byAccount = new Map();
    for (const r of summary.filtered) {
      const key = r.accountName;
      const cur = byAccount.get(key) || { usd: 0, iqd: 0 };
      cur.usd += r.net;
      cur.iqd += r.net * recordRate(r);
      byAccount.set(key, cur);
    }
    out += `**[ حسب الجهة ]**\n`;
    for (const [name, v] of [...byAccount.entries()].sort((a, b) => Math.abs(b[1].usd) - Math.abs(a[1].usd))) {
      out += `- ${name}: ${money(v.usd, v.iqd)} — ${recordTypeMeaning(type, v.usd)}\n`;
    }
    out += '\n';
  }

  return out;
}

function buildVisuals(records, userMessage, currency) {
  const query = cleanQuery(userMessage);
  setDisplayCurrency(detectCurrency(userMessage) || currency || 'USD');
  const intent = detectIntent(query, records);
  const tables = [];
  const charts = [];

  if (intent === 'expense_group') {
    const expenseGroupQ = detectExpenseGroupQuery(query, records);
    if (expenseGroupQ) {
      if (expenseGroupQ.groupAmbiguous) {
        tables.push(buildExpenseGroupDisambiguationTable(records, expenseGroupQ.groupCandidates));
      } else if (expenseGroupQ.projectAmbiguous) {
        tables.push(buildDisambiguationTable(records, expenseGroupQ.projectCandidates));
      } else {
        const { group, account, project, scopeAll } = expenseGroupQ;
        const scopeRecords = project ? filterByProject(records, project) : records;
        const summary = sumExpenseGroupRows(scopeRecords, group.name, account?.name);
        const curL = currencyLabel();

        if (scopeAll && !project) {
          tables.push(buildExpenseGroupByProjectTable(records, group.name));
          const projects = getAllProjects(records);
          const chartData = projects.map(p => {
            const s = sumExpenseGroupRows(filterByProject(records, p), group.name, account?.name);
            return { label: (p.code || p.name).slice(0, 16), value: chartVal(s.netUsd, s.netLocal), count: s.count };
          }).filter(x => x.count > 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

          if (chartData.length > 1) {
            charts.push({
              type: 'bar',
              title: `${group.name} — حسب المشروع (${curL})`,
              labels: chartData.map(x => x.label),
              datasets: [{ label: group.name, data: chartData.map(x => x.value), color: CHART_THEME.costs }],
              horizontal: chartData.length > 6,
            });
          }
        }

        const titleSuffix = project ? project.name : 'كل المشاريع';
        tables.push({
          title: `${group.name}${account ? ` — ${account.name}` : ''} — ${titleSuffix}`,
          headers: ['البند', 'القيمة'],
          rows: [
            ['المجموعة (الحساب الاب)', group.name],
            ...(account ? [['الحساب الفرعي', account.name]] : []),
            ['عدد السجلات', String(summary.count)],
            [`المبلغ (${curL})`, money(summary.netUsd, summary.netLocal)],
            ['المعنى', recordTypeMeaning('المصاريف', summary.netUsd)],
            ...(project && summary.count ? (() => {
              const a = analyzeProjectRecords(scopeRecords);
              const pct = a.totalCosts > 0 ? ((summary.netUsd / a.totalCosts) * 100).toFixed(1) : '—';
              return [['% من تكاليف المشروع', pct + '%']];
            })() : []),
          ],
        });

        if (!account && summary.filtered.length) {
          const byAccount = new Map();
          for (const r of summary.filtered) {
            const cur = byAccount.get(r.accountName) || { usd: 0, iqd: 0 };
            cur.usd += r.net;
            cur.iqd += r.net * recordRate(r);
            byAccount.set(r.accountName, cur);
          }
          if (byAccount.size > 1) {
            tables.push({
              title: `${group.name} — حسب الحساب الفرعي`,
              headers: ['الحساب', `المبلغ (${curL})`, 'المعنى'],
              rows: [...byAccount.entries()]
                .sort((a, b) => Math.abs(b[1].usd) - Math.abs(a[1].usd))
                .map(([name, v]) => [name, money(v.usd, v.iqd), recordTypeMeaning('المصاريف', v.usd)]),
            });
          }
        }

        if (summary.filtered.length) {
          tables.push(buildDetailTable(
            summary.filtered,
            `سجلات ${group.name}${project ? ` — ${project.name}` : ''}`,
            80
          ));
        }
      }
    }
  }

  if (intent === 'company' || intent === 'general') {
    const curL = currencyLabel();
    const all = getAllProjects(records);
    const rows = all.map(p => {
      const a = analyzeProjectRecords(filterByProject(records, p));
      return [
        p.name,
        money(a.revenue, a.revenueLocal),
        money(a.totalCosts, a.totalCostsLocal),
        a.margin !== null ? a.margin.toFixed(1) + '%' : '—',
      ];
    });

    tables.push({
      title: 'ملخص الشركة — حسب المشروع',
      headers: ['المشروع', `الإيراد (${curL})`, `التكاليف (${curL})`, 'الهامش %'],
      rows,
    });

    const top = all.map(p => {
      const a = analyzeProjectRecords(filterByProject(records, p));
      return {
        label: p.code || p.name.slice(0, 15),
        revenue: chartVal(a.revenue, a.revenueLocal),
        costs: chartVal(a.totalCosts, a.totalCostsLocal),
        raw: a.revenue,
      };
    }).filter(x => x.raw > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    if (top.length) {
      charts.push({
        type: 'bar',
        title: `الإيراد مقابل التكاليف — أبرز المشاريع (${curL})`,
        labels: top.map(x => x.label),
        datasets: [
          { label: 'الإيراد', data: top.map(x => x.revenue), color: CHART_THEME.revenue },
          { label: 'التكاليف', data: top.map(x => x.costs), color: CHART_THEME.costs },
        ],
      });
    }
  }

  if (intent === 'comparison') {
    const curL = currencyLabel();
    const all = getAllProjects(records);
    const rows = all.map(p => {
      const a = analyzeProjectRecords(filterByProject(records, p));
      if (!a.hasRevenue) return null;
      return {
        name: p.name,
        profitUsd: a.profit,
        cells: [
          p.name,
          money(a.revenue, a.revenueLocal),
          money(a.totalCosts, a.totalCostsLocal),
          money(a.profit, a.profitLocal),
          a.margin !== null ? a.margin.toFixed(1) + '%' : '—',
        ],
      };
    }).filter(Boolean)
      .sort((a, b) => b.profitUsd - a.profitUsd)
      .map((r, i) => [String(i + 1), ...r.cells]);

    tables.push({
      title: `مقارنة المشاريع (${curL})`,
      headers: ['#', 'المشروع', `الإيراد (${curL})`, `التكاليف (${curL})`, `الربح (${curL})`, 'الهامش %'],
      rows,
    });

    const sorted = all.map(p => {
      const a = analyzeProjectRecords(filterByProject(records, p));
      return {
        label: (p.code || p.name).slice(0, 18),
        margin: a.margin,
        hasRevenue: a.hasRevenue,
      };
    }).filter(x => x.hasRevenue && x.margin !== null).sort((a, b) => b.margin - a.margin);

    if (sorted.length) {
      charts.push({
        type: 'bar',
        title: 'هامش الربح % — المشاريع',
        labels: sorted.map(x => x.label),
        datasets: [{ label: 'الهامش %', data: sorted.map(x => +x.margin.toFixed(1)), color: CHART_THEME.margin }],
        horizontal: true,
      });
    }

    const withRevenue = all
      .map(p => ({ p, a: analyzeProjectRecords(filterByProject(records, p)) }))
      .filter(x => x.a.hasRevenue);

    if (withRevenue.length) {
      charts.push({
        type: 'bar',
        title: `مقارنة الإيراد والتكاليف (${currencyLabel()})`,
        labels: withRevenue.map(x => (x.p.code || x.p.name).slice(0, 14)),
        datasets: [
          { label: 'الإيراد', data: withRevenue.map(x => chartVal(x.a.revenue, x.a.revenueLocal)), color: CHART_THEME.revenue },
          { label: 'التكاليف', data: withRevenue.map(x => chartVal(x.a.totalCosts, x.a.totalCostsLocal)), color: CHART_THEME.costs },
        ],
      });
    }
  }

  if (intent === 'record_type') {
    const typeQuery = detectRecordTypeQuery(query, records);
    if (!typeQuery || typeQuery.ambiguous) {
      if (typeQuery?.ambiguous) {
        tables.push(buildDisambiguationTable(records, typeQuery.candidates));
      }
    } else if (typeQuery.scopeAll && !typeQuery.project) {
      const curL = currencyLabel();
      tables.push(buildRecordTypeByProjectTable(records, typeQuery.type));
      const projects = getAllProjects(records);
      const chartData = projects.map(p => {
        const s = sumRecordTypeRows(filterByProject(records, p), typeQuery.type);
        return { label: (p.code || p.name).slice(0, 16), value: chartVal(s.netUsd, s.netLocal), count: s.count };
      }).filter(x => x.count > 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

      if (chartData.length > 1) {
        charts.push({
          type: 'bar',
          title: `مجموع ${typeQuery.label} — حسب المشروع (${curL})`,
          labels: chartData.map(x => x.label),
          datasets: [{
            label: typeQuery.label,
            data: chartData.map(x => typeQuery.type === 'ايراد' ? Math.abs(x.value) : x.value),
            color: typeQuery.type === 'ايراد' ? CHART_THEME.revenue : CHART_THEME.costs,
          }],
          horizontal: chartData.length > 6,
        });
      }

      const total = sumRecordTypeRows(records, typeQuery.type);
      tables.push(buildDetailTable(total.filtered, `تفاصيل سجلات ${typeQuery.label} — كل المشاريع`, 60));
    } else if (typeQuery.project) {
      const curL = currencyLabel();
      const scoped = filterByProject(records, typeQuery.project);
      const summary = sumRecordTypeRows(scoped, typeQuery.type);

      tables.push({
        title: `${typeQuery.label} — ${typeQuery.project.name}`,
        headers: ['البند', 'القيمة'],
        rows: [
          ['عدد السجلات', String(summary.count)],
          [`المبلغ (${curL})`, money(summary.netUsd, summary.netLocal)],
          ['المعنى', recordTypeMeaning(typeQuery.type, summary.netUsd)],
        ],
      });

      if (OBLIGATION_TYPES.includes(typeQuery.type)) {
        const byAccount = new Map();
        for (const r of summary.filtered) {
          const cur = byAccount.get(r.accountName) || { usd: 0, iqd: 0 };
          cur.usd += r.net;
          cur.iqd += r.net * recordRate(r);
          byAccount.set(r.accountName, cur);
        }
        tables.push({
          title: `${typeQuery.label} — حسب الجهة`,
          headers: ['الجهة', `المبلغ (${curL})`, 'الوضع'],
          rows: [...byAccount.entries()]
            .sort((a, b) => Math.abs(b[1].usd) - Math.abs(a[1].usd))
            .map(([name, v]) => [name, money(v.usd, v.iqd), recordTypeMeaning(typeQuery.type, v.usd)]),
        });
      }

      tables.push(buildDetailTable(summary.filtered, `سجلات ${typeQuery.label} — التفصيل`, 80));
    }
  }

  if (intent === 'project') {
    const resolution = resolveProjectQuery(records, query);
    if (resolution.status === 'unique') {
      const project = resolution.project;
      const filtered = filterByProject(records, project);
      const a = analyzeProjectRecords(filtered);

      const curL = currencyLabel();
      tables.push({
        title: `ملخص مشروع: ${project.name}`,
        headers: ['البند', `القيمة (${curL})`, 'نوع السجل / المعنى'],
        rows: projectSummaryRows(a),
      });

      if (a.expenseList.length) {
        tables.push({
          title: 'تفصيل التكاليف حسب المجموعة',
          headers: ['المجموعة', `المبلغ (${curL})`, 'النسبة %'],
          rows: a.expenseList.map(e => [
            e.group,
            money(e.amount, e.amountLocal),
            e.pct.toFixed(1) + '%',
          ]),
        });

        charts.push({
          type: 'doughnut',
          title: `توزيع التكاليف (${curL})`,
          labels: a.expenseList.slice(0, 8).map(e => e.group.slice(0, 20)),
          datasets: [{ label: 'التكاليف', data: a.expenseList.slice(0, 8).map(e => chartVal(e.amount, e.amountLocal)) }],
          colors: CHART_THEME.palette,
        });
      }

      if (a.contractors.length) {
        tables.push({
          title: 'المقاولين والمجهزين والموردين',
          headers: ['الجهة', `المبلغ (${curL})`, 'نوع السجل', 'الوضع'],
          rows: a.contractors.map(c => [c.name, money(c.net, c.netLocal), 'المقاوليين/المجهزيين/الموردين', c.status]),
        });
      }

      tables.push(buildDetailTable(filtered, 'سجلات المشروع التفصيلية', 40));
    } else if (resolution.status === 'ambiguous') {
      tables.push(buildDisambiguationTable(records, resolution.candidates));
    }
  }

  if (intent === 'contractor') {
    const contractorRecs = records.filter(r => classifyRecord(r) === 'contractor');
    const names = [...new Set(contractorRecs.map(r => r.accountName))];
    const q = query.toLowerCase();
    let matched = names;
    if (!/كل|جميع/.test(q)) {
      matched = names.filter(n => q.split(/\s+/).some(t => t.length > 2 && n.toLowerCase().includes(t)));
      if (!matched.length) matched = names;
    }

    const curL = currencyLabel();
    for (const name of matched.slice(0, 3)) {
      const recs = contractorRecs.filter(r => r.accountName === name);
      tables.push({
        title: name,
        headers: ['المشروع', `المبلغ (${curL})`, 'الوضع'],
        rows: recs.map(r => [
          r.projectName,
          money(r.net, r.net * recordRate(r)),
          r.net > 0 ? 'مصروف لم يُدفع بعد' : r.net < 0 ? 'أعمال/توريد لاحقاً' : 'متوازن',
        ]),
      });
    }
  }

  if (intent === 'account') {
    const accountQuery = detectAccountQuery(query, records);
    if (accountQuery && accountQuery.account) {
      if (accountQuery.ambiguous) {
        tables.push(buildAccountDisambiguationTable(records, accountQuery.candidates));
      } else if (accountQuery.projectAmbiguous) {
        tables.push(buildDisambiguationTable(records, accountQuery.projectCandidates));
      } else {
        const curL = currencyLabel();
        const { account, project, scopeAll } = accountQuery;
        const scopeRecords = project ? filterByProject(records, project) : records;
        const accRecords = filterByAccount(scopeRecords, account);
        const s = sumAccountRows(accRecords);
        const domType = dominantRecordType(s.byType);

        tables.push({
          title: `حساب: ${account.name}${project ? ` — ${project.name}` : ' — كل المشاريع'}`,
          headers: ['البند', 'القيمة'],
          rows: [
            ...(account.codes.length ? [['الرمز', account.codes.join('، ')]] : []),
            ...(account.groups.length ? [['الحساب الاب', account.groups.join('، ')]] : []),
            ['عدد السجلات', String(s.count)],
            [`المبلغ (${curL})`, money(s.netUsd, s.netLocal)],
            ...(domType ? [['المعنى', recordTypeMeaning(domType, s.byType.get(domType))]] : []),
          ],
        });

        if (s.byType.size > 1) {
          tables.push({
            title: `${account.name} — حسب نوع السجل`,
            headers: ['نوع السجل', `المبلغ (${curL})`, 'المعنى'],
            rows: [...s.byType.entries()]
              .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
              .map(([type, net]) => [type, money(net, s.byTypeLocal.get(type)), recordTypeMeaning(type, net)]),
          });
        }

        if (scopeAll && !project && s.byProject.size > 1) {
          const projRows = [...s.byProject.entries()]
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
          tables.push({
            title: `${account.name} — حسب المشروع`,
            headers: ['المشروع', `المبلغ (${curL})`],
            rows: projRows.map(([proj, net]) => [proj, money(net, s.byProjectLocal.get(proj))]),
          });

          const chartData = projRows.filter(([, net]) => net !== 0).slice(0, 12);
          if (chartData.length > 1) {
            charts.push({
              type: 'bar',
              title: `${account.name} — حسب المشروع (${curL})`,
              labels: chartData.map(([proj]) => String(proj).slice(0, 16)),
              datasets: [{ label: account.name, data: chartData.map(([proj, net]) => chartVal(net, s.byProjectLocal.get(proj))), color: CHART_THEME.costs }],
              horizontal: chartData.length > 6,
            });
          }
        }

        if (accRecords.length) {
          tables.push(buildDetailTable(accRecords, `سجلات الحساب: ${account.name}`, 80));
        }
      }
    }
  }

  if (intent === 'no_revenue') {
    const list = getAllProjects(records).filter(p =>
      !analyzeProjectRecords(filterByProject(records, p)).hasRevenue
    );
    tables.push({
      title: 'مشاريع بلا إيراد مسجل',
      headers: ['المشروع', 'كود المشروع', `التكاليف (${currencyLabel()})`, 'ملاحظة'],
      rows: list.map(p => {
        const a = analyzeProjectRecords(filterByProject(records, p));
        return [p.name, p.code, money(a.totalCosts, a.totalCostsLocal), 'لا يوجد سجل نوع: ايراد'];
      }),
    });
  }

  return { tables, charts };
}

function buildContext(records, userMessage, currency) {
  const role = extractRole(userMessage);
  const query = cleanQuery(userMessage);
  setDisplayCurrency(detectCurrency(userMessage) || currency || 'USD');
  const intent = detectIntent(query, records);

  let out = `تاريخ البيانات: من Google Sheets\n`;
  out += `عدد السجلات: ${records.length} | عدد المشاريع: ${getAllProjects(records).length}\n`;
  out += `عملة العرض: **${currencyLabel()}** (الأساس دولار؛ التحويل للدينار بسعر عمود "سعر الصرف")\n`;
  if (role) out += `دور المستخدم المحدد: **${role}**\n`;
  if (intent === 'expense_group') {
    const expenseGroupQ = detectExpenseGroupQuery(query, records);
    if (expenseGroupQ?.group) out += `مجموعة المصروف: **${expenseGroupQ.group.name}**\n`;
  } else if (intent === 'account') {
    const accQ = detectAccountQuery(query, records);
    if (accQ?.account) out += `الحساب المطلوب: **${accQ.account.name}**${accQ.account.codes.length ? ` (رمز: ${accQ.account.codes.join('، ')})` : ''}\n`;
  } else if (intent === 'record_type') {
    const typeQ = detectRecordTypeQuery(query, records);
    if (typeQ) out += `نوع السجل المطلوب: **${typeQ.label}**\n`;
  }
  out += `نوع السؤال المكتشف: ${intent}\n\n`;

  switch (intent) {
    case 'company':
      out += buildCompanyReport(records);
      break;
    case 'comparison':
      out += buildComparisonReport(records);
      break;
    case 'contractor':
      out += buildContractorReport(records, query);
      break;
    case 'no_revenue':
      out += buildNoRevenueReport(records);
      break;
    case 'expense_group': {
      const egQ = detectExpenseGroupQuery(query, records);
      if (egQ) out += buildExpenseGroupReport(records, egQ);
      break;
    }
    case 'record_type': {
      const typeQuery = detectRecordTypeQuery(query, records);
      if (typeQuery) out += buildRecordTypeReport(records, typeQuery, query);
      break;
    }
    case 'account': {
      const accountQuery = detectAccountQuery(query, records);
      if (accountQuery) out += buildAccountReport(records, accountQuery);
      break;
    }
    case 'project': {
      const resolution = resolveProjectQuery(records, query);
      if (resolution.status === 'unique') {
        const matchNote = describeProjectMatch(
          { ...resolution.project, terms: buildProjectSearchTerms(resolution.project) },
          query
        );
        if (matchNote) out += matchNote + '\n\n';
        out += buildProjectReport(records, resolution.project);
      } else if (resolution.status === 'ambiguous') {
        out += `⚠️ **${resolution.reason}**\n\n`;
        out += `المشاريع المتشابهة المحتملة:\n`;
        resolution.candidates.forEach((p, i) => {
          const a = analyzeProjectRecords(filterByProject(records, p));
          out += `${i + 1}. **${p.name}** (كود: \`${p.code}\`) — إيراد ${formatUSD(a.revenue)}, تكاليف ${formatUSD(a.totalCosts)}\n`;
        });
        out += `\n**لم يُنشأ تقرير تفصيلي** لتجنب الخلط. أعد السؤال مع الكود أو السنة أو الاسم الكامل.\n`;
        out += `مثال: \`تقرير مشروع OHTL Upgrade 034 - 2026\` أو \`تقرير كربلاء PIP\`\n`;
      } else {
        out += buildCompanyReport(records);
        out += '\n⚠️ لم يُتعرف على المشروع من السؤال — يُعرض التقرير الإجمالي.\n';
        out += 'المشاريع المتاحة (يمكنك كتابة الاسم بالعربي أو الإنجليزي أو الكود):\n';
        getAllProjects(records).forEach(p => { out += `- ${p.name} (${p.code})\n`; });
      }
      break;
    }
    default:
      out += buildCompanyReport(records);
      out += '\n' + buildComparisonReport(records);
      break;
  }

  return out;
}

module.exports = {
  normalizeRecord,
  buildContext,
  buildVisuals,
  getProjectsForUI,
  getExpenseGroupsForUI,
  getExpenseAccountsForUI,
  extractRole,
  cleanQuery,
  detectIntent,
  detectRecordType,
  detectRecordTypeQuery,
  detectExpenseGroupQuery,
  detectAccountQuery,
  getAllAccounts,
  filterByAccount,
  sumAccountRows,
  filterByRecordType,
  filterByExpenseGroup,
  findMatchingExpenseGroups,
  sumExpenseGroupRows,
  findMatchingProjects,
  resolveProjectQuery,
  describeProjectMatch,
  normalizeForSearch,
  extractQueryTokens,
  filterByProject,
  analyzeProjectRecords,
  getAllProjects,
  interpretRecord,
  formatUSD,
  formatLocalCurrency,
  formatLocalAmount,
  classifyRecord,
  CHART_THEME,
  money,
  recordRate,
  setDisplayCurrency,
  getDisplayCurrency,
  detectCurrency,
  currencyLabel,
  IQD_RATE,
};

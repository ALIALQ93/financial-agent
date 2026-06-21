function parseAmount(value) {
  if (!value) return 0;
  const s = String(value).trim();
  const neg = s.includes('(') && s.includes(')');
  const n = parseFloat(s.replace(/[,"()]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return neg ? -Math.abs(n) : n;
}

function formatUSD(n, short = false) {
  if (short && Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M USD`;
  }
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD`;
}

function formatLocalCurrency(rec) {
  const val = Math.abs(rec.localValue || rec.net);
  const formatted = val.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const cur = rec.currency || 'USD';
  return `${formatted} ${cur}`;
}

function formatLocalAmount(amount, currency) {
  const formatted = Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `${formatted} ${currency || 'USD'}`;
}

function localVal(r) {
  const v = Math.abs(r.localValue);
  return v > 0 ? v : Math.abs(r.net);
}

function dominantCurrency(records) {
  const counts = {};
  for (const r of records) {
    if (r.currency) counts[r.currency] = (counts[r.currency] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'USD';
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
  const local = formatLocalCurrency(rec);
  const typeName = rec.recordType || TYPE_LABELS[cls];

  switch (cls) {
    case 'revenue':
      return `نوع: ${typeName} — إيراد ${formatUSD(Math.abs(net))} | بعملة المشروع: ${local}`;
    case 'expense':
      if (rec.recordType === 'خدمات') {
        return `نوع: خدمات — مصروف مدفوع ${formatUSD(net)} | بعملة المشروع: ${local}`;
      }
      return `نوع: ${typeName} — مصروف مدفوع ${formatUSD(net)} | بعملة المشروع: ${local}`;
    case 'reservation':
      return `نوع: ${typeName} — حجز ضمان ${formatUSD(net)} (منفصل عن الإيراد) | بعملة المشروع: ${local}`;
    case 'contractor':
      if (net > 0) return `نوع: ${typeName} — مصروف لم يُدفع بعد ${formatUSD(net)} | بعملة المشروع: ${local}`;
      if (net < 0) return `نوع: ${typeName} — أعمال/توريد ستُقدَّم لاحقاً ${formatUSD(Math.abs(net))} | بعملة المشروع: ${local}`;
      return `نوع: ${typeName} — متوازن`;
    case 'auction':
      if (net < 0) return `نوع: ${typeName} — ربح فرق عملة ${formatUSD(Math.abs(net))}`;
      if (net > 0) return `نوع: ${typeName} — خسارة فرق عملة ${formatUSD(net)}`;
      return `نوع: ${typeName}`;
    default:
      return `نوع: ${typeName} — صافي ${formatUSD(net)} | بعملة المشروع: ${local}`;
  }
}

function normalizeRecord(raw) {
  return {
    num: raw['#'],
    accountCode: (raw['الرمز'] || '').trim(),
    accountName: raw['الحساب'] || '',
    group: raw['الحساب الاب'] || '',
    projectCode: raw['اختصار المشروع'] || '',
    projectName: raw['المشروع'] || '',
    debit: parseAmount(raw['المدفوع']),
    credit: parseAmount(raw['المستحق']),
    net: parseAmount(raw['القيمة $']),
    recordType: raw['النوع'] || '',
    currency: raw['عملة المشروع'] || 'USD',
    exchangeRate: parseAmount(raw['تعادل العملة']) || 1,
    localValue: parseAmount(raw['القيمة حسب عملة المشروع']),
  };
}

function classifyRecord(rec) {
  const { accountCode, recordType } = rec;
  if (recordType === 'حجز') return 'reservation';
  if (recordType === 'ايراد') return 'revenue';
  if (recordType === 'مزاد') return 'auction';
  // نوع السجل أولاً — لا يُلغى بكود الحساب
  if (recordType === 'خدمات' || recordType === 'المصاريف') return 'expense';
  if (recordType === 'المقاوليين' || recordType === 'المجهزيين' || recordType === 'الموردين') {
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
  if (/الخدمات|خدمات/.test(q)) return 'خدمات';
  if (/المصاريف|مصاريف/.test(q)) return 'المصاريف';
  if (/التكاليف|تكاليف|مصروفات|المصروفات/.test(q)) return 'تكاليف';
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
  مزاد: 'مزاد',
  تكاليف: 'المصاريف + خدمات',
};

function filterByRecordType(records, typeKey) {
  if (!typeKey) return records;
  if (typeKey === 'تكاليف') {
    return records.filter(r => r.recordType === 'المصاريف' || r.recordType === 'خدمات');
  }
  if (typeKey === 'الموردين') {
    return records.filter(r =>
      r.recordType === 'الموردين' || r.recordType === 'المقاوليين' || r.recordType === 'المجهزيين'
    );
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
    if (!accounts.has(name)) accounts.set(name, { name, score: 0 });
    accounts.get(name).score = Math.max(
      accounts.get(name).score,
      scoreExpenseAccountMatch(name, query, groupName)
    );
  }
  return [...accounts.values()]
    .filter(a => {
      const accN = normalizeForSearch(a.name);
      const qNorm = normalizeForSearch(cleanQuery(query));
      if (accN.split(/\s+/).length === 1 && groupN.includes(accN)) return false;
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
  return {
    title: 'مجموعات مصاريف متشابهة — يرجى التحديد',
    headers: ['#', 'المجموعة (الحساب الاب)', 'عدد السجلات', 'إجمالي USD', 'تطابق السؤال'],
    rows: candidates.map((g, i) => {
      const s = sumExpenseGroupRows(records, g.name);
      return [
        String(i + 1),
        g.name,
        String(s.count),
        formatUSD(s.netUsd),
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
    const cur = dominantCurrency(scoped);
    const a = analyzeProjectRecords(scoped);
    const pct = a.totalCosts > 0 ? (s.netUsd / a.totalCosts) * 100 : 0;
    return [
      p.name,
      p.code,
      cur,
      String(s.count),
      formatUSD(s.netUsd),
      formatLocalAmount(Math.abs(s.netLocal), cur),
      pct.toFixed(1) + '%',
    ];
  }).filter(Boolean);

  const total = sumExpenseGroupRows(records, groupName);
  rows.push([
    'الإجمالي',
    '—',
    'USD',
    String(total.count),
    formatUSD(total.netUsd),
    '—',
    '—',
  ]);

  return {
    title: `مجموعة المصروف: ${groupName} — حسب المشروع`,
    headers: ['المشروع', 'الكود', 'العملة', 'عدد السجلات', 'مجموع USD', 'مجموع محلي', '% من تكاليف المشروع'],
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
  const cur = project ? dominantCurrency(scopeRecords) : 'USD';

  out += `**النطاق:** ${scopeLabel}\n`;
  out += `**المجموعة (الحساب الاب):** ${group.name}\n`;
  if (account) out += `**الحساب الفرعي:** ${account.name}\n`;
  out += `**عدد السجلات:** ${summary.count}\n`;
  out += `**مجموع USD:** ${formatUSD(summary.netUsd)}\n`;
  out += `**المعنى:** ${recordTypeMeaning('المصاريف', summary.netUsd)}\n\n`;

  if (!summary.count) {
    out += `⚠️ لا توجد سجلات في مجموعة "${group.name}"${project ? ` للمشروع ${project.name}` : ''}.\n`;
    return out;
  }

  if (scopeAll && !project) {
    out += `**[ ملخص حسب المشروع ]**\n`;
    out += `| المشروع | عدد | USD | % من تكاليف المشروع |\n|---------|-----|-----|---------------------|\n`;
    for (const p of getAllProjects(records)) {
      const scoped = filterByProject(records, p);
      const s = sumExpenseGroupRows(scoped, group.name, account?.name);
      if (!s.count) continue;
      const a = analyzeProjectRecords(scoped);
      const pct = a.totalCosts > 0 ? ((s.netUsd / a.totalCosts) * 100).toFixed(1) : '—';
      out += `| ${p.name} | ${s.count} | ${formatUSD(s.netUsd)} | ${pct}% |\n`;
    }
    out += '\n';
  }

  if (!account) {
    const byAccount = new Map();
    for (const r of summary.filtered) {
      byAccount.set(r.accountName, (byAccount.get(r.accountName) || 0) + r.net);
    }
    if (byAccount.size > 1) {
      out += `**[ حسب الحساب الفرعي ]**\n`;
      for (const [name, net] of [...byAccount.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))) {
        out += `- ${name}: ${formatUSD(net)}\n`;
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
  if (/إجمالي|كاملاً|كاملا|الشركة|شركة|ملخص الشركة|تقرير الشركة/.test(q) && !detectRecordType(query)) {
    return 'company';
  }
  if (/قارن|مقارنة|هامش|ترتيب|مقارنة بين/.test(q) && !detectRecordType(query)) return 'comparison';
  const expenseGroupQ = records?.length ? detectExpenseGroupQuery(query, records) : null;
  if (expenseGroupQ?.group) return 'expense_group';
  const typeQ = detectRecordTypeQuery(query, records);
  if (typeQ?.type) return 'record_type';
  if (/مقاول|مورد|مجهز/.test(q)) return 'contractor';
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
  return {
    title: 'مشاريع متشابهة — يرجى التحديد',
    headers: ['#', 'المشروع', 'الكود', 'العملة', 'الإيراد USD', 'التكاليف USD', 'تطابق السؤال'],
    rows: candidates.map((p, i) => {
      const a = analyzeProjectRecords(filterByProject(records, p));
      return [
        String(i + 1),
        p.name,
        p.code,
        a.currency,
        formatUSD(a.revenue),
        formatUSD(a.totalCosts),
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
  return records.filter(r =>
    r.projectName === project.name ||
    r.projectCode === project.code ||
    (project.code && r.projectCode.includes(project.code)) ||
    (project.name && r.projectName.includes(project.name))
  );
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
    const local = localVal(r);

    switch (cls) {
      case 'revenue':
        revenue += Math.abs(r.net);
        revenueLocal += local;
        break;
      case 'reservation':
        reservation += r.net;
        reservationLocal += local;
        break;
      case 'expense':
        expenses += r.net;
        expensesLocal += local;
        if (r.recordType === 'خدمات') expenseServices += r.net;
        expenseGroups.set(r.group, (expenseGroups.get(r.group) || 0) + r.net);
        expenseGroupsLocal.set(r.group, (expenseGroupsLocal.get(r.group) || 0) + local);
        break;
      case 'auction':
        auctionNet += r.net;
        break;
      case 'contractor': {
        const key = r.accountName;
        if (!contractors.has(key)) {
          contractors.set(key, { name: key, net: 0, projects: new Set() });
        }
        const c = contractors.get(key);
        c.net += r.net;
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

  let out = `## تقرير مشروع: ${project.name} (${project.code})\n\n`;
  out += `**[ ملخص تنفيذي — محسوب مسبقاً ]**\n`;
  out += `| البند | القيمة (USD) |\n|-------|-------------|\n`;
  out += `| الإيراد الكلي | ${formatUSD(a.revenue)} |\n`;
  out += `| المستلم فعلاً | ${formatUSD(a.received)} |\n`;
  out += `| الحجز لدى العميل | ${formatUSD(a.reservation)} |\n`;
  out += `| إجمالي التكاليف | ${formatUSD(a.totalCosts)} |\n`;
  out += `| الربح التقديري | ${formatUSD(a.profit)} |\n`;
  out += `| هامش الربح % | ${a.margin !== null ? a.margin.toFixed(1) + '%' : 'غير متاح (لا إيراد)'} |\n\n`;

  if (!a.hasRevenue) out += `⚠️ لا يوجد إيراد مسجل لهذا المشروع\n\n`;

  if (a.expenseList.length) {
    out += `**[ تفصيل التكاليف ]**\n`;
    for (const e of a.expenseList) {
      out += `- ${e.group}: ${formatUSD(e.amount)} (${e.pct.toFixed(1)}%)\n`;
    }
    out += '\n';
  }

  if (a.contractors.length) {
    out += `**[ المقاولين والمجهزين والموردين — نوع السجل: المقاوليين/المجهزيين/الموردين ]**\n`;
    out += `*(موجب = مصروف لم يُدفع بعد | سالب = أعمال/توريد ستُقدَّم لاحقاً)*\n`;
    out += `| الجهة | الصافي (USD) | الوضع |\n|-------|-------------|-------|\n`;
    for (const c of a.contractors) {
      out += `| ${c.name} | ${formatUSD(c.net)} | ${c.status} |\n`;
    }
    out += '\n';
  }

  if (a.auctionProfit || a.auctionLoss) {
    out += `**[ فرق العملة — نوع السجل: مزاد ]**\n`;
    if (a.auctionProfit) out += `- ربح: ${formatUSD(a.auctionProfit)}\n`;
    if (a.auctionLoss) out += `- خسارة: ${formatUSD(a.auctionLoss)}\n`;
    out += '\n';
  }

  return out;
}

function buildCompanyReport(records) {
  const projects = getAllProjects(records);
  const rows = projects.map(p => {
    const a = analyzeProjectRecords(filterByProject(records, p));
    return { ...p, ...a };
  });

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCosts = rows.reduce((s, r) => s + r.totalCosts, 0);
  const totalReservation = rows.reduce((s, r) => s + r.reservation, 0);
  const totalProfit = totalRevenue - totalCosts;
  const noRevenue = rows.filter(r => !r.hasRevenue).map(r => r.name);

  let out = `## تقرير الشركة الإجمالي — محسوب مسبقاً\n\n`;
  out += `- الإيرادات الكلية: ${formatUSD(totalRevenue, true)}\n`;
  out += `- التكاليف الكلية: ${formatUSD(totalCosts, true)}\n`;
  out += `- الحجوزات (منفصلة): ${formatUSD(totalReservation, true)}\n`;
  out += `- المستلم فعلاً: ${formatUSD(totalRevenue - totalReservation, true)}\n`;
  out += `- الربح التقديري: ${formatUSD(totalProfit, true)}\n`;
  out += `- هامش الربح: ${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) + '%' : 'غير متاح'}\n`;

  if (noRevenue.length) {
    out += `\n⚠️ مشاريع بلا إيراد مسجل (${noRevenue.length}):\n`;
    out += noRevenue.map(n => `- ${n}`).join('\n') + '\n';
  }

  return out;
}

function buildComparisonReport(records) {
  const projects = getAllProjects(records);
  const rows = projects.map(p => {
    const a = analyzeProjectRecords(filterByProject(records, p));
    return {
      name: p.name,
      code: p.code,
      revenue: a.revenue,
      costs: a.totalCosts,
      profit: a.profit,
      margin: a.margin,
      hasRevenue: a.hasRevenue,
    };
  }).filter(r => r.hasRevenue)
    .sort((a, b) => (b.margin ?? -999) - (a.margin ?? -999));

  let out = `## مقارنة المشاريع — محسوبة مسبقاً\n\n`;
  out += `| الترتيب | المشروع | الإيراد | التكاليف | الربح | الهامش % |\n`;
  out += `|---------|---------|---------|----------|-------|----------|\n`;

  rows.forEach((r, i) => {
    out += `| ${i + 1} | ${r.name} (${r.code}) | ${formatUSD(r.revenue)} | ${formatUSD(r.costs)} | ${formatUSD(r.profit)} | ${r.margin !== null ? r.margin.toFixed(1) + '%' : '—'} |\n`;
  });

  const noRev = projects.filter(p => !analyzeProjectRecords(filterByProject(records, p)).hasRevenue);
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

    for (const r of recs) {
      totalNet += r.net;
      const key = r.projectName;
      byProject.set(key, (byProject.get(key) || 0) + r.net);
    }

    const status = totalNet > 0 ? 'مصروف لم يُدفع بعد' :
      totalNet < 0 ? 'أعمال/توريد ستُقدَّم لاحقاً' : 'متوازن';

    out += `### ${name}\n`;
    out += `- الإجمالي: ${formatUSD(totalNet)} — ${status}\n`;
    out += `- حسب المشروع:\n`;
    for (const [proj, amt] of byProject) {
      out += `  - ${proj}: ${formatUSD(amt)}\n`;
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
      currency: a.currency,
      hasRevenue: a.hasRevenue,
      revenue: a.revenue,
    };
  }).sort((a, b) => {
    if (a.hasRevenue !== b.hasRevenue) return Number(b.hasRevenue) - Number(a.hasRevenue);
    return b.revenue - a.revenue;
  });
}

function projectSummaryRows(a) {
  return [
    ['الإيراد الكلي', formatUSD(a.revenue), formatLocalAmount(a.revenueLocal, a.currency), 'نوع: ايراد'],
    ['الحجز لدى العميل', formatUSD(a.reservation), formatLocalAmount(a.reservationLocal, a.currency), 'نوع: حجز'],
    ['المستلم فعلاً', formatUSD(a.received), formatLocalAmount(a.receivedLocal, a.currency), 'إيراد − حجز'],
    ['إجمالي التكاليف', formatUSD(a.totalCosts), formatLocalAmount(a.totalCostsLocal, a.currency), 'مصاريف وخدمات مدفوعة'],
    ['الربح التقديري', formatUSD(a.profit), formatLocalAmount(a.profitLocal, a.currency), 'إيراد − تكاليف'],
    ['هامش الربح', a.margin !== null ? a.margin.toFixed(1) + '%' : '—', '—', '—'],
  ];
}

function buildDetailTable(records, title, limit = 50) {
  const rows = records.slice(0, limit).map(r => [
    r.recordType,
    r.accountCode,
    r.accountName.length > 40 ? r.accountName.slice(0, 40) + '…' : r.accountName,
    formatUSD(r.net),
    formatLocalCurrency(r),
    r.currency,
    interpretRecord(r).split(' | ')[0],
  ]);

  return {
    title,
    headers: ['نوع السجل', 'كود الحساب', 'اسم الحساب', 'الصافي (USD)', 'القيمة بعملة المشروع', 'العملة', 'المعنى'],
    rows,
  };
}

function buildRecordTypeByProjectTable(records, typeKey) {
  const projects = getAllProjects(records);
  const rows = projects.map(p => {
    const scoped = filterByProject(records, p);
    const s = sumRecordTypeRows(scoped, typeKey);
    if (!s.count) return null;
    const cur = dominantCurrency(scoped);
    return [
      p.name,
      p.code,
      cur,
      String(s.count),
      typeKey === 'ايراد' ? formatUSD(s.netUsd) : formatUSD(s.netUsd),
      formatLocalAmount(Math.abs(s.netLocal), cur),
      recordTypeMeaning(typeKey, s.netUsd),
    ];
  }).filter(Boolean);

  const total = sumRecordTypeRows(records, typeKey);
  const totalCur = 'USD';
  rows.push([
    'الإجمالي',
    '—',
    totalCur,
    String(total.count),
    formatUSD(total.netUsd),
    '—',
    recordTypeMeaning(typeKey, total.netUsd),
  ]);

  return {
    title: `تقرير نوع السجل: ${RECORD_TYPE_LABEL[typeKey]} — حسب المشروع`,
    headers: ['المشروع', 'الكود', 'العملة', 'عدد السجلات', 'مجموع USD', 'مجموع محلي', 'المعنى'],
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

  out += `**النطاق:** ${scopeLabel}\n`;
  out += `**عدد السجلات:** ${summary.count}\n`;
  out += `**مجموع USD:** ${formatUSD(summary.netUsd)}\n`;
  out += `**المعنى:** ${recordTypeMeaning(type, summary.netUsd)}\n\n`;

  if (!summary.count) {
    out += `⚠️ لا توجد سجلات من نوع "${label}" في هذا النطاق.\n`;
    return out;
  }

  if (scopeAll && !project) {
    const projects = getAllProjects(records);
    out += `**[ ملخص حسب المشروع ]**\n`;
    out += `| المشروع | عدد | USD | المعنى |\n|---------|-----|-----|--------|\n`;
    for (const p of projects) {
      const s = sumRecordTypeRows(filterByProject(records, p), type);
      if (!s.count) continue;
      out += `| ${p.name} | ${s.count} | ${formatUSD(s.netUsd)} | ${recordTypeMeaning(type, s.netUsd)} |\n`;
    }
    out += '\n';
  }

  if (['المقاوليين', 'المجهزيين', 'الموردين'].includes(type)) {
    const byAccount = new Map();
    for (const r of summary.filtered) {
      const key = r.accountName;
      byAccount.set(key, (byAccount.get(key) || 0) + r.net);
    }
    out += `**[ حسب الجهة ]**\n`;
    for (const [name, net] of [...byAccount.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))) {
      out += `- ${name}: ${formatUSD(net)} — ${recordTypeMeaning(type, net)}\n`;
    }
    out += '\n';
  }

  return out;
}

function buildVisuals(records, userMessage) {
  const query = cleanQuery(userMessage);
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
        const cur = project ? dominantCurrency(scopeRecords) : dominantCurrency(summary.filtered);

        if (scopeAll && !project) {
          tables.push(buildExpenseGroupByProjectTable(records, group.name));
          const projects = getAllProjects(records);
          const chartData = projects.map(p => {
            const s = sumExpenseGroupRows(filterByProject(records, p), group.name, account?.name);
            return { label: (p.code || p.name).slice(0, 16), value: s.netUsd, count: s.count };
          }).filter(x => x.count > 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

          if (chartData.length > 1) {
            charts.push({
              type: 'bar',
              title: `${group.name} — حسب المشروع (USD)`,
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
            ['مجموع USD', formatUSD(summary.netUsd)],
            ['مجموع محلي', formatLocalAmount(Math.abs(summary.netLocal), cur)],
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
            byAccount.set(r.accountName, (byAccount.get(r.accountName) || 0) + r.net);
          }
          if (byAccount.size > 1) {
            tables.push({
              title: `${group.name} — حسب الحساب الفرعي`,
              headers: ['الحساب', 'الصافي USD', 'المعنى'],
              rows: [...byAccount.entries()]
                .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                .map(([name, net]) => [name, formatUSD(net), recordTypeMeaning('المصاريف', net)]),
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
    const all = getAllProjects(records);
    const rows = all.map(p => {
      const a = analyzeProjectRecords(filterByProject(records, p));
      return [
        p.name,
        a.currency,
        formatUSD(a.revenue),
        formatLocalAmount(a.revenueLocal, a.currency),
        formatUSD(a.totalCosts),
        formatLocalAmount(a.totalCostsLocal, a.currency),
        a.margin !== null ? a.margin.toFixed(1) + '%' : '—',
      ];
    });

    tables.push({
      title: 'ملخص الشركة — حسب المشروع',
      headers: ['المشروع', 'العملة', 'الإيراد USD', 'الإيراد محلي', 'التكاليف USD', 'التكاليف محلي', 'الهامش %'],
      rows,
    });

    const top = all.map(p => ({
      label: p.code || p.name.slice(0, 15),
      revenue: analyzeProjectRecords(filterByProject(records, p)).revenue,
      costs: analyzeProjectRecords(filterByProject(records, p)).totalCosts,
    })).filter(x => x.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    if (top.length) {
      charts.push({
        type: 'bar',
        title: 'الإيراد مقابل التكاليف — أبرز المشاريع',
        labels: top.map(x => x.label),
        datasets: [
          { label: 'الإيراد', data: top.map(x => x.revenue), color: CHART_THEME.revenue },
          { label: 'التكاليف', data: top.map(x => x.costs), color: CHART_THEME.costs },
        ],
      });
    }
  }

  if (intent === 'comparison') {
    const all = getAllProjects(records);
    const rows = all.map(p => {
      const a = analyzeProjectRecords(filterByProject(records, p));
      if (!a.hasRevenue) return null;
      return [
        p.name,
        a.currency,
        formatUSD(a.revenue),
        formatLocalAmount(a.revenueLocal, a.currency),
        formatUSD(a.totalCosts),
        formatLocalAmount(a.totalCostsLocal, a.currency),
        formatUSD(a.profit),
        a.margin !== null ? a.margin.toFixed(1) + '%' : '—',
      ];
    }).filter(Boolean).sort((a, b) => parseFloat(b[7]) - parseFloat(a[7]));

    rows.forEach((r, i) => r.unshift(String(i + 1)));

    tables.push({
      title: 'مقارنة المشاريع — USD وبعملة كل مشروع',
      headers: ['#', 'المشروع', 'العملة', 'الإيراد USD', 'الإيراد محلي', 'التكاليف USD', 'التكاليف محلي', 'الربح USD', 'الهامش %'],
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
        title: 'مقارنة الإيراد والتكاليف (USD)',
        labels: withRevenue.map(x => (x.p.code || x.p.name).slice(0, 14)),
        datasets: [
          { label: 'الإيراد', data: withRevenue.map(x => x.a.revenue), color: CHART_THEME.revenue },
          { label: 'التكاليف', data: withRevenue.map(x => x.a.totalCosts), color: CHART_THEME.costs },
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
      tables.push(buildRecordTypeByProjectTable(records, typeQuery.type));
      const projects = getAllProjects(records);
      const chartData = projects.map(p => {
        const s = sumRecordTypeRows(filterByProject(records, p), typeQuery.type);
        return { label: (p.code || p.name).slice(0, 16), value: s.netUsd, count: s.count };
      }).filter(x => x.count > 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

      if (chartData.length > 1) {
        charts.push({
          type: 'bar',
          title: `مجموع ${typeQuery.label} — حسب المشروع (USD)`,
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
      const scoped = filterByProject(records, typeQuery.project);
      const summary = sumRecordTypeRows(scoped, typeQuery.type);
      const cur = dominantCurrency(scoped);

      tables.push({
        title: `${typeQuery.label} — ${typeQuery.project.name}`,
        headers: ['البند', 'القيمة'],
        rows: [
          ['عدد السجلات', String(summary.count)],
          ['مجموع USD', formatUSD(summary.netUsd)],
          ['مجموع محلي', formatLocalAmount(Math.abs(summary.netLocal), cur)],
          ['المعنى', recordTypeMeaning(typeQuery.type, summary.netUsd)],
        ],
      });

      if (['المقاوليين', 'المجهزيين', 'الموردين'].includes(typeQuery.type)) {
        const byAccount = new Map();
        for (const r of summary.filtered) {
          byAccount.set(r.accountName, (byAccount.get(r.accountName) || 0) + r.net);
        }
        tables.push({
          title: `${typeQuery.label} — حسب الجهة`,
          headers: ['الجهة', 'الصافي USD', 'الوضع'],
          rows: [...byAccount.entries()]
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
            .map(([name, net]) => [name, formatUSD(net), recordTypeMeaning(typeQuery.type, net)]),
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

      tables.push({
        title: `ملخص مشروع: ${project.name} (${a.currency})`,
        headers: ['البند', 'الصافي (USD)', 'القيمة بعملة المشروع', 'نوع السجل / المعنى'],
        rows: projectSummaryRows(a),
      });

      if (a.expenseList.length) {
        tables.push({
          title: 'تفصيل التكاليف حسب المجموعة',
          headers: ['المجموعة', 'الصافي (USD)', `بعملة المشروع (${a.currency})`, 'النسبة %'],
          rows: a.expenseList.map(e => [
            e.group,
            formatUSD(e.amount),
            formatLocalAmount(e.amountLocal, a.currency),
            e.pct.toFixed(1) + '%',
          ]),
        });

        charts.push({
          type: 'doughnut',
          title: 'توزيع التكاليف',
          labels: a.expenseList.slice(0, 8).map(e => e.group.slice(0, 20)),
          datasets: [{ label: 'التكاليف', data: a.expenseList.slice(0, 8).map(e => e.amount) }],
          colors: CHART_THEME.palette,
        });
      }

      if (a.contractors.length) {
        tables.push({
          title: 'المقاولين والمجهزين والموردين',
          headers: ['الجهة', 'الصافي (USD)', 'نوع السجل', 'الوضع'],
          rows: a.contractors.map(c => [c.name, formatUSD(c.net), 'المقاوليين/المجهزيين/الموردين', c.status]),
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

    for (const name of matched.slice(0, 3)) {
      const recs = contractorRecs.filter(r => r.accountName === name);
      tables.push({
        title: name,
        headers: ['المشروع', 'الصافي (USD)', 'القيمة بعملة المشروع', 'الوضع'],
        rows: recs.map(r => [
          r.projectName,
          formatUSD(r.net),
          formatLocalCurrency(r),
          r.net > 0 ? 'مصروف لم يُدفع بعد' : r.net < 0 ? 'أعمال/توريد لاحقاً' : 'متوازن',
        ]),
      });
    }
  }

  if (intent === 'no_revenue') {
    const list = getAllProjects(records).filter(p =>
      !analyzeProjectRecords(filterByProject(records, p)).hasRevenue
    );
    tables.push({
      title: 'مشاريع بلا إيراد مسجل',
      headers: ['المشروع', 'كود المشروع', 'التكاليف (USD)', 'ملاحظة'],
      rows: list.map(p => {
        const a = analyzeProjectRecords(filterByProject(records, p));
        return [p.name, p.code, formatUSD(a.totalCosts), 'لا يوجد سجل نوع: ايراد'];
      }),
    });
  }

  return { tables, charts };
}

function buildContext(records, userMessage) {
  const role = extractRole(userMessage);
  const query = cleanQuery(userMessage);
  const intent = detectIntent(query, records);

  let out = `تاريخ البيانات: من Google Sheets\n`;
  out += `عدد السجلات: ${records.length} | عدد المشاريع: ${getAllProjects(records).length}\n`;
  if (role) out += `دور المستخدم المحدد: **${role}**\n`;
  const expenseGroupQ = detectExpenseGroupQuery(query, records);
  if (expenseGroupQ?.group) out += `مجموعة المصروف: **${expenseGroupQ.group.name}**\n`;
  else {
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
  extractRole,
  cleanQuery,
  detectIntent,
  detectRecordType,
  detectRecordTypeQuery,
  detectExpenseGroupQuery,
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
};

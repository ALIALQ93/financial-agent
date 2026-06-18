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
  contractor: 'مقاول/مورد',
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
      return `نوع: ${typeName} — مصروف ${formatUSD(net)} | بعملة المشروع: ${local}`;
    case 'services':
      return `نوع: ${typeName} — تكلفة خدمة ${formatUSD(net)} | بعملة المشروع: ${local}`;
    case 'reservation':
      return `نوع: ${typeName} — حجز ضمان ${formatUSD(net)} (منفصل عن الإيراد) | بعملة المشروع: ${local}`;
    case 'contractor':
      if (net > 0) return `نوع: ${typeName} — مستحق للمقاول ${formatUSD(net)} | بعملة المشروع: ${local}`;
      if (net < 0) return `نوع: ${typeName} — دفعة مقدمة من الشركة ${formatUSD(Math.abs(net))} | بعملة المشروع: ${local}`;
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
  if (recordType === 'حجز' || accountCode.startsWith('11')) return 'reservation';
  if (recordType === 'ايراد') return 'revenue';
  if (recordType === 'مزاد') return 'auction';
  if (recordType === 'المقاوليين' || recordType === 'المجهزيين' || accountCode.startsWith('20')) {
    return 'contractor';
  }
  if (recordType === 'خدمات') return 'services';
  if (recordType === 'المصاريف' || accountCode.startsWith('32')) return 'expense';
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

function detectIntent(query) {
  const q = query.toLowerCase();
  if (/إجمالي|كاملاً|كاملا|الشركة|شركة|ملخص الشركة|تقرير الشركة/.test(q)) return 'company';
  if (/قارن|مقارنة|هامش|ترتيب|مقارنة بين/.test(q)) return 'comparison';
  if (/مقاول|مورد|مجهز/.test(q)) return 'contractor';
  if (/بلا إيراد|لا إيراد|بدون إيراد|لا تحتوي.*ايراد|مشاريع.*إيراد/.test(q)) return 'no_revenue';
  if (/تقرير|مشروع|034|001|020|057|karbala|كربلاء|ohtl|واحة|غراف|زيونة/.test(q)) return 'project';
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

function scoreProjectMatch(project, query) {
  const q = query.toLowerCase();
  const name = (project.name || '').toLowerCase();
  const code = (project.code || '').toLowerCase();
  let score = 0;

  const nums = q.match(/\d{2,4}/g) || [];
  for (const n of nums) {
    if (code.includes(n) || name.includes(n)) score += 10;
  }

  const keywords = [
    ['ohtl', 'ohtl'], ['upgrade', 'upgrade'], ['034', '034'],
    ['karbala', 'karbala'], ['كربلاء', 'karbala'], ['واحة', 'waha'], ['al-waha', 'waha'],
    ['chemical', 'chemical'], ['fsf', 'fsf'], ['epcc', 'epcc'],
    ['001', '001'], ['غراف', 'غراف'], ['زيونة', 'زيونة'],
    ['single', 'single'], ['diesel', 'diesel'], ['057', '057'],
    ['020', '020'], ['power', 'power'], ['pip', 'pip'],
  ];

  for (const [ar, en] of keywords) {
    if (q.includes(ar) && (name.includes(en) || code.includes(en) || name.includes(ar))) {
      score += 8;
    }
  }

  if (q.includes(name) || name.includes(q.slice(0, 10))) score += 5;
  if (code && q.includes(code)) score += 12;

  return score;
}

function findMatchingProjects(records, query) {
  const projects = getAllProjects(records);
  return projects
    .map(p => ({ ...p, score: scoreProjectMatch(p, query) }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score);
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
  let services = 0;
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
        expenseGroups.set(r.group, (expenseGroups.get(r.group) || 0) + r.net);
        expenseGroupsLocal.set(r.group, (expenseGroupsLocal.get(r.group) || 0) + local);
        break;
      case 'services':
        services += r.net;
        expenses += r.net;
        expensesLocal += local;
        expenseGroups.set('خدمات', (expenseGroups.get('خدمات') || 0) + r.net);
        expenseGroupsLocal.set('خدمات', (expenseGroupsLocal.get('خدمات') || 0) + local);
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
    if (c.net < -50000) alerts.push(`دفعة مقدمة كبيرة: ${c.name}`);
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
    services,
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
      status: c.net > 0 ? 'مستحق للمقاول' : c.net < 0 ? 'دفعة مقدمة من الشركة' : 'متوازن',
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
    out += `**[ وضع المقاولين — نوع السجل: المقاوليين/المجهزيين ]**\n`;
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

  let out = `## وضع المقاولين والموردين — محسوب مسبقاً\n\n`;

  for (const name of matched) {
    const recs = contractorRecords.filter(r => r.accountName === name);
    const byProject = new Map();
    let totalNet = 0;

    for (const r of recs) {
      totalNet += r.net;
      const key = r.projectName;
      byProject.set(key, (byProject.get(key) || 0) + r.net);
    }

    const status = totalNet > 0 ? 'مستحق للمقاول على الشركة' :
      totalNet < 0 ? 'دفعة مقدمة من الشركة للمقاول' : 'متوازن';

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
    ['إجمالي التكاليف', formatUSD(a.totalCosts), formatLocalAmount(a.totalCostsLocal, a.currency), 'مصاريف + خدمات'],
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

function buildVisuals(records, userMessage) {
  const query = cleanQuery(userMessage);
  const intent = detectIntent(query);
  const projects = findMatchingProjects(records, query);
  const tables = [];
  const charts = [];

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

  if (intent === 'project' && projects.length) {
    const project = projects[0];
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
        title: 'وضع المقاولين والموردين',
        headers: ['الجهة', 'الصافي (USD)', 'نوع السجل', 'الوضع'],
        rows: a.contractors.map(c => [c.name, formatUSD(c.net), 'المقاوليين/المجهزيين', c.status]),
      });
    }

    tables.push(buildDetailTable(filtered, 'سجلات المشروع التفصيلية', 40));
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
          r.net > 0 ? 'مستحق للمقاول' : r.net < 0 ? 'دفعة مقدمة' : 'متوازن',
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
  const intent = detectIntent(query);
  const projects = findMatchingProjects(records, query);

  let out = `تاريخ البيانات: من Google Sheets\n`;
  out += `عدد السجلات: ${records.length} | عدد المشاريع: ${getAllProjects(records).length}\n`;
  if (role) out += `دور المستخدم المحدد: **${role}**\n`;
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
    case 'project':
      if (projects.length === 1) {
        out += buildProjectReport(records, projects[0]);
      } else if (projects.length > 1) {
        out += `⚠️ وُجد أكثر من مشروع محتمل — اطلب التوضيح:\n`;
        projects.slice(0, 5).forEach(p => { out += `- ${p.name} (${p.code})\n`; });
        out += '\n' + buildProjectReport(records, projects[0]);
        out += `\n(التقرير أعلاه للمشروع الأقرب للسؤال: ${projects[0].name})\n`;
      } else {
        out += buildCompanyReport(records);
        out += '\n⚠️ لم يُحدد مشروع — يُعرض التقرير الإجمالي. المشاريع المتاحة:\n';
        getAllProjects(records).forEach(p => { out += `- ${p.name} (${p.code})\n`; });
      }
      break;
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
  findMatchingProjects,
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

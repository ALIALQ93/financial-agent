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
  if (/إجمالي|كاملاً|كاملا|الشركة|شركة/.test(q)) return 'company';
  if (/قارن|مقارنة|هامش|ترتيب/.test(q)) return 'comparison';
  if (/مقاول|مورد|مجهز/.test(q)) return 'contractor';
  if (/بلا إيراد|لا إيراد|بدون إيراد|مشاريع.*إيراد/.test(q)) return 'no_revenue';
  if (/تقرير|مشروع|034|001|020|057|karbala|ohtl|واحة|غراف|زيونة/.test(q)) return 'project';
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
    ['karbala', 'karbala'], ['واحة', 'waha'], ['al-waha', 'waha'],
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
  let reservation = 0;
  let expenses = 0;
  let services = 0;
  let auctionNet = 0;
  const expenseGroups = new Map();
  const contractors = new Map();
  const alerts = [];

  for (const r of records) {
    const cls = classifyRecord(r);

    switch (cls) {
      case 'revenue':
        revenue += Math.abs(r.net);
        break;
      case 'reservation':
        reservation += r.net;
        break;
      case 'expense':
        expenses += r.net;
        expenseGroups.set(r.group, (expenseGroups.get(r.group) || 0) + r.net);
        break;
      case 'services':
        services += r.net;
        expenses += r.net;
        expenseGroups.set('خدمات', (expenseGroups.get('خدمات') || 0) + r.net);
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
      pct: totalCosts > 0 ? (amount / totalCosts) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const salaries = expenseGroups.get('مصاريف الرواتب والاجور') || 0;
  if (totalCosts > 0 && salaries / totalCosts > 0.3) {
    alerts.push('مصاريف الرواتب > 30% من التكاليف');
  }

  return {
    revenue,
    reservation,
    received,
    totalCosts,
    services,
    profit,
    margin,
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
    out += `**[ وضع المقاولين والموردين ]**\n`;
    out += `| الجهة | المبلغ (USD) | الوضع |\n|-------|-------------|-------|\n`;
    for (const c of a.contractors) {
      out += `| ${c.name} | ${formatUSD(c.net)} | ${c.status} |\n`;
    }
    out += '\n';
  }

  if (a.auctionProfit || a.auctionLoss) {
    out += `**[ فرق العملة / المزاد ]**\n`;
    if (a.auctionProfit) out += `- ربح فرق عملة: ${formatUSD(a.auctionProfit)}\n`;
    if (a.auctionLoss) out += `- خسارة فرق عملة: ${formatUSD(a.auctionLoss)}\n`;
    out += '\n';
  }

  if (a.alerts.length) {
    out += `**[ 🚨 تنبيهات ]**\n${a.alerts.map(x => `- ${x}`).join('\n')}\n\n`;
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
  extractRole,
  cleanQuery,
  detectIntent,
};

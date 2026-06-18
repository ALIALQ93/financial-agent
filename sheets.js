const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_GID = process.env.GOOGLE_SHEET_GID || '0';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = { text: null, rows: null, fetchedAt: 0 };

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || (c === '\r' && next === '\n')) {
      row.push(field);
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
      field = '';
      if (c === '\r') i++;
    } else if (c !== '\r') {
      field += c;
    }
  }

  if (field || row.length) {
    row.push(field);
    if (row.some(cell => cell.trim())) rows.push(row);
  }

  return rows;
}

function parseAmount(value) {
  if (!value) return 0;
  const n = parseFloat(String(value).replace(/[,"()]/g, '').replace(/^\((.+)\)$/, '-$1'));
  return Number.isFinite(n) ? n : 0;
}

function formatAmount(n) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

async function fetchSheetRows() {
  if (!SHEET_ID) return null;

  const now = Date.now();
  if (cache.rows && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rows;
  }

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`تعذّر قراءة Google Sheet (رمز ${res.status}). تأكد أن الجدول مشارَك للعرض.`);
  }

  const text = await res.text();
  const rows = parseCSV(text);
  cache = { text, rows, fetchedAt: now };
  return rows;
}

function rowsToRecords(rows) {
  if (!rows?.length) return [];

  const header = rows[0];
  return rows.slice(1).map(cells => {
    const rec = {};
    header.forEach((col, i) => { rec[col] = cells[i] || ''; });
    return rec;
  });
}

function buildProjectSummary(records) {
  const byProject = new Map();

  for (const r of records) {
    const project = r['المشروع'] || r['اختصار المشروع'] || 'غير محدد';
    const code = r['اختصار المشروع'] || '';
    const type = r['النوع'] || 'غير محدد';
    const amount = parseAmount(r['القيمة $']);

    if (!byProject.has(project)) {
      byProject.set(project, { code, expenses: 0, revenue: 0, rows: 0 });
    }

    const entry = byProject.get(project);
    entry.rows++;
    if (type.includes('إيراد') || type.includes('ايراد')) {
      entry.revenue += amount;
    } else {
      entry.expenses += amount;
    }
  }

  return [...byProject.entries()]
    .map(([name, data]) => ({
      name,
      code: data.code,
      expenses: data.expenses,
      revenue: data.revenue,
      net: data.revenue - data.expenses,
      rows: data.rows,
    }))
    .sort((a, b) => Math.abs(b.expenses) - Math.abs(a.expenses));
}

function matchesQuery(record, query) {
  const q = query.toLowerCase();
  const haystack = [
    record['المشروع'],
    record['اختصار المشروع'],
    record['الحساب'],
    record['الحساب الاب'],
    record['النوع'],
    record['الرمز'],
  ].join(' ').toLowerCase();

  const tokens = q.split(/\s+/).filter(t => t.length > 2);
  if (!tokens.length) return false;
  return tokens.some(t => haystack.includes(t));
}

function formatRecord(r) {
  return [
    r['اختصار المشروع'],
    r['المشروع'],
    r['الحساب'],
    r['النوع'],
    r['القيمة $'],
    r['عملة المشروع'],
  ].filter(Boolean).join(' | ');
}

async function buildSheetContext(userMessage) {
  if (!SHEET_ID) return '';

  const rows = await fetchSheetRows();
  const records = rowsToRecords(rows);
  if (!records.length) return '';

  const summary = buildProjectSummary(records);
  const totalExpenses = summary.reduce((s, p) => s + p.expenses, 0);
  const totalRevenue = summary.reduce((s, p) => s + p.revenue, 0);

  const summaryLines = summary.map(p =>
    `- ${p.name}${p.code ? ` (${p.code})` : ''}: مصاريف $${formatAmount(p.expenses)}` +
    (p.revenue ? `، إيراد $${formatAmount(p.revenue)}` : '') +
    `، صافي $${formatAmount(p.net)}`
  );

  const relevant = records.filter(r => matchesQuery(r, userMessage)).slice(0, 40);
  const relevantLines = relevant.map(formatRecord);

  let context = `بيانات مالية من Google Sheets (${records.length} سجل، ${summary.length} مشروع):\n`;
  context += `إجمالي المصاريف: $${formatAmount(totalExpenses)}\n`;
  context += `إجمالي الإيرادات: $${formatAmount(totalRevenue)}\n`;
  context += `صافي الشركة: $${formatAmount(totalRevenue - totalExpenses)}\n\n`;
  context += `ملخص المشاريع:\n${summaryLines.join('\n')}`;

  if (relevantLines.length) {
    context += `\n\nسجلات ذات صلة بالسؤال (${relevantLines.length}):\n${relevantLines.join('\n')}`;
  }

  const MAX = 28000;
  if (context.length > MAX) {
    context = context.slice(0, MAX) + '\n...[مختصر]';
  }

  return context;
}

function isSheetConfigured() {
  return Boolean(SHEET_ID);
}

module.exports = {
  buildSheetContext,
  isSheetConfigured,
  fetchSheetRows,
};

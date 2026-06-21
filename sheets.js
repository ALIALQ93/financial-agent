const { normalizeRecord, buildContext, buildVisuals, getProjectsForUI, getExpenseGroupsForUI, getExpenseAccountsForUI } = require('./analytics');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_GID = process.env.GOOGLE_SHEET_GID || '0';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = { rows: null, fetchedAt: 0 };

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
      continue;
    }

    if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || (c === '\r' && next === '\n')) {
      row.push(field);
      if (row.some(cell => cell.trim())) rows.push(row);
      row = []; field = '';
      if (c === '\r') i++;
    } else if (c !== '\r') field += c;
  }

  if (field || row.length) {
    row.push(field);
    if (row.some(cell => cell.trim())) rows.push(row);
  }

  return rows;
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
  cache = { rows, fetchedAt: now };
  return rows;
}

function rowsToRecords(rows) {
  if (!rows?.length) return [];
  const header = rows[0];
  return rows.slice(1).map(cells => {
    const raw = {};
    header.forEach((col, i) => { raw[col] = cells[i] || ''; });
    return normalizeRecord(raw);
  });
}

async function buildSheetReport(userMessage) {
  if (!SHEET_ID) return { context: '', tables: [], charts: [] };

  const rows = await fetchSheetRows();
  const records = rowsToRecords(rows);
  if (!records.length) return { context: '', tables: [], charts: [] };

  const visuals = buildVisuals(records, userMessage);
  return {
    context: buildContext(records, userMessage),
    tables: visuals.tables,
    charts: visuals.charts,
  };
}

async function buildSheetContext(userMessage) {
  const report = await buildSheetReport(userMessage);
  return report.context;
}

function isSheetConfigured() {
  return Boolean(SHEET_ID);
}

async function listProjects() {
  if (!SHEET_ID) return [];
  const rows = await fetchSheetRows();
  const records = rowsToRecords(rows);
  return getProjectsForUI(records);
}

async function listExpenseGroups({ projectCode, projectName } = {}) {
  if (!SHEET_ID) return [];
  const rows = await fetchSheetRows();
  const records = rowsToRecords(rows);
  return getExpenseGroupsForUI(records, { projectCode, projectName });
}

async function listExpenseAccounts({ projectCode, projectName, groupName } = {}) {
  if (!SHEET_ID) return [];
  const rows = await fetchSheetRows();
  const records = rowsToRecords(rows);
  return getExpenseAccountsForUI(records, { projectCode, projectName, groupName });
}

module.exports = {
  buildSheetContext,
  buildSheetReport,
  listProjects,
  listExpenseGroups,
  listExpenseAccounts,
  isSheetConfigured,
  fetchSheetRows,
};

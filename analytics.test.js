const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  detectIntent,
  detectExpenseGroupQuery,
  detectAccountQuery,
  filterByAccount,
  sumAccountRows,
  filterByExpenseGroup,
  sumExpenseGroupRows,
  buildContext,
  buildVisuals,
  detectCurrency,
  money,
  setDisplayCurrency,
} = require('./analytics');

function mockRec(overrides = {}) {
  return {
    num: '1',
    accountCode: '3201',
    accountName: 'فحص مواد',
    group: 'مصاريف الفحص والاختبار',
    projectCode: 'KPI',
    projectName: 'Karbala PIP',
    debit: 0,
    credit: 0,
    net: 12500,
    recordType: 'المصاريف',
    currency: 'USD',
    exchangeRate: 1,
    localValue: 12500,
    ...overrides,
  };
}

const records = [
  mockRec(),
  mockRec({ accountName: 'اختبار QC', net: 8300, localValue: 8300 }),
  mockRec({
    group: 'مصاريف الرواتب والاجور',
    accountName: 'رواتب',
    net: 45000,
    localValue: 45000,
  }),
  mockRec({
    projectCode: 'WH',
    projectName: 'Al-Waha',
    group: 'مصاريف الفحص والاختبار',
    accountName: 'فحص',
    net: 3200,
    localValue: 4704000,
    currency: 'IQD',
  }),
  mockRec({
    group: 'مصاريف الفحص الميداني',
    accountName: 'فحص موقع',
    net: 2100,
    localValue: 2100,
  }),
];

describe('expense group detection', () => {
  it('detects specific expense group on a project', () => {
    const q = 'مصاريف الفحص والاختبار مشروع Karbala PIP';
    assert.equal(detectIntent(q, records), 'expense_group');
    const eg = detectExpenseGroupQuery(q, records);
    assert.equal(eg.group.name, 'مصاريف الفحص والاختبار');
    assert.equal(eg.project.name, 'Karbala PIP');
  });

  it('keeps broad expense query as record_type', () => {
    const q = 'مصاريف مشروع Karbala PIP';
    assert.equal(detectIntent(q, records), 'record_type');
  });

  it('filters records by expense group', () => {
    const scoped = filterByExpenseGroup(
      records.filter(r => r.projectName === 'Karbala PIP'),
      'مصاريف الفحص والاختبار'
    );
    assert.equal(scoped.length, 2);
    assert.equal(sumExpenseGroupRows(records.filter(r => r.projectName === 'Karbala PIP'), 'مصاريف الفحص والاختبار').netUsd, 20800);
  });

  it('builds context with computed group totals', () => {
    const ctx = buildContext(records, 'كم مصاريف الفحص والاختبار على Karbala PIP');
    assert.match(ctx, /مجموعة المصروف: \*\*مصاريف الفحص والاختبار\*\*/);
    assert.match(ctx, /20,800 USD/);
    assert.match(ctx, /نوع السؤال المكتشف: expense_group/);
  });

  it('builds visuals with summary and detail tables', () => {
    const { tables } = buildVisuals(records, 'مصاريف الفحص والاختبار — Karbala PIP');
    assert.ok(tables.some(t => t.title.includes('مصاريف الفحص والاختبار')));
    assert.ok(tables.some(t => t.headers?.includes('نوع السجل')));
  });

  it('supports company-wide expense group scope', () => {
    const q = 'مصاريف الفحص والاختبار كل المشاريع';
    assert.equal(detectIntent(q, records), 'expense_group');
    const total = sumExpenseGroupRows(records, 'مصاريف الفحص والاختبار');
    assert.equal(total.netUsd, 24000);
    const { tables } = buildVisuals(records, q);
    assert.ok(tables.some(t => t.title.includes('حسب المشروع')));
  });

  it('lists expense groups and accounts for UI', () => {
    const { getExpenseGroupsForUI, getExpenseAccountsForUI } = require('./analytics');
    const groups = getExpenseGroupsForUI(records);
    assert.ok(groups.some(g => g.name === 'مصاريف الفحص والاختبار'));
    const accounts = getExpenseAccountsForUI(records, {
      groupName: 'مصاريف الفحص والاختبار',
      projectName: 'Karbala PIP',
    });
    assert.equal(accounts.length, 2);
    assert.equal(accounts.reduce((s, a) => s + a.totalUsd, 0), 20800);
    assert.ok(accounts.every(a => 'code' in a));
  });
});

const accountRecords = [
  mockRec({ accountName: 'اختبار QC', accountCode: '3255', net: 8300, localValue: 8300 }),
  mockRec({
    accountName: 'اختبار QC',
    accountCode: '3255',
    projectCode: 'WH',
    projectName: 'Al-Waha',
    currency: 'IQD',
    net: 3200,
    localValue: 4704000,
  }),
  mockRec({
    group: 'مصاريف الرواتب والاجور',
    accountName: 'رواتب المهندسين',
    accountCode: '5101',
    net: 45000,
    localValue: 45000,
  }),
  mockRec({
    recordType: 'المقاوليين',
    group: 'المقاولين',
    accountName: 'شركة البناء المتحد',
    accountCode: '2010',
    net: 60000,
    localValue: 60000,
  }),
];

describe('account recognition', () => {
  it('detects a specific account by name', () => {
    const q = 'تقرير حساب اختبار QC كل المشاريع';
    assert.equal(detectIntent(q, accountRecords), 'account');
    const aq = detectAccountQuery(q, accountRecords);
    assert.equal(aq.account.name, 'اختبار QC');
    assert.ok(aq.scopeAll);
  });

  it('detects an account by its code', () => {
    const q = 'حساب 5101';
    assert.equal(detectIntent(q, accountRecords), 'account');
    const aq = detectAccountQuery(q, accountRecords);
    assert.equal(aq.account.name, 'رواتب المهندسين');
    assert.deepEqual(aq.account.codes, ['5101']);
  });

  it('scopes an account report to a project', () => {
    const q = 'اختبار QC مشروع Al-Waha';
    const aq = detectAccountQuery(q, accountRecords);
    assert.equal(aq.account.name, 'اختبار QC');
    assert.equal(aq.project.name, 'Al-Waha');
    const scoped = filterByAccount(
      accountRecords.filter(r => r.projectName === 'Al-Waha'),
      aq.account
    );
    assert.equal(sumAccountRows(scoped).netUsd, 3200);
  });

  it('recognizes a contractor account across record types', () => {
    const q = 'شركة البناء المتحد';
    assert.equal(detectIntent(q, accountRecords), 'account');
    const aq = detectAccountQuery(q, accountRecords);
    assert.equal(aq.account.name, 'شركة البناء المتحد');
  });

  it('builds account context and visuals', () => {
    const q = 'تقرير حساب اختبار QC كل المشاريع';
    const ctx = buildContext(accountRecords, q);
    assert.match(ctx, /تقرير حساب: \*\*اختبار QC\*\*/);
    assert.match(ctx, /11,500 USD/);
    const { tables } = buildVisuals(accountRecords, q);
    assert.ok(tables.some(t => t.title.includes('اختبار QC')));
    assert.ok(tables.some(t => t.headers?.includes('نوع السجل')));
  });
});

const iqdRecords = [
  mockRec({ net: 10000, exchangeRate: 1470 }),
  mockRec({ accountName: 'اختبار QC', net: 5000, exchangeRate: 1470 }),
];

describe('currency handling', () => {
  it('detects currency from Arabic text', () => {
    assert.equal(detectCurrency('كم مصاريف الفحص بالدينار'), 'IQD');
    assert.equal(detectCurrency('التقرير بالدولار'), 'USD');
    assert.equal(detectCurrency('تقرير مشروع كذا'), null);
  });

  it('formats in USD by default and IQD on request', () => {
    setDisplayCurrency('USD');
    assert.match(money(1000, 1470000), /1,000 USD/);
    setDisplayCurrency('IQD');
    assert.match(money(1000, 1470000), /1,470,000 IQD/);
    setDisplayCurrency('USD');
  });

  it('reports totals in requested currency using per-record rate', () => {
    const usd = buildContext(iqdRecords, 'مصاريف الفحص والاختبار كل المشاريع', 'USD');
    assert.match(usd, /15,000 USD/);
    assert.match(usd, /عملة العرض: \*\*USD\*\*/);

    const iqd = buildContext(iqdRecords, 'مصاريف الفحص والاختبار كل المشاريع', 'IQD');
    assert.match(iqd, /22,050,000 IQD/);
    assert.match(iqd, /عملة العرض: \*\*IQD\*\*/);
  });

  it('lets typed currency override the UI selection', () => {
    const ctx = buildContext(iqdRecords, 'مصاريف الفحص والاختبار كل المشاريع بالدينار', 'USD');
    assert.match(ctx, /عملة العرض: \*\*IQD\*\*/);
  });

  it('labels visual table headers with the display currency', () => {
    const { tables } = buildVisuals(iqdRecords, 'مصاريف الفحص والاختبار كل المشاريع', 'IQD');
    assert.ok(tables.some(t => (t.headers || []).some(h => h.includes('IQD'))));
  });
});

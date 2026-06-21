const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  detectIntent,
  detectExpenseGroupQuery,
  filterByExpenseGroup,
  sumExpenseGroupRows,
  buildContext,
  buildVisuals,
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
  });
});

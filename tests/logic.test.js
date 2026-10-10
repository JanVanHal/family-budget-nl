const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function memoryStorage(seed) {
  const data = { ...seed };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    key(index) { return Object.keys(data)[index] || null; },
    get length() { return Object.keys(data).length; }
  };
}

function loadApp(seed = {}) {
  const localStorage = memoryStorage(seed);
  const context = {
    console,
    localStorage,
    document: { addEventListener() {} },
    Intl,
    URL,
    Blob,
    navigator: { language: 'en-US' }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), context, { filename: 'app.js' });
  return { api: context.FamilyBudget, localStorage };
}

const { api } = loadApp();

const amounts = [
  ['12.50', 12.5],
  ['12,50', 12.5],
  ['1,234.56', 1234.56],
  ['1.234,56', 1234.56],
  ['1,234', 1234],
  ['1.234.567', 1234567],
  ['1234', 1234],
  ['฿1,234.50', 1234.5],
  ['-12.5', -12.5],
  ['(12.50)', -12.5],
  ['', NaN],
  ['abc', NaN]
];
amounts.forEach(([input, expected]) => {
  const actual = api.parseAmount(input);
  if (Number.isNaN(expected)) assert.ok(Number.isNaN(actual), `expected NaN for ${input}`);
  else assert.strictEqual(actual, expected, `parseAmount(${input})`);
});

const quoted = [...api.parseCSVRow('2026,January,2026-01-01T00:00:00.000Z,"Rent, main","He said ""hi""",expense,1000,THB')];
assert.deepStrictEqual(quoted, [
  '2026', 'January', '2026-01-01T00:00:00.000Z', 'Rent, main', 'He said "hi"', 'expense', '1000', 'THB'
]);

const yearData = {
  '2026_0': [{
    id: 1,
    desc: 'Rent, main',
    amount: 1234.5,
    type: 'expense',
    category: 'Housing "HQ"',
    date: '2026-01-15T05:00:00.000Z'
  }]
};
const csv = api.buildCSV(yearData, 2026, 'THB');
assert.ok(csv.startsWith('Year,Month,Date,Description,Category,Type,Amount,Currency\n'));
const exported = [...api.parseCSVRow(csv.trim().split(/\n/).slice(1)[0])];
assert.strictEqual(exported[1], 'January');
assert.strictEqual(exported[3], 'Rent, main');
assert.strictEqual(exported[4], 'Housing "HQ"');
assert.strictEqual(exported[5], 'expense');
assert.strictEqual(exported[6], '1234.5');
assert.strictEqual(exported[7], 'THB');

assert.strictEqual(loadApp().api.loadSettings().currency, 'THB');
assert.deepStrictEqual([...loadApp().api.categories], [...api.DEFAULT_CATEGORIES]);

const kept = loadApp({
  budgetSettings: JSON.stringify({ familyName: 'Smith', year: 2024, currency: 'USD' }),
  budgetCategories: JSON.stringify(['Food', 'Other'])
});
assert.strictEqual(kept.api.settings.currency, 'USD');
assert.strictEqual(kept.api.settings.year, 2024);
assert.deepStrictEqual([...kept.api.categories], ['Food', 'Other']);

const imported = loadApp({
  budgetSettings: JSON.stringify({ familyName: 'Smith', year: 2026, currency: 'THB' }),
  familyBudget_v2026: JSON.stringify({
    '2026_0': [{ id: 9, desc: 'Existing', amount: 10, type: 'expense', category: 'Food', date: '2026-01-01T00:00:00.000Z' }]
  })
});
const importText = [
  'Year,Month,Date,Description,Category,Type,Amount,Currency',
  '2026,January,2026-01-02T00:00:00.000Z,"Market, weekend",Food,expense,"1.234,50",THB',
  '2024,March,2024-03-01T00:00:00.000Z,Bonus,Salary,income,50000,THB',
  'not,a,row',
  ''
].join('\n');
const importResult = imported.api.importCsvText(importText);
assert.strictEqual(importResult.count, 2);
assert.strictEqual(importResult.skipped, 1);
const saved2026 = JSON.parse(imported.localStorage.getItem('familyBudget_v2026'));
assert.strictEqual(saved2026['2026_0'].length, 2);
assert.strictEqual(saved2026['2026_0'][1].amount, 1234.5);
assert.strictEqual(saved2026['2026_0'][1].desc, 'Market, weekend');
assert.strictEqual(saved2026['2026_0'][1].type, 'expense');
const saved2024 = JSON.parse(imported.localStorage.getItem('familyBudget_v2024'));
assert.strictEqual(saved2024['2024_2'][0].type, 'income');
assert.strictEqual(saved2024['2024_2'][0].amount, 50000);
assert.ok(imported.api.categories.includes('Salary'));

const misfiled = loadApp({
  budgetSettings: JSON.stringify({ familyName: '', year: 2026, currency: 'USD' }),
  familyBudget_v2026: JSON.stringify({
    '2026_0': [{ id: 1, desc: 'A', amount: 10, type: 'expense', category: 'Food', date: '2026-01-01T00:00:00.000Z' }],
    '2024_1': [{ id: 2, desc: 'B', amount: 20, type: 'income', category: 'Salary', date: '2024-02-01T00:00:00.000Z' }]
  })
});
misfiled.api.migrateMisfiledYears();
const currentYear = JSON.parse(misfiled.localStorage.getItem('familyBudget_v2026'));
assert.strictEqual(currentYear['2024_1'], undefined);
assert.strictEqual(currentYear['2026_0'][0].desc, 'A');
const movedYear = JSON.parse(misfiled.localStorage.getItem('familyBudget_v2024'));
assert.strictEqual(movedYear['2024_1'][0].desc, 'B');

const backedUp = loadApp({
  budgetSettings: JSON.stringify({ familyName: 'Smith', year: 2026, currency: 'THB' }),
  budgetCategories: JSON.stringify(['Food', 'Other']),
  budgetTemplates: JSON.stringify([{ id: 1, desc: 'Rent', amount: 100, type: 'expense', category: 'Food' }]),
  familyBudget_v2026: JSON.stringify({ '2026_0': [{ id: 1, desc: 'Rent', amount: 100, type: 'expense', category: 'Food', date: 'x' }] }),
  familyBudget_v2025: JSON.stringify({ '2025_0': [{ id: 2, desc: 'Old', amount: 5, type: 'expense', category: 'Other', date: 'x' }] })
});
const backup = backedUp.api.buildBackup();
assert.strictEqual(backup.app, 'family-budget');
assert.strictEqual(backup.version, 1);
assert.ok(backedUp.api.backupValid(backup));
assert.ok(!backedUp.api.backupValid({ app: 'other' }));
backedUp.localStorage.setItem('budgetSettings', JSON.stringify({ familyName: 'Nope', year: 2020, currency: 'USD' }));
backedUp.localStorage.setItem('familyBudget_v2023', JSON.stringify({ '2023_0': [] }));
backedUp.api.restoreBackup(backup);
assert.strictEqual(backedUp.api.settings.familyName, 'Smith');
assert.strictEqual(backedUp.api.settings.currency, 'THB');
assert.strictEqual(JSON.parse(backedUp.localStorage.getItem('familyBudget_v2025'))['2025_0'][0].desc, 'Old');
assert.strictEqual(backedUp.localStorage.getItem('familyBudget_v2023'), null);

backedUp.api.resetAllData();
assert.strictEqual(backedUp.api.settings.currency, 'THB');
assert.strictEqual(backedUp.localStorage.getItem('familyBudget_v2026'), null);
assert.strictEqual(backedUp.localStorage.getItem('familyBudget_v2025'), null);
assert.deepStrictEqual([...backedUp.api.categories], [...api.DEFAULT_CATEGORIES]);

console.log('logic tests passed');

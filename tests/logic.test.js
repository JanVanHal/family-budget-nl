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
    navigator: { language: 'nl-NL' }
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
  ['€ 1.234,50', 1234.5],
  ['฿1,234.50', 1234.5],
  ['-12,5', -12.5],
  ['(12,50)', -12.5],
  ['', NaN],
  ['abc', NaN]
];
amounts.forEach(([input, expected]) => {
  const actual = api.parseAmount(input);
  if (Number.isNaN(expected)) assert.ok(Number.isNaN(actual), `expected NaN for ${input}`);
  else assert.strictEqual(actual, expected, `parseAmount(${input})`);
});

assert.strictEqual(api.monthIndex('januari'), 0);
assert.strictEqual(api.monthIndex('Januari'), 0);
assert.strictEqual(api.monthIndex('January'), 0);
assert.strictEqual(api.monthIndex('mrt'), 2);
assert.strictEqual(api.monthIndex('March'), 2);
assert.strictEqual(api.monthIndex('mei'), 4);
assert.strictEqual(api.monthIndex('May'), 4);
assert.strictEqual(api.monthIndex('nope'), -1);

const quoted = [...api.parseCSVRow('2026,januari,2026-01-01T00:00:00.000Z,"Huur, hoofd","Hij zei ""hoi""",uitgave,1000,EUR')];
assert.deepStrictEqual(quoted, [
  '2026', 'januari', '2026-01-01T00:00:00.000Z', 'Huur, hoofd', 'Hij zei "hoi"', 'uitgave', '1000', 'EUR'
]);

const yearData = {
  '2026_0': [{
    id: 1,
    desc: 'Huur, hoofd',
    amount: 1234.5,
    type: 'expense',
    category: 'Wonen "HQ"',
    date: '2026-01-15T05:00:00.000Z'
  }]
};
const csv = api.buildCSV(yearData, 2026, 'EUR');
assert.ok(csv.startsWith('Jaar,Maand,Datum,Omschrijving,Categorie,Soort,Bedrag,Valuta\n'));
const exported = [...api.parseCSVRow(csv.trim().split(/\n/).slice(1)[0])];
assert.strictEqual(exported[1], 'januari');
assert.strictEqual(exported[3], 'Huur, hoofd');
assert.strictEqual(exported[4], 'Wonen "HQ"');
assert.strictEqual(exported[5], 'uitgave');
assert.strictEqual(exported[6], '1234.5');
assert.strictEqual(exported[7], 'EUR');

assert.strictEqual(loadApp().api.loadSettings().currency, 'EUR');
assert.strictEqual(loadApp().api.LOCALE, 'nl-NL');
assert.deepStrictEqual([...loadApp().api.categories], [...api.DEFAULT_CATEGORIES]);
assert.ok(api.DEFAULT_CATEGORIES.includes('Wonen'));
assert.ok(api.DEFAULT_CATEGORIES.includes('Overig'));
assert.strictEqual(api.FALLBACK_CATEGORY, 'Overig');

const isolated = loadApp({
  budgetSettings: JSON.stringify({ familyName: 'Smith', year: 2024, currency: 'THB' }),
  budgetCategories: JSON.stringify(['Food', 'Other']),
  familyBudget_v2026: JSON.stringify({
    '2026_0': [{ id: 1, desc: 'Rent', amount: 10, type: 'expense', category: 'Food', date: '2026-01-01T00:00:00.000Z' }]
  })
});
assert.strictEqual(isolated.api.settings.currency, 'EUR');
assert.strictEqual(isolated.api.settings.familyName, '');
assert.deepStrictEqual([...isolated.api.categories], [...api.DEFAULT_CATEGORIES]);
assert.deepStrictEqual(Object.keys(isolated.api.transactions), []);
assert.strictEqual(isolated.localStorage.getItem('budgetSettings'), JSON.stringify({ familyName: 'Smith', year: 2024, currency: 'THB' }));

const kept = loadApp({
  budgetSettingsNL: JSON.stringify({ familyName: 'Jansen', year: 2024, currency: 'USD' }),
  budgetCategoriesNL: JSON.stringify(['Boodschappen', 'Overig'])
});
assert.strictEqual(kept.api.settings.currency, 'USD');
assert.strictEqual(kept.api.settings.year, 2024);
assert.strictEqual(kept.api.settings.familyName, 'Jansen');
assert.deepStrictEqual([...kept.api.categories], ['Boodschappen', 'Overig']);

const imported = loadApp({
  budgetSettingsNL: JSON.stringify({ familyName: 'Jansen', year: 2026, currency: 'EUR' }),
  familyBudgetNL_v2026: JSON.stringify({
    '2026_0': [{ id: 9, desc: 'Bestaand', amount: 10, type: 'expense', category: 'Boodschappen', date: '2026-01-01T00:00:00.000Z' }]
  })
});
const importText = [
  'Jaar,Maand,Datum,Omschrijving,Categorie,Soort,Bedrag,Valuta',
  '2026,januari,2026-01-02T00:00:00.000Z,"Markt, weekend",Boodschappen,uitgave,"1.234,50",EUR',
  '2026,January,2026-01-03T00:00:00.000Z,Rent,Housing,expense,900,EUR',
  '2024,maart,2024-03-01T00:00:00.000Z,Bonus,Salaris,inkomst,50000,EUR',
  '2024,March,2024-03-02T00:00:00.000Z,Old bonus,Salary,income,10,EUR',
  'not,a,row',
  ''
].join('\n');
const importResult = imported.api.importCsvText(importText);
assert.strictEqual(importResult.count, 4);
assert.strictEqual(importResult.skipped, 1);
const saved2026 = JSON.parse(imported.localStorage.getItem('familyBudgetNL_v2026'));
assert.strictEqual(saved2026['2026_0'].length, 3);
assert.strictEqual(saved2026['2026_0'][1].amount, 1234.5);
assert.strictEqual(saved2026['2026_0'][1].desc, 'Markt, weekend');
assert.strictEqual(saved2026['2026_0'][1].type, 'expense');
assert.strictEqual(saved2026['2026_0'][2].category, 'Housing');
assert.strictEqual(saved2026['2026_0'][2].type, 'expense');
const saved2024 = JSON.parse(imported.localStorage.getItem('familyBudgetNL_v2024'));
assert.strictEqual(saved2024['2024_2'][0].type, 'income');
assert.strictEqual(saved2024['2024_2'][0].amount, 50000);
assert.strictEqual(saved2024['2024_2'][1].type, 'income');
assert.ok(imported.api.categories.includes('Salaris'));
assert.ok(imported.api.categories.includes('Housing'));

const misfiled = loadApp({
  budgetSettingsNL: JSON.stringify({ familyName: '', year: 2026, currency: 'EUR' }),
  familyBudgetNL_v2026: JSON.stringify({
    '2026_0': [{ id: 1, desc: 'A', amount: 10, type: 'expense', category: 'Boodschappen', date: '2026-01-01T00:00:00.000Z' }],
    '2024_1': [{ id: 2, desc: 'B', amount: 20, type: 'income', category: 'Salaris', date: '2024-02-01T00:00:00.000Z' }]
  })
});
misfiled.api.migrateMisfiledYears();
const currentYear = JSON.parse(misfiled.localStorage.getItem('familyBudgetNL_v2026'));
assert.strictEqual(currentYear['2024_1'], undefined);
assert.strictEqual(currentYear['2026_0'][0].desc, 'A');
const movedYear = JSON.parse(misfiled.localStorage.getItem('familyBudgetNL_v2024'));
assert.strictEqual(movedYear['2024_1'][0].desc, 'B');

const backedUp = loadApp({
  budgetSettingsNL: JSON.stringify({ familyName: 'Jansen', year: 2026, currency: 'EUR' }),
  budgetCategoriesNL: JSON.stringify(['Boodschappen', 'Overig']),
  budgetTemplatesNL: JSON.stringify([{ id: 1, desc: 'Huur', amount: 100, type: 'expense', category: 'Wonen' }]),
  familyBudgetNL_v2026: JSON.stringify({ '2026_0': [{ id: 1, desc: 'Huur', amount: 100, type: 'expense', category: 'Wonen', date: 'x' }] }),
  familyBudgetNL_v2025: JSON.stringify({ '2025_0': [{ id: 2, desc: 'Oud', amount: 5, type: 'expense', category: 'Overig', date: 'x' }] })
});
const backup = backedUp.api.buildBackup();
assert.strictEqual(backup.app, 'family-budget-nl');
assert.strictEqual(backup.version, 1);
assert.ok(backedUp.api.backupValid(backup));
assert.ok(!backedUp.api.backupValid({ app: 'other' }));
assert.ok(backedUp.api.backupValid({
  app: 'family-budget',
  version: 1,
  settings: { familyName: 'Smith', year: 2020, currency: 'THB' },
  categories: ['Food'],
  templates: [],
  years: {}
}));
backedUp.localStorage.setItem('budgetSettingsNL', JSON.stringify({ familyName: 'Nee', year: 2020, currency: 'USD' }));
backedUp.localStorage.setItem('familyBudgetNL_v2023', JSON.stringify({ '2023_0': [] }));
backedUp.api.restoreBackup(backup);
assert.strictEqual(backedUp.api.settings.familyName, 'Jansen');
assert.strictEqual(backedUp.api.settings.currency, 'EUR');
assert.strictEqual(JSON.parse(backedUp.localStorage.getItem('familyBudgetNL_v2025'))['2025_0'][0].desc, 'Oud');
assert.strictEqual(backedUp.localStorage.getItem('familyBudgetNL_v2023'), null);

backedUp.api.resetAllData();
assert.strictEqual(backedUp.api.settings.currency, 'EUR');
assert.strictEqual(backedUp.localStorage.getItem('familyBudgetNL_v2026'), null);
assert.strictEqual(backedUp.localStorage.getItem('familyBudgetNL_v2025'), null);
assert.deepStrictEqual([...backedUp.api.categories], [...api.DEFAULT_CATEGORIES]);

console.log('logic tests passed');

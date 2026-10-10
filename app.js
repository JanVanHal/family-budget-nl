/* Family Budget NL
   Nederlands (nl-NL). Secties: state/storage, formatting, rendering, charts, import/export, events.
   Opslag staat los van de Engelse Family Budget-app (zelfde github.io-origin):
   budgetSettingsNL, budgetCategoriesNL, budgetTemplatesNL, familyBudgetNL_v<year>.
   CSV: Jaar,Maand,Datum,Omschrijving,Categorie,Soort,Bedrag,Valuta.
   Importeren leest ook Engelse maandnamen en de soorten expense/income.
*/

const LOCALE = 'nl-NL';
const APP_NAME = 'Family Budget NL';
const FALLBACK_CATEGORY = 'Overig';
const RESET_WORD = 'WISSEN';
const KEY_SETTINGS = 'budgetSettingsNL';
const KEY_CATEGORIES = 'budgetCategoriesNL';
const KEY_TEMPLATES = 'budgetTemplatesNL';
const YEAR_PREFIX = 'familyBudgetNL_v';

const MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'
];

const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const MONTHS_EN = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

const CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'THB', 'CAD', 'AUD', 'INR', 'BRL'];

const DEFAULT_CATEGORIES = [
  'Wonen', 'Boodschappen', 'Vervoer', 'Energie',
  'Vrije tijd', 'Zorg', 'Salaris', 'Overig'
];

const ACCENT_VARS = [
  '--nt-marigold', '--nt-coral', '--nt-sky-wash', '--nt-midnight',
  '--nt-mocha', '--nt-peach', '--nt-saffron', '--nt-signal-blue'
];

const VIEWS = ['month', 'year', 'categories'];

let settings = loadSettings();
let categories = loadCategories();
let templates = loadTemplates();
let allTransactions = readYear(settings.year);
let currentMonthIdx = new Date().getMonth();
let currentView = 'month';
let selectedType = 'expense';
let selectedCategory = categories[0] || FALLBACK_CATEGORY;
let statusTimer = 0;

const charts = { pie: null, bar: null, year: null, dist: null };

/* —— state / storage —— */

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (err) {
    return fallback;
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    announce('Opslaan lukte niet. De browseropslag is vol of geblokkeerd.');
    return false;
  }
}

function yearKey(year) {
  return `${YEAR_PREFIX}${year}`;
}

function loadSettings() {
  const now = new Date().getFullYear();
  const saved = readJSON(KEY_SETTINGS, null);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    return { familyName: '', year: now, currency: 'EUR' };
  }
  const year = parseInt(saved.year, 10);
  return {
    familyName: typeof saved.familyName === 'string' ? saved.familyName : '',
    year: year >= 2000 && year <= 2100 ? year : now,
    currency: CURRENCIES.includes(saved.currency) ? saved.currency : 'EUR'
  };
}

function loadCategories() {
  const saved = readJSON(KEY_CATEGORIES, null);
  if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_CATEGORIES.slice();
  const names = saved.map(name => String(name || '').trim()).filter(Boolean);
  return names.length ? names : DEFAULT_CATEGORIES.slice();
}

function loadTemplates() {
  const saved = readJSON(KEY_TEMPLATES, null);
  if (!Array.isArray(saved)) return [];
  return saved.filter(item => item && typeof item === 'object');
}

function readYear(year) {
  const data = readJSON(yearKey(year), {});
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return data;
}

function writeYear(year, data) {
  if (!persist(yearKey(year), data)) return false;
  if (String(year) === String(settings.year)) allTransactions = data;
  return true;
}

function saveSettings() {
  return persist(KEY_SETTINGS, settings);
}

function saveCategories() {
  return persist(KEY_CATEGORIES, categories);
}

function saveTemplates() {
  return persist(KEY_TEMPLATES, templates);
}

function listYearKeys() {
  const keys = [];
  const yearKeyPattern = new RegExp(`^${YEAR_PREFIX}\\d+$`);
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (yearKeyPattern.test(key || '')) keys.push(key);
  }
  const current = yearKey(settings.year);
  if (!keys.includes(current)) keys.push(current);
  return keys;
}

function eachYear(mutator) {
  listYearKeys().forEach(key => {
    const data = readJSON(key, {});
    const safe = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    mutator(safe);
    persist(key, safe);
    if (key === yearKey(settings.year)) allTransactions = safe;
  });
}

/* Rows imported by the old app for a different year were stored inside the
   open year's blob. Move those keys into familyBudgetNL_v<that year>. */
function migrateMisfiledYears() {
  const foreign = {};
  let moved = false;
  Object.keys(allTransactions).forEach(key => {
    const match = /^(\d{4})_(\d+)$/.exec(key);
    if (!match || match[1] === String(settings.year)) return;
    foreign[match[1]] = foreign[match[1]] || readYear(match[1]);
    const incoming = Array.isArray(allTransactions[key]) ? allTransactions[key] : [];
    foreign[match[1]][key] = (foreign[match[1]][key] || []).concat(incoming);
    delete allTransactions[key];
    moved = true;
  });
  if (!moved) return;
  Object.entries(foreign).forEach(([year, data]) => writeYear(year, data));
  writeYear(settings.year, allTransactions);
}

function getMonthData() {
  const rows = allTransactions[`${settings.year}_${currentMonthIdx}`];
  return Array.isArray(rows) ? rows : [];
}

function setMonthData(rows) {
  allTransactions[`${settings.year}_${currentMonthIdx}`] = rows;
  writeYear(settings.year, allTransactions);
}

function monthTotals(rows) {
  let income = 0;
  let expense = 0;
  (rows || []).forEach(row => {
    const amount = Number(row && row.amount) || 0;
    if (row && row.type === 'income') income += amount;
    else expense += amount;
  });
  return { income, expense, net: income - expense };
}

function yearStats(data, year) {
  return MONTHS.map((_, idx) => {
    const rows = data[`${year}_${idx}`];
    return monthTotals(Array.isArray(rows) ? rows : []);
  });
}

/* —— formatting —— */

function cssVar(name) {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function formatMoney(amount) {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: settings.currency
    }).format(safe);
  } catch (err) {
    return safe.toFixed(2).replace('.', ',');
  }
}

function formatCompact(amount) {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: settings.currency,
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value);
  } catch (err) {
    return formatMoney(value);
  }
}

function formatDate(value) {
  if (!value) return '—';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

function monthIndex(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return -1;
  let idx = MONTHS.indexOf(key);
  if (idx === -1) idx = MONTHS_EN.indexOf(key);
  if (idx === -1) idx = MONTHS_SHORT.indexOf(key);
  return idx;
}

function monthTitle(idx) {
  const name = MONTHS[idx] || '';
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
}

function monthShort(idx) {
  const name = MONTHS_SHORT[idx] || '';
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
}

function normalizeType(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'income' || key === 'inkomst' || key === 'inkomsten' || key === 'inkomen') return 'income';
  return 'expense';
}

function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isoFromDateInput(value) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return new Date().toISOString();
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0).toISOString();
}

function parseAmount(raw) {
  if (raw == null) return NaN;
  let text = String(raw).trim();
  if (!text) return NaN;
  const negative = /^-/.test(text) || /^\(.*\)$/.test(text);
  text = text.replace(/\s/g, '').replace(/[^\d.,]/g, '');
  if (!text) return NaN;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (lastComma !== -1) {
    const parts = text.split(',');
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      text = `${parts[0]}.${parts[1]}`;
    } else {
      text = text.replace(/,/g, '');
    }
  } else if ((text.match(/\./g) || []).length > 1) {
    text = text.replace(/\./g, '');
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return NaN;
  return negative ? -value : value;
}

function parseCSVRow(row) {
  const cols = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cols.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function buildCSV(yearData, year, currency) {
  let csv = 'Jaar,Maand,Datum,Omschrijving,Categorie,Soort,Bedrag,Valuta\n';
  Object.keys(yearData).filter(key => key.startsWith(`${year}_`)).forEach(key => {
    const monthIdx = Number(key.split('_')[1]);
    if (!MONTHS[monthIdx] || !Array.isArray(yearData[key])) return;
    yearData[key].forEach(row => {
      csv += [
        year,
        MONTHS[monthIdx],
        row.date,
        csvEscape(row.desc),
        csvEscape(row.category),
        normalizeType(row.type) === 'income' ? 'inkomst' : 'uitgave',
        row.amount,
        currency
      ].join(',') + '\n';
    });
  });
  return csv;
}

function categoryColor(name) {
  let idx = categories.indexOf(name);
  if (idx < 0) {
    idx = Math.abs(hashCode(String(name))) % ACCENT_VARS.length;
  }
  return cssVar(ACCENT_VARS[idx % ACCENT_VARS.length]) || '#0075de';
}

function hashCode(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash) + text.charCodeAt(i);
  return hash;
}

function familyLine() {
  return settings.familyName ? settings.familyName : '';
}

/* —— rendering —— */

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  });
  (children || []).forEach(child => {
    if (child == null) return;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return node;
}

function setMoney(id, amount, kind) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = formatMoney(kind === 'abs' ? Math.abs(amount) : amount);
  node.classList.remove('is-income', 'is-expense', 'is-negative');
  if (kind === 'income') node.classList.add('is-income');
  else if (kind === 'expense') node.classList.add('is-expense');
  else if (amount < 0) node.classList.add('is-negative');
}

function announce(message) {
  const banner = document.getElementById('statusBanner');
  if (!banner) return;
  banner.hidden = false;
  banner.textContent = message;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => { banner.hidden = true; }, 4000);
}

function syncChrome() {
  const name = familyLine();
  document.title = name ? `${name} · ${APP_NAME}` : APP_NAME;
  const monthName = `${monthTitle(currentMonthIdx)} ${settings.year}`;
  const monthHeading = document.getElementById('monthTitle');
  const monthCurrent = document.getElementById('monthCurrent');
  const tableTitle = document.getElementById('tableTitle');
  if (monthHeading) monthHeading.textContent = monthName;
  if (monthCurrent) monthCurrent.textContent = monthName;
  if (tableTitle) tableTitle.textContent = `Transacties in ${monthName}`;
  const lede = document.getElementById('monthLede');
  if (lede) lede.textContent = name || 'Inkomsten, uitgaven en wat er deze maand overblijft.';
  const yearTitle = document.getElementById('yearTitle');
  const yearLede = document.getElementById('yearLede');
  if (yearTitle) yearTitle.textContent = String(settings.year);
  if (yearLede) yearLede.textContent = name ? `${name} · inkomsten en uitgaven van het jaar.` : 'Inkomsten en uitgaven van het jaar.';
  const catLede = document.getElementById('catLede');
  if (catLede) catLede.textContent = name ? `${name} · uitgaven per categorie in ${settings.year}.` : `Uitgaven per categorie in ${settings.year}.`;
  const printSubtitle = document.getElementById('printSubtitle');
  if (printSubtitle) {
    const scope = currentView === 'year' ? String(settings.year) : currentView === 'categories' ? `Categorieën ${settings.year}` : monthName;
    printSubtitle.textContent = [name, scope, settings.currency].filter(Boolean).join(' · ');
  }
}

function renderMonthTabs() {
  const container = document.getElementById('monthTabs');
  if (!container) return;
  container.replaceChildren();
  MONTHS.forEach((name, idx) => {
    const selected = idx === currentMonthIdx;
    container.append(el('button', {
      type: 'button',
      class: 'btn btn-ghost-text',
      role: 'tab',
      id: `month-tab-${idx}`,
      'aria-selected': selected ? 'true' : 'false',
      tabindex: selected ? '0' : '-1',
      text: monthShort(idx),
      onclick: () => switchMonth(idx)
    }));
  });
}

function syncDateBounds() {
  const input = document.getElementById('txDate');
  if (!input) return;
  const year = settings.year;
  const month = currentMonthIdx;
  const last = new Date(year, month + 1, 0).getDate();
  const mm = String(month + 1).padStart(2, '0');
  input.min = `${year}-${mm}-01`;
  input.max = `${year}-${mm}-${String(last).padStart(2, '0')}`;
  if (!input.value || input.value < input.min || input.value > input.max) {
    const now = new Date();
    const picked = now.getFullYear() === year && now.getMonth() === month
      ? now
      : new Date(year, month, 1);
    input.value = toDateInputValue(picked);
  }
}

function renderCategoryPills() {
  const container = document.getElementById('categorySelector');
  if (!container) return;
  if (!categories.includes(selectedCategory)) selectedCategory = categories[0] || FALLBACK_CATEGORY;
  container.replaceChildren();
  categories.forEach(name => {
    const pressed = name === selectedCategory;
    const pill = el('button', {
      type: 'button',
      class: `pill cat-pill ${pillClass(name)}`,
      'data-category': name,
      'aria-pressed': pressed ? 'true' : 'false',
      text: name,
      onclick: () => {
        selectedCategory = name;
        renderCategoryPills();
      }
    });
    container.append(pill);
  });
}

function pillClass(name) {
  const idx = Math.max(0, categories.indexOf(name)) % 8;
  return ['pill-marigold', 'pill-coral', 'pill-sky', 'pill-midnight', 'pill-tint', 'pill-peach', 'pill-marigold', 'pill-sky'][idx];
}

function setFormType(type) {
  selectedType = type === 'income' ? 'income' : 'expense';
  const exp = document.getElementById('typeExp');
  const inc = document.getElementById('typeInc');
  if (exp) exp.setAttribute('aria-pressed', selectedType === 'expense' ? 'true' : 'false');
  if (inc) inc.setAttribute('aria-pressed', selectedType === 'income' ? 'true' : 'false');
}

function renderTransactions() {
  const rows = getMonthData().slice().sort((a, b) => {
    const delta = new Date(b.date) - new Date(a.date);
    if (delta) return delta;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
  const list = document.getElementById('transactionList');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('transCount');
  if (!list) return;
  list.replaceChildren();
  rows.forEach(row => {
    const expense = row.type !== 'income';
    const tr = el('tr', {}, [
      el('td', { class: 'col-date', text: formatDate(row.date) }),
      el('td', { class: 'col-desc', text: row.desc || '' }),
      el('td', { class: 'col-cat' }, [el('span', { class: `pill ${pillClass(row.category)}`, text: row.category || FALLBACK_CATEGORY })]),
      el('td', {
        class: `col-amt num ${expense ? 'amt-expense' : 'amt-income'}`,
        text: `${expense ? '−' : '+'}${formatMoney(Math.abs(row.amount))}`
      }),
      el('td', { class: 'col-del no-print' }, [
        el('button', {
          type: 'button',
          class: 'btn btn-outlined icon-btn',
          'aria-label': `Verwijder ${row.desc || 'transactie'}`,
          text: 'Verwijderen',
          onclick: () => deleteTransaction(row.id)
        })
      ])
    ]);
    list.append(tr);
  });
  if (empty) empty.hidden = rows.length !== 0;
  if (count) count.textContent = String(rows.length);
  const totals = monthTotals(rows);
  setMoney('totalBalance', totals.net, 'net');
  setMoney('totalIncome', totals.income, 'income');
  setMoney('totalExpense', totals.expense, 'expense');
  const live = document.getElementById('totalsLive');
  if (live && currentView === 'month') {
    live.textContent = `${monthTitle(currentMonthIdx)} ${settings.year}. Saldo ${formatMoney(totals.net)}. Inkomsten ${formatMoney(totals.income)}. Uitgaven ${formatMoney(totals.expense)}.`;
  }
}

function renderTemplates() {
  const container = document.getElementById('templatesContainer');
  if (!container) return;
  container.replaceChildren();
  if (!templates.length) {
    container.append(el('li', { class: 'empty-state', text: 'Nog geen snel toevoegen. Vul een transactie in en kies Opslaan als sjabloon.' }));
    return;
  }
  templates.forEach(item => {
    const expense = item.type !== 'income';
    const apply = el('button', { type: 'button', class: 'btn btn-outlined template-apply' }, [
      el('span', { class: 'template-copy' }, [
        el('span', { class: 'template-desc', text: item.desc || '' }),
        el('span', { class: 'template-cat', text: item.category || '' })
      ]),
      el('span', {
        class: `template-amt ${expense ? 'is-expense' : 'is-income'}`,
        text: `${expense ? '−' : '+'}${formatMoney(Math.abs(item.amount))}`
      })
    ]);
    apply.addEventListener('click', () => addFromTemplate(item));
    container.append(el('li', { class: 'template-row' }, [
      apply,
      el('button', {
        type: 'button',
        class: 'btn btn-outlined icon-btn',
        'aria-label': `Verwijder sjabloon ${item.desc || ''}`,
        text: '✕',
        onclick: () => deleteTemplate(item.id)
      })
    ]));
  });
}

function renderYear() {
  const stats = yearStats(allTransactions, settings.year);
  const totals = stats.reduce((sum, item) => ({
    income: sum.income + item.income,
    expense: sum.expense + item.expense,
    net: sum.net + item.net
  }), { income: 0, expense: 0, net: 0 });
  setMoney('yearlyNet', totals.net, 'net');
  setMoney('yearlyIncome', totals.income, 'income');
  setMoney('yearlyExpense', totals.expense, 'expense');
  const body = document.getElementById('yearlyTableBody');
  if (body) {
    body.replaceChildren();
    stats.forEach((item, idx) => {
      body.append(el('tr', {}, [
        el('td', { text: monthTitle(idx) }),
        el('td', { class: 'num amt-income', text: formatMoney(item.income) }),
        el('td', { class: 'num amt-expense', text: formatMoney(item.expense) }),
        el('td', { class: `num ${item.net < 0 ? 'amt-neg' : ''}`, text: formatMoney(item.net) })
      ]));
    });
    body.append(el('tr', { class: 'total-row' }, [
      el('td', { text: 'Totaal' }),
      el('td', { class: 'num', text: formatMoney(totals.income) }),
      el('td', { class: 'num', text: formatMoney(totals.expense) }),
      el('td', { class: 'num', text: formatMoney(totals.net) })
    ]));
  }
  const live = document.getElementById('totalsLive');
  if (live && currentView === 'year') {
    live.textContent = `${settings.year}. Netto ${formatMoney(totals.net)}. Inkomsten ${formatMoney(totals.income)}. Uitgaven ${formatMoney(totals.expense)}.`;
  }
  updateYearChart(stats);
}

function expenseByCategory(data, year) {
  const totals = {};
  let total = 0;
  MONTHS.forEach((_, idx) => {
    const rows = data[`${year}_${idx}`];
    if (!Array.isArray(rows)) return;
    rows.forEach(row => {
      if (!row || row.type === 'income') return;
      const name = row.category || FALLBACK_CATEGORY;
      const amount = Number(row.amount) || 0;
      totals[name] = (totals[name] || 0) + amount;
      total += amount;
    });
  });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return { sorted, total };
}

function renderCategories() {
  const { sorted, total } = expenseByCategory(allTransactions, settings.year);
  const body = document.getElementById('yearlyDistributionTableBody');
  const empty = document.getElementById('distEmpty');
  if (body) {
    body.replaceChildren();
    if (!sorted.length) {
      body.append(el('tr', {}, [el('td', { colspan: '3', text: 'Geen uitgaven dit jaar' })]));
    } else {
      sorted.forEach(([name, amount]) => {
        const pct = total > 0 ? ((amount / total) * 100).toFixed(1) : '0.0';
        body.append(el('tr', {}, [
          el('td', {}, [el('span', { class: `pill ${pillClass(name)}`, text: name })]),
          el('td', { class: 'num', text: formatMoney(amount) }),
          el('td', { class: 'num', text: `${pct}%` })
        ]));
      });
      body.append(el('tr', { class: 'total-row' }, [
        el('td', { text: 'Totaal' }),
        el('td', { class: 'num', text: formatMoney(total) }),
        el('td', { class: 'num', text: '100%' })
      ]));
    }
  }
  if (empty) empty.hidden = sorted.length !== 0;
  renderCategoryManager();
  updateDistChart(sorted);
}

function renderCategoryManager() {
  const list = document.getElementById('categoryManager');
  if (!list) return;
  list.replaceChildren();
  categories.forEach(name => {
    const input = el('input', { type: 'text', value: name, maxlength: '40', 'aria-label': `Hernoem ${name}` });
    const row = el('li', { class: 'cat-row' }, [
      el('span', { class: 'swatch', style: `background:${categoryColor(name)}`, 'aria-hidden': 'true' }),
      el('div', { class: 'input-group' }, [input]),
      el('button', {
        type: 'button',
        class: 'btn btn-outlined',
        text: 'Hernoemen',
        onclick: () => renameCategory(name, input.value)
      }),
      el('button', {
        type: 'button',
        class: 'btn btn-danger',
        text: 'Verwijderen',
        disabled: categories.length < 2 || name === FALLBACK_CATEGORY,
        onclick: () => deleteCategory(name)
      })
    ]);
    list.append(row);
  });
}

function showView(name, updateHash) {
  const view = VIEWS.includes(name) ? name : 'month';
  currentView = view;
  VIEWS.forEach(item => {
    const section = document.getElementById(`view-${item}`);
    if (section) section.hidden = item !== view;
  });
  document.querySelectorAll('[data-view]').forEach(link => {
    const on = link.getAttribute('data-view') === view;
    link.classList.toggle('active', on);
    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  closeNav();
  if (updateHash !== false && location.hash !== `#${view}`) {
    history.replaceState(null, '', `#${view}`);
  }
  syncChrome();
  if (view === 'month') renderMonth();
  if (view === 'year') renderYear();
  if (view === 'categories') renderCategories();
  requestAnimationFrame(() => {
    Object.values(charts).forEach(chart => { if (chart) chart.resize(); });
  });
}

function renderMonth() {
  syncChrome();
  renderMonthTabs();
  syncDateBounds();
  renderCategoryPills();
  renderTransactions();
  renderTemplates();
  updateMonthCharts();
}

function switchMonth(idx) {
  currentMonthIdx = (idx + 12) % 12;
  if (currentView !== 'month') showView('month');
  else renderMonth();
}

function closeNav() {
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.nav-toggle');
  if (header) header.classList.remove('nav-open');
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Menu openen');
  }
}

/* —— transactions, categories, templates —— */

function readForm() {
  const desc = document.getElementById('desc').value.trim();
  const amount = parseAmount(document.getElementById('amount').value);
  const dateValue = document.getElementById('txDate').value;
  const error = document.getElementById('formError');
  const fail = (message) => {
    if (error) error.textContent = message;
    return null;
  };
  if (error) error.textContent = '';
  if (!desc) return fail('Vul een omschrijving in.');
  if (!Number.isFinite(amount) || amount === 0) return fail('Vul een bedrag groter dan nul in.');
  if (!dateValue) return fail('Kies een datum in deze maand.');
  const bounds = document.getElementById('txDate');
  if (dateValue < bounds.min || dateValue > bounds.max) return fail('Kies een datum in de maand die je bekijkt.');
  if (!selectedCategory) return fail('Kies een categorie.');
  return {
    desc,
    amount: Math.abs(amount),
    type: selectedType,
    category: selectedCategory,
    date: isoFromDateInput(dateValue)
  };
}

function addTransaction(entry) {
  const rows = getMonthData();
  rows.push({
    id: Date.now() + Math.random(),
    desc: entry.desc,
    amount: entry.amount,
    type: entry.type,
    category: entry.category,
    date: entry.date
  });
  setMonthData(rows);
  renderMonth();
}

function handleFormSubmit(event) {
  event.preventDefault();
  const entry = readForm();
  if (!entry) return;
  addTransaction(entry);
  event.target.reset();
  setFormType('expense');
  selectedCategory = categories[0] || FALLBACK_CATEGORY;
  syncDateBounds();
  renderCategoryPills();
  announce(`${entry.desc} opgeslagen.`);
}

function deleteTransaction(id) {
  setMonthData(getMonthData().filter(row => String(row.id) !== String(id)));
  renderMonth();
}

function saveAsTemplate() {
  const entry = readForm();
  if (!entry) return;
  templates.push({
    id: Date.now(),
    desc: entry.desc,
    amount: entry.amount,
    type: entry.type,
    category: entry.category
  });
  saveTemplates();
  renderTemplates();
  announce(`“${entry.desc}” opgeslagen als snel toevoegen.`);
}

function deleteTemplate(id) {
  templates = templates.filter(item => String(item.id) !== String(id));
  saveTemplates();
  renderTemplates();
}

function addFromTemplate(item) {
  const dateInput = document.getElementById('txDate');
  addTransaction({
    desc: item.desc,
    amount: Math.abs(Number(item.amount) || 0),
    type: item.type === 'income' ? 'income' : 'expense',
    category: categories.includes(item.category) ? item.category : FALLBACK_CATEGORY,
    date: isoFromDateInput(dateInput && dateInput.value)
  });
  announce(`${item.desc} toegevoegd.`);
}

function addCategory(name) {
  const trimmed = String(name || '').trim();
  const error = document.getElementById('categoryError');
  if (!trimmed) {
    if (error) error.textContent = 'Vul een categorienaam in.';
    return false;
  }
  if (categories.some(item => item.toLowerCase() === trimmed.toLowerCase())) {
    if (error) error.textContent = `${trimmed} is al een categorie.`;
    return false;
  }
  categories.push(trimmed);
  saveCategories();
  selectedCategory = trimmed;
  if (error) error.textContent = '';
  return true;
}

function renameCategory(oldName, nextName) {
  const name = String(nextName || '').trim();
  const error = document.getElementById('categoryError');
  if (!name) {
    if (error) error.textContent = 'Vul een categorienaam in.';
    renderCategoryManager();
    return;
  }
  if (name === oldName) return;
  if (categories.some(item => item.toLowerCase() === name.toLowerCase())) {
    if (error) error.textContent = `${name} is al een categorie.`;
    return;
  }
  categories = categories.map(item => (item === oldName ? name : item));
  if (selectedCategory === oldName) selectedCategory = name;
  saveCategories();
  eachYear(data => {
    Object.keys(data).forEach(key => {
      if (!Array.isArray(data[key])) return;
      data[key].forEach(row => {
        if (row && row.category === oldName) row.category = name;
      });
    });
  });
  templates.forEach(item => {
    if (item.category === oldName) item.category = name;
  });
  saveTemplates();
  if (error) error.textContent = '';
  refreshVisible();
  announce(`${oldName} hernoemd naar ${name}.`);
}

function countCategory(name) {
  let count = 0;
  listYearKeys().forEach(key => {
    const data = readJSON(key, {});
    Object.keys(data || {}).forEach(monthKey => {
      if (!Array.isArray(data[monthKey])) return;
      data[monthKey].forEach(row => {
        if (row && row.category === name) count += 1;
      });
    });
  });
  return count;
}

function deleteCategory(name) {
  if (name === FALLBACK_CATEGORY) {
    const error = document.getElementById('categoryError');
    if (error) error.textContent = 'Overig is de reservecategorie en blijft in de lijst.';
    return;
  }
  if (categories.length < 2) return;
  const count = countCategory(name);
  const message = count
    ? `“${name}” verwijderen? ${count} ${count === 1 ? 'transactie gaat' : 'transacties gaan'} naar Overig.`
    : `“${name}” verwijderen?`;
  if (!window.confirm(message)) return;
  if (!categories.includes(FALLBACK_CATEGORY)) categories.push(FALLBACK_CATEGORY);
  categories = categories.filter(item => item !== name);
  if (selectedCategory === name) selectedCategory = FALLBACK_CATEGORY;
  saveCategories();
  eachYear(data => {
    Object.keys(data).forEach(key => {
      if (!Array.isArray(data[key])) return;
      data[key].forEach(row => {
        if (row && row.category === name) row.category = FALLBACK_CATEGORY;
      });
    });
  });
  templates.forEach(item => {
    if (item.category === name) item.category = FALLBACK_CATEGORY;
  });
  saveTemplates();
  refreshVisible();
  announce(`${name} verwijderd.`);
}

function refreshVisible() {
  syncChrome();
  if (currentView === 'month') renderMonth();
  else if (currentView === 'year') renderYear();
  else renderCategories();
}

/* —— charts —— */

function chartFont() {
  return cssVar('--nt-font-sans') || 'Inter, sans-serif';
}

function baseChartOptions(showLegend) {
  const grid = cssVar('--nt-border') || 'rgba(0,0,0,0.08)';
  const ink = cssVar('--nt-ink-60') || '#696969';
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 180 },
    plugins: {
      legend: {
        display: showLegend,
        position: 'bottom',
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          color: ink,
          font: { family: chartFont(), size: 12 }
        }
      },
      tooltip: {
        callbacks: {
          label(ctx) {
            const raw = ctx.parsed && typeof ctx.parsed === 'object' ? (ctx.parsed.y ?? ctx.parsed) : ctx.parsed;
            const name = (ctx.dataset && ctx.dataset.label) || ctx.label || '';
            return name ? `${name}: ${formatMoney(raw)}` : formatMoney(raw);
          }
        }
      }
    },
    scales: {
      x: {
        grid: { color: grid, lineWidth: 1 },
        border: { display: false },
        ticks: { color: ink, font: { family: chartFont(), size: 11 } }
      },
      y: {
        beginAtZero: true,
        grid: { color: grid, lineWidth: 1 },
        border: { display: false },
        ticks: {
          color: ink,
          font: { family: chartFont(), size: 11 },
          callback: value => formatCompact(value)
        }
      }
    }
  };
}

function applyChartDefaults() {
  if (typeof Chart !== 'function') return;
  Chart.defaults.font.family = chartFont();
  Chart.defaults.color = cssVar('--nt-graphite') || '#615d59';
  Chart.defaults.borderColor = cssVar('--nt-border') || 'rgba(0,0,0,0.08)';
}

function ensureMonthCharts() {
  if (typeof Chart !== 'function' || charts.pie) return;
  applyChartDefaults();
  const surface = cssVar('--nt-surface') || '#ffffff';
  charts.pie = new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 2, borderColor: surface }] },
    options: {
      ...baseChartOptions(true),
      scales: {},
      cutout: '62%'
    }
  });
  charts.bar = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: ['Inkomsten', 'Uitgaven'],
      datasets: [{
        data: [0, 0],
        backgroundColor: [cssVar('--nt-blue') || '#0075de', cssVar('--nt-coral') || '#f64932'],
        borderRadius: 4,
        borderSkipped: false,
        maxBarThickness: 64
      }]
    },
    options: { ...baseChartOptions(false) }
  });
}

function ensureYearChart() {
  if (typeof Chart !== 'function') return;
  if (!charts.year) {
    applyChartDefaults();
    charts.year = new Chart(document.getElementById('yearlyChart'), {
      type: 'line',
      data: {
        labels: MONTHS_SHORT.map((_, idx) => monthShort(idx)),
        datasets: [
          {
            label: 'Inkomsten',
            data: [],
            borderColor: cssVar('--nt-blue') || '#0075de',
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: cssVar('--nt-blue') || '#0075de'
          },
          {
            label: 'Uitgaven',
            data: [],
            borderColor: cssVar('--nt-coral') || '#f64932',
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: cssVar('--nt-coral') || '#f64932'
          }
        ]
      },
      options: baseChartOptions(true)
    });
  }
}

function ensureDistChart() {
  if (typeof Chart !== 'function' || charts.dist) return;
  applyChartDefaults();
  charts.dist = new Chart(document.getElementById('yearlyDistributionPieChart'), {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 2, borderColor: cssVar('--nt-surface') || '#ffffff' }] },
    options: { ...baseChartOptions(true), scales: {}, cutout: '58%' }
  });
}

function updateMonthCharts() {
  ensureMonthCharts();
  if (!charts.pie || !charts.bar) return;
  const rows = getMonthData();
  const buckets = {};
  let income = 0;
  let expense = 0;
  rows.forEach(row => {
    const amount = Number(row.amount) || 0;
    if (row.type === 'income') income += amount;
    else {
      const name = row.category || FALLBACK_CATEGORY;
      buckets[name] = (buckets[name] || 0) + amount;
      expense += amount;
    }
  });
  const labels = Object.keys(buckets);
  const empty = document.getElementById('pieEmpty');
  const box = document.getElementById('pieChart').parentElement;
  if (empty) empty.hidden = labels.length !== 0;
  if (box) box.hidden = labels.length === 0;
  charts.pie.data.labels = labels;
  charts.pie.data.datasets[0].data = labels.map(name => buckets[name]);
  charts.pie.data.datasets[0].backgroundColor = labels.map(categoryColor);
  if (labels.length) charts.pie.resize();
  charts.pie.update();
  charts.bar.data.datasets[0].data = [income, expense];
  charts.bar.data.datasets[0].backgroundColor = [cssVar('--nt-blue') || '#0075de', cssVar('--nt-coral') || '#f64932'];
  charts.bar.update();
}

function updateYearChart(stats) {
  if (currentView !== 'year') return;
  ensureYearChart();
  if (!charts.year) return;
  charts.year.data.datasets[0].data = stats.map(item => item.income);
  charts.year.data.datasets[1].data = stats.map(item => item.expense);
  charts.year.update();
}

function updateDistChart(sorted) {
  if (currentView !== 'categories') return;
  ensureDistChart();
  if (!charts.dist) return;
  charts.dist.data.labels = sorted.map(item => item[0]);
  charts.dist.data.datasets[0].data = sorted.map(item => item[1]);
  charts.dist.data.datasets[0].backgroundColor = sorted.map(item => categoryColor(item[0]));
  charts.dist.update();
  const box = document.getElementById('yearlyDistributionPieChart').parentElement;
  if (box) box.hidden = sorted.length === 0;
}

/* —— import / export —— */

function dataLines(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];
  const first = parseCSVRow(lines[0]);
  if (!/^\d{4}$/.test((first[0] || '').trim())) return lines.slice(1);
  return lines;
}

function importCsvText(text) {
  const byYear = {};
  let count = 0;
  let skipped = 0;
  let categoriesChanged = false;
  dataLines(text).forEach(line => {
    const cols = parseCSVRow(line);
    if (cols.length < 7) {
      skipped += 1;
      return;
    }
    const [year, monthStr, date, desc, category, type, amount] = cols;
    const monthIdx = monthIndex(monthStr);
    if (!/^\d{4}$/.test(year) || monthIdx === -1) {
      skipped += 1;
      return;
    }
    const parsed = parseAmount(amount);
    if (!Number.isFinite(parsed)) {
      skipped += 1;
      return;
    }
    const categoryName = category || FALLBACK_CATEGORY;
    if (!categories.some(item => item.toLowerCase() === categoryName.toLowerCase())) {
      categories.push(categoryName);
      categoriesChanged = true;
    }
    if (!byYear[year]) byYear[year] = readYear(year);
    const key = `${year}_${monthIdx}`;
    if (!Array.isArray(byYear[year][key])) byYear[year][key] = [];
    byYear[year][key].push({
      id: Date.now() + Math.random(),
      desc: desc || 'Geïmporteerd',
      amount: Math.abs(parsed),
      type: normalizeType(type),
      category: categoryName,
      date: date || new Date().toISOString()
    });
    count += 1;
  });
  if (categoriesChanged) saveCategories();
  Object.entries(byYear).forEach(([year, data]) => writeYear(year, data));
  return { count, skipped };
}

function exportToCSV() {
  const csv = buildCSV(allTransactions, settings.year, settings.currency);
  const name = `Begroting_${settings.familyName || 'Gezin'}_${settings.year}.csv`;
  downloadFile(csv, name, 'text/csv;charset=utf-8;');
}

function buildBackup() {
  const years = {};
  listYearKeys().forEach(key => {
    const year = key.startsWith(YEAR_PREFIX) ? key.slice(YEAR_PREFIX.length) : '';
    const data = readJSON(key, {});
    if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length) {
      years[year] = data;
    }
  });
  return {
    app: 'family-budget-nl',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...settings },
    categories: categories.slice(),
    templates: templates.slice(),
    years
  };
}

function backupValid(data) {
  return Boolean(data
    && (data.app === 'family-budget-nl' || data.app === 'family-budget')
    && data.version === 1
    && data.settings
    && typeof data.settings === 'object'
    && Array.isArray(data.categories)
    && Array.isArray(data.templates)
    && data.years
    && typeof data.years === 'object'
    && !Array.isArray(data.years));
}

function restoreBackup(data) {
  listYearKeys().forEach(key => localStorage.removeItem(key));
  const year = parseInt(data.settings.year, 10);
  settings = {
    familyName: typeof data.settings.familyName === 'string' ? data.settings.familyName : '',
    year: year >= 2000 && year <= 2100 ? year : new Date().getFullYear(),
    currency: CURRENCIES.includes(data.settings.currency) ? data.settings.currency : 'EUR'
  };
  categories = data.categories.map(name => String(name || '').trim()).filter(Boolean);
  if (!categories.length) categories = DEFAULT_CATEGORIES.slice();
  if (!categories.includes(FALLBACK_CATEGORY)) categories.push(FALLBACK_CATEGORY);
  templates = data.templates.filter(item => item && typeof item === 'object');
  saveSettings();
  saveCategories();
  saveTemplates();
  Object.entries(data.years).forEach(([yearName, yearData]) => {
    if (/^\d{4}$/.test(yearName) && yearData && typeof yearData === 'object' && !Array.isArray(yearData)) {
      persist(yearKey(yearName), yearData);
    }
  });
  allTransactions = readYear(settings.year);
  selectedCategory = categories[0] || FALLBACK_CATEGORY;
  if (currentMonthIdx > 11) currentMonthIdx = 0;
}

function resetAllData() {
  listYearKeys().forEach(key => localStorage.removeItem(key));
  localStorage.removeItem(KEY_SETTINGS);
  localStorage.removeItem(KEY_CATEGORIES);
  localStorage.removeItem(KEY_TEMPLATES);
  settings = { familyName: '', year: new Date().getFullYear(), currency: 'EUR' };
  categories = DEFAULT_CATEGORIES.slice();
  templates = [];
  allTransactions = {};
  selectedType = 'expense';
  selectedCategory = categories[0];
  currentMonthIdx = new Date().getMonth();
  saveSettings();
  saveCategories();
  saveTemplates();
}

function downloadFile(contents, filename, type) {
  const blob = new Blob([contents], { type });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readFile(file, onLoad) {
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result || ''));
  reader.readAsText(file);
}

/* —— settings —— */

function openSettings() {
  const dialog = document.getElementById('settingsDialog');
  document.getElementById('settingFamilyName').value = settings.familyName || '';
  document.getElementById('settingYear').value = settings.year;
  document.getElementById('settingCurrency').value = settings.currency;
  document.getElementById('settingsError').textContent = '';
  document.getElementById('resetConfirm').value = '';
  document.getElementById('resetBtn').disabled = true;
  closeNav();
  if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
}

function closeSettings() {
  const dialog = document.getElementById('settingsDialog');
  if (dialog && dialog.open) dialog.close();
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  const error = document.getElementById('settingsError');
  const year = parseInt(document.getElementById('settingYear').value, 10);
  const currency = document.getElementById('settingCurrency').value;
  if (!year || year < 2000 || year > 2100) {
    error.textContent = 'Vul een jaar van 2000 tot 2100 in.';
    return;
  }
  if (!CURRENCIES.includes(currency)) {
    error.textContent = 'Kies een valuta uit de lijst.';
    return;
  }
  const previousYear = settings.year;
  settings.familyName = document.getElementById('settingFamilyName').value.trim();
  settings.year = year;
  settings.currency = currency;
  saveSettings();
  if (year !== previousYear) allTransactions = readYear(year);
  error.textContent = '';
  closeSettings();
  refreshVisible();
  renderMonthTabs();
  announce('Instellingen opgeslagen.');
}

/* —— events —— */

function onTablistKey(event) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  event.preventDefault();
  const dir = event.key === 'ArrowRight' ? 1 : -1;
  switchMonth(currentMonthIdx + dir);
  const tab = document.getElementById(`month-tab-${currentMonthIdx}`);
  if (tab) tab.focus();
}

function bindEvents() {
  document.querySelector('.nav-toggle').addEventListener('click', () => {
    const header = document.querySelector('.site-header');
    const toggle = document.querySelector('.nav-toggle');
    const open = header.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
  });
  document.getElementById('primary-menu').addEventListener('click', event => {
    const link = event.target.closest('[data-view]');
    if (!link) return;
    event.preventDefault();
    showView(link.getAttribute('data-view'));
  });
  document.getElementById('openSettings').addEventListener('click', openSettings);
  document.getElementById('closeSettings').addEventListener('click', closeSettings);
  document.getElementById('monthPrev').addEventListener('click', () => switchMonth(currentMonthIdx - 1));
  document.getElementById('monthNext').addEventListener('click', () => switchMonth(currentMonthIdx + 1));
  document.getElementById('monthTabs').addEventListener('keydown', onTablistKey);
  document.getElementById('budgetForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('typeExp').addEventListener('click', () => setFormType('expense'));
  document.getElementById('typeInc').addEventListener('click', () => setFormType('income'));
  document.getElementById('saveTemplate').addEventListener('click', saveAsTemplate);
  document.getElementById('showAddCategory').addEventListener('click', () => {
    const box = document.getElementById('inlineAddCategory');
    box.hidden = !box.hidden;
    if (!box.hidden) document.getElementById('inlineCategoryName').focus();
  });
  document.getElementById('inlineCategorySave').addEventListener('click', () => {
    const input = document.getElementById('inlineCategoryName');
    if (!addCategory(input.value)) {
      document.getElementById('formError').textContent = document.getElementById('categoryError').textContent;
      document.getElementById('categoryError').textContent = '';
      return;
    }
    input.value = '';
    document.getElementById('inlineAddCategory').hidden = true;
    document.getElementById('formError').textContent = '';
    renderCategoryPills();
  });
  document.getElementById('inlineCategoryName').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    document.getElementById('inlineCategorySave').click();
  });
  document.getElementById('addCategoryForm').addEventListener('submit', event => {
    event.preventDefault();
    const input = document.getElementById('newCategory');
    if (!addCategory(input.value)) return;
    input.value = '';
    refreshVisible();
    announce('Categorie toegevoegd.');
  });
  document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);
  document.getElementById('resetConfirm').addEventListener('input', event => {
    document.getElementById('resetBtn').disabled = event.target.value.trim() !== RESET_WORD;
  });
  document.getElementById('resetConfirm').addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.value.trim() === RESET_WORD) {
      event.preventDefault();
      document.getElementById('resetBtn').click();
    }
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (document.getElementById('resetConfirm').value.trim() !== RESET_WORD) return;
    resetAllData();
    closeSettings();
    showView('month');
    announce('Alle budgetgegevens zijn gewist.');
  });
  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    exportToCSV();
    announce(`${settings.year} geëxporteerd.`);
  });
  document.getElementById('importCsvBtn').addEventListener('click', () => document.getElementById('csvFileInput').click());
  document.getElementById('csvFileInput').addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    readFile(file, text => {
      const result = importCsvText(text);
      allTransactions = readYear(settings.year);
      closeSettings();
      refreshVisible();
      const noun = result.count === 1 ? 'transactie' : 'transacties';
      announce(`${result.count} ${noun} geïmporteerd${result.skipped ? `, ${result.skipped} overgeslagen` : ''}.`);
    });
  });
  document.getElementById('printBtn').addEventListener('click', () => {
    closeSettings();
    window.setTimeout(() => window.print(), 60);
  });
  document.getElementById('backupBtn').addEventListener('click', () => {
    const backup = buildBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(JSON.stringify(backup, null, 2), `FamilyBudgetNL_reservekopie_${stamp}.json`, 'application/json');
    announce('Reservekopie gedownload.');
  });
  document.getElementById('restoreBtn').addEventListener('click', () => document.getElementById('jsonFileInput').click());
  document.getElementById('jsonFileInput').addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    readFile(file, text => {
      let data;
      try { data = JSON.parse(text); } catch (err) { data = null; }
      if (!backupValid(data)) {
        document.getElementById('settingsError').textContent = 'Dit bestand is geen reservekopie van Family Budget NL.';
        return;
      }
      const years = Object.keys(data.years).length;
      const yearWord = years === 1 ? 'jaar' : 'jaar';
      const categoryWord = data.categories.length === 1 ? 'categorie' : 'categorieën';
      const templateWord = data.templates.length === 1 ? 'sjabloon' : 'sjablonen';
      const ok = window.confirm(`Alle budgetgegevens vervangen door deze reservekopie? Het bestand heeft ${years} ${yearWord}, ${data.categories.length} ${categoryWord} en ${data.templates.length} ${templateWord}.`);
      if (!ok) return;
      restoreBackup(data);
      closeSettings();
      showView(currentView);
      announce('Reservekopie teruggezet.');
    });
  });
  window.addEventListener('hashchange', () => {
    const name = location.hash.replace('#', '');
    if (name === 'settings') openSettings();
    else if (VIEWS.includes(name) && name !== currentView) showView(name, false);
  });
}

function init() {
  migrateMisfiledYears();
  if (!categories.includes(FALLBACK_CATEGORY)) {
    categories.push(FALLBACK_CATEGORY);
    saveCategories();
  }
  selectedCategory = categories[0] || FALLBACK_CATEGORY;
  bindEvents();
  const hash = location.hash.replace('#', '');
  if (hash === 'settings') {
    showView('month', false);
    openSettings();
  } else {
    showView(VIEWS.includes(hash) ? hash : 'month', false);
  }
}

document.addEventListener('DOMContentLoaded', init);

globalThis.FamilyBudget = {
  MONTHS,
  MONTHS_SHORT,
  CURRENCIES,
  DEFAULT_CATEGORIES,
  FALLBACK_CATEGORY,
  LOCALE,
  monthIndex,
  parseAmount,
  parseCSVRow,
  buildCSV,
  csvEscape,
  importCsvText,
  buildBackup,
  backupValid,
  restoreBackup,
  resetAllData,
  loadSettings,
  migrateMisfiledYears,
  get settings() { return settings; },
  get categories() { return categories; },
  get transactions() { return allTransactions; }
};

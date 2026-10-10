# Family Budget

A family budget planner for the month and the year. It runs in the browser, keeps every figure on this device, and uses the same warm-paper layout as [NetPulse](https://janvanhal.github.io/netpulse/) and [UnitPulse](https://janvanhal.github.io/unitpulse/).

Live site: https://janvanhal.github.io/family-budget/

## Features

- **Month** — switch months, see balance, income, and expenses, add a transaction, and save quick-add templates.
- **Year** — net, total income, total expenses, an income-vs-expenses chart, and a monthly table with a total row.
- **Categories** — yearly expense split, plus add, rename, and delete. Deleting a category asks first and moves its transactions to Other.
- **Settings** — family name, budget year, and currency. The currency list is USD, EUR, GBP, JPY, THB, CAD, AUD, INR, and BRL. A new budget starts in Thai baht.
- **Data tools** — import CSV, export CSV, print an A4 report, back up or restore JSON, and reset everything by typing `RESET`.

Charts use Chart.js. Nothing else is loaded from a CDN except the Inter and Source Serif 4 fonts.

## Data storage

Everything is in `localStorage` on this browser profile. The keys are the same as the earlier Family Budget app, so opening this site on `janvanhal.github.io` keeps data saved by the previous app:

| Key | Contents |
| --- | --- |
| `budgetSettings` | Family name, budget year, currency |
| `budgetCategories` | Category names |
| `budgetTemplates` | Quick-add templates |
| `familyBudget_v<year>` | Transactions for that year, grouped as `year_monthIndex` (January is `0`) |

A transaction is `{ id, desc, amount, type, category, date }`. `type` is `expense` or `income`. `date` is an ISO string.

No account is required and nothing is sent to a server.

## CSV

Export and import use one header and eight columns:

```text
Year,Month,Date,Description,Category,Type,Amount,Currency
```

Descriptions and categories are quoted, so commas inside them survive. Amounts can use `.` or `,` as the decimal mark (`1234.50` and `1.234,50` both import). Import adds rows. It does not delete transactions already stored.

## Backup

**Backup JSON** downloads every year, the category list, quick-add templates, and settings. **Restore JSON** replaces what this browser has stored. Keep a backup before you reset or before you clear site data.

## Local check

Open `index.html` in a browser, or from this folder:

```bash
python3 -m http.server 8080
node tests/logic.test.js
```

## Also from us

[NetPulse](https://janvanhal.github.io/netpulse/) · [UnitPulse](https://janvanhal.github.io/unitpulse/)

# Family Budget NL

Een gezinsbudget voor de maand en het jaar, in het Nederlands (Nederland). Het draait in de browser, bewaart elk bedrag op dit apparaat, en gebruikt dezelfde warme-papier-opmaak als [NetPulse](https://janvanhal.github.io/netpulse/) en [UnitPulse](https://janvanhal.github.io/unitpulse/).

Live site: https://janvanhal.github.io/family-budget-nl/

Een nieuw budget start in euro. Bedragen en datums volgen `nl-NL`: `€ 1.234,56` en `15 jan`. Je kunt `12,50` en `12.50` allebei invoeren.

## Functies

- **Maand** — wissel van maand, zie saldo, inkomsten en uitgaven, voeg een transactie toe en bewaar sjablonen voor snel toevoegen.
- **Jaar** — netto, totale inkomsten, totale uitgaven, een grafiek van inkomsten en uitgaven, en een maandoverzicht met een totaalrij.
- **Categorieën** — jaarlijkse verdeling van uitgaven, plus toevoegen, hernoemen en verwijderen. Verwijderen vraagt eerst om bevestiging en zet de transacties op Overig.
- **Instellingen** — gezinsnaam, begrotingsjaar en valuta. De lijst is EUR, USD, GBP, JPY, THB, CAD, AUD, INR en BRL. Standaard is de euro.
- **Gegevens** — CSV importeren, CSV exporteren, een A4-overzicht afdrukken, een JSON-reservekopie maken of terugzetten, en alles wissen door `WISSEN` te typen.

Grafieken gebruiken Chart.js. Verder laden alleen de lettertypen Inter en Source Serif 4 van een CDN.

Standaardcategorieën: Wonen, Boodschappen, Vervoer, Energie, Vrije tijd, Zorg, Salaris en Overig.

## Opslag

Alles staat in `localStorage` van dit browserprofiel. De sleutels staan los van de Engelse Family Budget-app, ook als beide sites op `janvanhal.github.io` staan. Wissen of hernoemen hier laat die andere app met rust.

| Sleutel | Inhoud |
| --- | --- |
| `budgetSettingsNL` | Gezinsnaam, begrotingsjaar, valuta |
| `budgetCategoriesNL` | Categorienamen |
| `budgetTemplatesNL` | Sjablonen voor snel toevoegen |
| `familyBudgetNL_v<jaar>` | Transacties van dat jaar, gegroepeerd als `jaar_maandindex` (januari is `0`) |

Een transactie is `{ id, desc, amount, type, category, date }`. `type` is `expense` of `income`. `date` is een ISO-tekenreeks.

Er is geen account nodig en er gaat niets naar een server.

## CSV

Export en import gebruiken één kopregel en acht kolommen:

```text
Jaar,Maand,Datum,Omschrijving,Categorie,Soort,Bedrag,Valuta
```

Omschrijvingen en categorieën staan tussen aanhalingstekens, zodat een komma erin blijft staan. Bedragen mogen `.` of `,` als decimaalteken hebben (`1234.50` en `1.234,50` worden allebei geïmporteerd). De soort is `uitgave` of `inkomst`.

Een oudere Engelse export werkt ook: maandnamen als `January` en soorten `expense` / `income`. Importeren voegt rijen toe. Het verwijdert geen transacties die al zijn opgeslagen.

## Reservekopie

**Reservekopie (JSON)** downloadt elk jaar, de categorielijst, de sjablonen en de instellingen. **Terugzetten (JSON)** vervangt wat deze browser heeft opgeslagen. Een reservekopie van de Engelse Family Budget-app kan ook worden teruggezet. Maak eerst zelf een reservekopie voordat je wist of sitegegevens leegt.

## Lokaal controleren

Open `index.html` in een browser, of vanuit deze map:

```bash
python3 -m http.server 8080
node tests/logic.test.js
```

## Ook van ons

[NetPulse](https://janvanhal.github.io/netpulse/) · [UnitPulse](https://janvanhal.github.io/unitpulse/)

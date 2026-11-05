# Model validation and testing report

Date: 5 November 2026. Scope: Phases 6 and 7 in detail, plus the plain-language interface update and the Excel template; earlier phases are summarised only where their tests exist today.

## 1. Result

**146 automated tests, all passing.** The independent SQL check matches all 8 reference totals to the cent.
The Streamlit application starts without errors.

| Test file | Tests | What it checks |
|---|---|---|
| `test_data_quality.py` | 13 | Every validation rule, on clean and damaged data |
| `test_kpis.py` | 11 | KPI formulas against hand-calculated values, division by zero |
| `test_segmentation.py` | 11 | Segment and flag rules, boundaries |
| `test_discounts.py` | 11 | Discount verdicts, break-even lift, seasonality, "not enough data" |
| `test_simulator.py` | 10 | Scenario results against hand examples, invalid inputs, equality with the KPI module |
| `test_inventory.py` | 14 | Stock formulas, status boundaries, validation, planted stories |
| `test_recommendations.py` | 12 | Six-part structure, ranking, cross-checks, no promises in the wording |
| `test_summary.py` | 6 | Key findings against hand-built data, report content |
| `test_app.py` | 43 | Every screen runs, buttons and filters work, dirty data does not crash the app; one-click demo, plain-language menu, banners, tooltips, no technical words on any screen, and Excel upload and download |
| `test_excel_io.py` | 15 | Excel template structure, fill-in rules matching the quality rules, balanced formulas, reader (dates, numeric codes, blank rows, row numbers), full round trip of the demo data through the template |

## 2. Validation methods

1. **Hand-calculated examples.** Each module's test file starts with a worked example whose answer was calculated by hand,
   for instance a product with price 100 and cost 50: a 20% discount needs 67% more units to break even.
2. **Consistency between modules.** With no changes, the simulator's baseline equals the KPI module (net revenue $852,008,
   gross profit $324,921). The Executive summary shows the same numbers as the Dashboard.
3. **Independent SQL reconciliation.** `sql/01_totals_check.sql` recomputes the totals in SQLite. All 8 values match
   (order lines 13,589; orders 9,132; units 22,716; net revenue $852,007.95; gross profit $324,921.47 and others).
4. **Planted-story recovery.** The simulated data contains known stories (for example one product with 5 days of stock
   and a 21-day lead time). The tests check that the modules find them.
5. **Boundary and edge cases.** Stock exactly at the reorder point, exactly 90 days of stock, discount larger than
   margin, product with no sales in the demand window, empty filter selections, zero or negative inputs.
6. **Damaged data.** `sales_dirty.csv` (13,599 rows) has 34 ERROR rows; the checks find all of them and the application
   still runs on the remaining 13,565 rows.
7. **Wording check.** A test fails if any recommendation contains words that promise results ("guarantee", "will increase" and similar).

Forecast accuracy measures such as MAE or RMSE do not apply: the project makes no forecasts. Inventory uses the
average of past demand, and the simulator uses assumptions the user sets.

## 3. Problems found and fixed during Phases 6 and 7

| Problem | How it was found | Fix |
|---|---|---|
| A product with **no sales in the demand window** disappeared from the demand table, so its demand was "unknown" instead of zero | A boundary test failed | Demand table now includes every product; such products get the status "No recent sales" |
| Two pricing reviews ranked **above** urgent stockouts in the High group | Review of the first output | Urgent items now sort first inside a priority level; a test checks it |
| "Top 3 products earn 100%" when only 2 products exist; "1 products may run out" | Tests on small data | Wording adapts to the number of products |
| A number format not supported by Streamlit was used in tables | Code review before delivery | Replaced with supported formats |
| A product flagged "promotion candidate" was also about to run out of stock | Review of real output | Cross-check rule added; tested |
| A formula in the template's Inventory check had one bracket too many | Template recalculated in LibreOffice: every Inventory row showed an error | Formula fixed; a test now checks that brackets are balanced on every check formula |
| Quantity 1.5 showed as "2" because the column was formatted as a whole number, hiding the mistake | Looking at a rendered copy of the template | Number, stock and delivery-time columns use the General format so the real value always shows |
| A blanket word replacement in the interface also changed a value the discount module compares against | Review of every changed line | Value restored; the screen shows a friendly label through a separate mapping |
| Several test fixtures had mistakes (a wrong line number, data with no sales on the last day) | Failing tests; each time the module was checked first | Tests corrected; in one case the module bug above was found |

## 4. Manual checks of the screens

Automated tests cannot judge layout, so each screen should also be checked in the browser against known numbers.

| Screen | Expected numbers | Manual check |
|---|---|---|
| Data, Dashboard | Dashboard totals equal the KPI module | Reported working by the author |
| Products | 7 Stars, 7 Low performers | Reported matching by the author |
| Discounts | Calculator: 20% discount, 50% margin gives 67% | Reported matching by the author |
| Simulator | Zero changes give net revenue $852,008, gross profit $324,921, margin 38.1%, units 22,716 | Reported working by the author |
| Inventory | 2 stockout risks, 0 reorder, 4 excess, 18 OK | **To be confirmed by the author** |
| Recommendations | High 4, Medium 3, Low 3; stockouts first | **To be confirmed by the author** |
| Executive summary | Same headline numbers as the Dashboard; 7 findings | **To be confirmed by the author** |

| Excel template in Microsoft Excel | Open `templates/EDIE_data_template.xlsx` in Excel. Type a bad date, a discount of 150% and a quantity of 0: each should be refused with a message. Type a wrong row and check `row_check` | **To be confirmed by the author.** The template was checked with a file-structure reader and in LibreOffice (row_check results on 8 sales and 6 inventory test cases), **not in Microsoft Excel itself** |
| Plain-language interface (look and feel) | Colours, banners and layout read well on a normal screen and on a LinkedIn screenshot | **To be confirmed by the author** (automated tests cannot judge appearance) |

Update this table when the remaining checks are done.

## 5. What this validation does NOT show

- **No real data.** All results are on simulated data. The tests prove that the logic does what it states, not that the
  conclusions hold for a real business.
- **Partly circular.** Because the data was built to contain known stories, finding them shows the code works, not that the
  methods would find unknown patterns in messy real data.
- **Discount verdicts are associations.** A test can check the arithmetic but cannot prove that a discount caused a change.
- **Thresholds are judgement.** Values such as 20% margin floor, 15% decline, 5% and 10% discount bands, and the 1% and 5%
  priority limits are reasonable defaults, not measured optima. Some can be changed on screen.
- **No performance or load testing,** and no test of a very large file.
- **Not tested** on other Python or library versions than those listed in `requirements.txt`.

## 6. How to repeat the validation

```
python -m pytest -q          # expect: 146 passed
python src/sql_check.py      # expect: ALL CHECKS PASSED
python src/data_quality.py data/sales_dirty.csv
```

# Data dictionary

All demo data is **simulated** (`src/generate_demo_data.py`, fixed seed 42). Period: 1 Jan 2025 to 30 Jun 2026
(18 months). `sales.csv` has 13,589 order lines, 9,132 orders, 24 products and 4 categories.

## 1. Sales file (`data/sales.csv`): one row per order line

| Column | Type | Required | Rule | Example |
|---|---|---|---|---|
| `order_id` | text | Yes | Not empty. One order can have several lines. | O000001 |
| `order_date` | date | Yes | Readable date, format `YYYY-MM-DD`. | 2025-01-01 |
| `product_id` | text | Yes | Not empty. Each ID should always have the same name and category. | P012 |
| `product_name` | text | Label | Missing name is a WARNING (row is still used). | Kitchen Knife Block |
| `category` | text | Label | Missing category is a WARNING (row is still used). | Home & Kitchen |
| `quantity` | whole number | Yes | Whole number above 0. Returns (negative quantities) are not supported. | 1 |
| `list_price` | number | Yes | Above 0. Price per unit before discount. | 75.00 |
| `discount_rate` | number | Yes | From 0 to 1 (0.10 = 10%). Not 10. | 0.05 |
| `unit_cost` | number | Yes | 0 or more. Cost of goods per unit. | 68.10 |

## 2. Inventory file (`data/inventory.csv`): one row per product

| Column | Type | Rule | Meaning |
|---|---|---|---|
| `product_id` | text | Not empty, no duplicates, must exist in the sales file | Product code |
| `current_stock` | number | 0 or more | Units in stock as of the last sales date |
| `lead_time_days` | number | Above 0 | Days between placing an order and receiving it |

The demo inventory is simulated, with planted stories (for example, one product with only 5 days of stock and a
21-day lead time). The sales file has no stock levels, so inventory results are only possible with this second file.
Demand variability is not in the file; it is calculated from the sales history.

## 3. Columns the application calculates

| Column | Formula |
|---|---|
| `gross_sales` | quantity x list_price |
| `discount_amount` | gross_sales x discount_rate |
| `net_revenue` | gross_sales - discount_amount |
| `cogs` | quantity x unit_cost |
| `gross_profit` | net_revenue - cogs |
| `gross_margin_pct` | gross_profit / net_revenue |

## 4. Data quality rules (Module A)

Rows with an **ERROR** cannot be used and are excluded and listed. Rows with a **WARNING** are kept and reported.
The program never invents or fills in missing business data and never deletes rows silently.

| Check | Severity |
|---|---|
| Required column missing | ERROR (analysis cannot run) |
| Missing value in order_id, order_date, product_id, quantity, list_price, discount_rate or unit_cost | ERROR |
| Quantity not a whole number above 0 | ERROR |
| List price not above 0 | ERROR |
| Discount rate outside 0 to 1 | ERROR |
| Unit cost not a number of 0 or more | ERROR |
| Invalid date | ERROR |
| Missing product_name or category | WARNING |
| Duplicate rows | WARNING |
| Unit cost above list price | WARNING |
| Product ID with several names or categories | WARNING |
| Order ID with several dates | WARNING |

Example: the deliberately damaged file `data/sales_dirty.csv` has 13,599 rows. The checks find 34 ERROR rows
(unit cost missing 10, bad quantity 12, bad price 4, bad discount 4, bad date 4), so 13,565 rows are used. They
also report warnings (8 missing names, 13 duplicate rows, 4 costs above price).

## 5. Inventory file checks

Rows with an ERROR are left out: missing or duplicate product_id, stock missing, not a number or negative, lead time
missing or not above 0. A product ID that is not in the sales data is a WARNING and is ignored. A sales product with
no usable inventory row is shown with the status "No inventory data".

## 6. The Excel template (`templates/EDIE_data_template.xlsx`)

| Sheet | Read by the app? | Purpose |
|---|---|---|
| Read me first | No | Instructions, column guide, colour legend |
| **Sales** | **Yes** | The sales data. Row 1 holds the exact column names of section 1. Room for 30,000 rows. |
| **Inventory** | **Yes, optional** | The stock data of section 2. Room for 2,000 products. |
| Example | No | A few made-up rows to copy the style from |

Rules built into the Sales sheet (they match the data quality rules of section 4):

| Column | Excel fill-in rule |
|---|---|
| order_id, product_id | Not empty |
| order_date | A real date between 2000 and 2100 |
| quantity | Whole number, 1 or more |
| list_price | Number above 0 |
| discount_rate | Between 0% and 100% (typing 10 or 10% both mean ten percent) |
| unit_cost | Number of 0 or more |
| product_name, category | Optional text |

Inventory sheet: current_stock a number of 0 or more; lead_time_days a number above 0; product_id should be unique and
should exist in the Sales sheet (this one gives a warning, not a refusal, so stock can be typed before sales).

The last column `row_check` is a formula that says OK or what to fix. The app ignores it. Completely empty rows are ignored.
Excel does not apply fill-in rules to pasted values; the app runs all checks again on upload.

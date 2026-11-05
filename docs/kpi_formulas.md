# KPI formulas and decision rules

Every number in the application comes from the formulas below. Thresholds are the defaults; several can be changed
on the screens.

## 1. Core KPIs (`src/kpis.py`)

| KPI | Formula |
|---|---|
| Gross sales | quantity x list price |
| Discount amount | gross sales x discount rate |
| Net revenue | gross sales - discount amount |
| COGS | quantity x unit cost |
| **Gross profit** | net revenue - COGS |
| Gross margin | gross profit / net revenue |
| Average order value | net revenue / number of unique orders |
| Average discount rate | discount amount / gross sales (weighted by sales, not a simple average) |

**Gross profit is not net profit.** The data has no fixed costs, shipping, marketing or tax.
Division by zero returns "not available" instead of an error.

## 2. Product segments and flags (`src/segmentation.py`)

Definitions: *high revenue* = net revenue at or above the median product; *portfolio margin* = total gross profit /
total net revenue; *healthy margin* = at or above the portfolio margin; *low margin* = below 20%.

| Segment (first matching rule) | Rule |
|---|---|
| Star | High revenue and healthy margin |
| Busy but thin | High revenue and low margin (below 20%) |
| Core volume | High revenue and margin between 20% and the portfolio margin |
| Niche | Not high revenue and healthy margin |
| Low performer | Not high revenue and margin below the portfolio margin |

| Flag | Rule |
|---|---|
| Declining sales | Units in the latest 6 months are at least 15% below the same 6 months a year earlier (needs 12+ months) |
| Promotion candidate | Niche and not declining |
| Price/cost review | Margin below 20% |

## 3. Discount effectiveness (`src/discounts.py`)

1. For each product and calendar month: effective discount = discount amount / gross sales.
2. **Full-price months**: effective discount below 5%. **Discounted months**: 10% or more. Months in between are left out.
3. Compare average monthly units and gross profit in the two groups, **adjusted for seasonality** (each month is divided
   by a seasonal index so a busy month such as November is not credited to a discount). A product needs at least 3 months in each group.
4. **Break-even volume lift = d / (m - d)**, where d is the discount and m is the unit margin as a share of list price.
   If d is at least m, no extra volume can pay for the discount.

Verdicts: *Discounts pay off*, *No clear gain from discounts*, *Discounts reduce gross profit*, *Not enough data*.
Example: price 100, cost 50, discount 20%: m = 0.5, break-even lift = 0.2 / 0.3 = 67% more units.

## 4. Pricing simulator (`src/simulator.py`)

For each product: new price = price x (1 + price change); new unit cost = cost x (1 + cost change); new units =
units x (1 + volume change); discount = the chosen discount, or the product's observed average.
Then gross sales = units x price, net revenue = gross sales x (1 - discount), gross profit = net revenue - units x cost.

**Break-even volume** = baseline gross profit / new profit per unit (price x (1 - discount) - cost). It means "the units
needed to match baseline gross profit". It is not a fixed-cost break-even, because the data has no fixed costs.

**Volume is an assumption.** Optionally it is derived from an assumed price elasticity:
volume ratio = (new customer price / old customer price) ^ elasticity. The elasticity is chosen by the user, not measured.

## 5. Inventory (`src/inventory.py`)

| Measure | Formula |
|---|---|
| Average daily demand d | units sold in the last N days / N (default N = 90; days with no sales count as 0) |
| Days of stock | current stock / d |
| Safety stock | z x (standard deviation of daily demand) x square root of lead time; z from the service level (95% gives 1.645) |
| Reorder point | d x lead time + safety stock |
| Order-up-to level | d x (lead time + cover days) + safety stock (default 30 cover days) |
| Suggested order | order-up-to level - current stock, rounded up, only when stock is at or below the reorder point (or at stockout risk) |
| Excess units | current stock - d x excess threshold (default 90 days) |
| Excess value | excess units x average unit cost (cash tied up, not profit) |

Status, checked in this order: *No recent sales*; *Stockout risk* (days of stock below the lead time); *Reorder now*
(stock at or below the reorder point); *Excess stock* (days of stock above the threshold); *OK*.

## 6. Recommendation priorities (`src/recommendations.py`)

| Rule | Priority |
|---|---|
| Stockout risk | Always High (sales are likely to be lost within days) |
| Reorder now | Medium |
| Items with a profit estimate | Estimated gross profit effect as a share of total gross profit: 5% or more High, 1% to under 5% Medium, below 1% Low |
| Excess stock (cash, not profit) | Never High. Medium if cash tied up is 1% or more of net revenue, otherwise Low |
| Promotion candidates, low performers | Low (no reliable money estimate) |
| Data quality | Share of rows excluded: 5% or more High, 1% to under 5% Medium, otherwise Low |

Inside one level, urgent items come first, then the larger estimated effect.

**Money estimates** (all approximate and based on past data): stockout = expected shortfall units x gross profit per unit;
thin margin = (portfolio margin - product margin) x net revenue; discounts that reduce profit or pay off = profit change x
average monthly gross profit at full price x discounted months; declining sales = (units a year earlier - units now) x
gross profit per unit; excess stock = excess units x average unit cost.

**Cross-checks:** a product at stockout or reorder risk is never suggested for a promotion or discount; excess-stock advice
depends on each product's discount verdict.

# Business case: E-commerce Decision Intelligence Engine

> All figures below come from the **simulated** demonstration data (24 products, 4 categories, Jan 2025 to Jun 2026).
> They show what the tool produces. They are not findings about a real company.

## 1. The problem

An online retailer makes the same decisions every week: what to promote, when to discount, what to reorder, what to
reprice. The data is usually spread across sales reports and stock lists, and the reports show *what happened*, not
*what to do*. Three costly mistakes are common:

1. **Discounts that lose money.** A discount cuts profit on every unit, so it only helps if enough extra units are sold.
   Many teams never check.
2. **Busy products with thin margins.** A product can be a top seller and still earn almost nothing.
3. **Stock decisions made by feel.** Products run out before new stock arrives, while other products sit in the warehouse
   tying up cash.

## 2. The approach

The engine is a chain of small, explainable calculations, each tested on its own:

| Step | Question answered | Method |
|---|---|---|
| Check the data | Can I trust the file? | 12 validation rules; errors are excluded and reported, never repaired |
| Measure performance | How are we doing? | Net revenue, gross profit, margin, trends by month, category and product |
| Segment products | Which products need what attention? | Transparent rules on revenue and margin, plus decline, promotion and price/cost flags |
| Test discounts | Do discounts pay off? | Compare full-price and discounted months, adjusted for seasonality, against the break-even volume |
| Simulate | What if we change price, discount, cost or volume? | Scenario calculation; sales volume is the user's explicit assumption |
| Manage stock | What will run out, what to reorder, what is excess? | Days of stock, safety stock, reorder point |
| Recommend | What should we do first? | Rule-based actions with evidence, benefit, risks and a priority, with cross-checks between rules |

No machine learning is used. Every number can be traced to a formula (`docs/kpi_formulas.md`), so a manager can challenge it.

## 3. What the tool finds in the simulated data

| Finding | Evidence |
|---|---|
| Overall | Net revenue $852,008, gross profit $324,921, gross margin 38.1% |
| Growth | Latest 6 months against the same months a year earlier: net revenue +6.0%, gross profit +9.3% |
| Discounts are widespread | $97,189 given away (10.2% of gross sales); 14 of 24 products earned less gross profit in discounted months, 5 earned more |
| Thin margins | Bluetooth Speaker Mini (7.5%) and Kitchen Knife Block (3.4%) bring 13.5% of net revenue |
| Stock risk | Face Moisturizer and Resistance Bands Set may run out before an order could arrive |
| Excess stock | 4 products hold about $7,777 (at cost) above the 90-day threshold |

Example of one recommendation (Face Moisturizer, rank 1, High): 12 units cover 5.1 days but the lead time is 21 days;
expected shortfall about 37 units. Action: order about 126 units now and ask about faster delivery; do not run promotions
meanwhile. Benefit: protects up to about $496 of gross profit. Risk: assumes demand stays at its recent average.

## 4. Estimated value (simulated data, approximate)

The engine estimates each opportunity from past data and always words it as "up to about":

| Opportunity | Estimate | How it is estimated |
|---|---|---|
| Fix thin margins on 2 products | up to about $37,100 over the period (19,867 + 17,267) | Raise margin to the portfolio average at the same revenue |
| Stop discounts that reduce profit (14 products) | up to about $11,957 | Profit given up in discounted months |
| Keep discounts that pay off (5 products) | about $8,734 of extra profit seen | Profit gained in discounted months |
| Investigate declining sales (6 products) | about $3,597 | Return to last year's level for the same 6 months |
| Avoid stockouts (2 products) | up to about $810 | Expected shortfall units x gross profit per unit |

These estimates overlap and are not a forecast. Total gross profit over the period is $324,921, so the largest
single item (thin margins) is about 11% of it.

## 5. How the tool avoids misleading the user

- Simulated data is labelled on every screen and in the downloaded report.
- Discount results are described as a link in past data, not proof of cause.
- Break-even in the simulator means "match the baseline gross profit", because the data has no fixed costs.
- A product at stock risk is never recommended for a promotion, even when another rule flags it as a promotion candidate.
- Benefits are written as estimates with risks beside them.

## 6. Limits and next steps

Limits: simulated data; gross profit only; no customer-level analysis; steady-demand inventory model; discount analysis
cannot prove cause.

Next steps with real data: connect to the company's order and stock exports; check the discount verdicts with a controlled
price test on a few products; add customer data for repeat-purchase analysis; add seasonality to the demand model.

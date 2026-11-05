# Interview preparation

Answers are in simple English so you can say them in your own words. Learn the idea, not the exact sentences.

## A. The project in general

**1. Why did you build this project?**
Reports usually show what happened. I wanted a tool that shows what to do next, in order of importance, and explains
why. I also wanted a project where every number can be traced to a formula.

**2. Who is it for?**
A manager or analyst at an online retailer who has a sales export and a stock list and has to decide about promotions,
discounts, prices and ordering.

**3. Why did you use simulated data?**
I do not have a company's real data, and real data is private. I generated 18 months of data with a fixed random seed, so
anyone can repeat my results. I planted known stories (for example, a product that is about to run out of stock) so I could
test that the code finds them. The app labels the data as simulated on every screen.

**4. Why no machine learning?**
The business questions did not need it, and I must be able to explain every result. Simple rules are easier to check and
easier for a manager to trust. I did not add machine learning only to look advanced.

**5. Why Python and Streamlit?**
Python with pandas is the standard for data work. Streamlit turns a Python file into an interactive web page without
web-development skills, so I could spend my time on the analysis.

## B. Data and KPIs

**6. How do you handle bad data?**
Twelve rules check every row. A row with an error (for example, a missing cost) is excluded and listed with the reason and the
line number. A row with a warning (for example, a duplicate) is kept and reported. I never fill in missing business data,
because a guessed cost would create a false profit number.

**7. What is gross profit, and why not net profit?**
Gross profit is net revenue minus the cost of goods sold. The data has no fixed costs, shipping, marketing or tax, so net profit
cannot be calculated. I say this on the screen so nobody reads gross profit as net profit.

**8. How did you check your numbers?**
Three ways: hand-calculated examples in the tests; the same totals recalculated independently in SQL (all 8 matched); and
consistency checks between modules, for example the simulator's baseline equals the KPI module.

## C. Products and discounts

**9. How do you decide a product is a "Star"?**
Revenue at or above the median product and margin at or above the portfolio margin. The rules are relative: they compare products
with each other, not with an outside benchmark. Every segment label shows the rule and the numbers.

**10. How do you test whether a discount works?**
I split each product's months into full-price months (discount under 5%) and discounted months (10% or more) and compare
average gross profit, adjusted for seasonality. I also calculate the break-even volume lift, d / (m - d): with a 20% discount
and a 50% margin you need 67% more units just to earn the same profit.

**11. Can you say the discount caused the result?**
No. It compares past months, so competitors, advertising or stock problems could also have moved sales. I call it a link, not
proof. With real data I would confirm it with a controlled price test.

**12. What happens if the discount is bigger than the margin?**
No extra volume can ever pay for it, because every unit loses money. The calculator says so instead of showing a number.

## D. Simulator and inventory

**13. How does the simulator predict sales?**
It does not. The user sets the volume change, because the data cannot tell us how customers react to a new price. There is an
optional elasticity helper, but the elasticity is an assumption the user chooses.

**14. Explain safety stock and the reorder point.**
Demand during the lead time is average daily demand times lead time. Safety stock adds a buffer for demand that varies:
z times the standard deviation of daily demand times the square root of lead time. Reorder point is the sum. When stock falls
to the reorder point, order. The service level (95% by default) sets z.

**15. When is a product "at stockout risk"?**
When days of stock is less than the lead time: it will run out before an order placed today can arrive. This is the only
status that is always High priority.

**16. What are the limits of your inventory model?**
It assumes steady demand and a fixed lead time. It ignores seasons, promotions, minimum order quantities and storage limits.
The demo stock levels are simulated.

## E. Recommendations

**17. How do you rank recommendations?**
Stockouts are always first because sales are lost within days. Other items are ranked by estimated gross profit effect as a share
of total gross profit: 5% or more is High, 1% to 5% Medium, below 1% Low. Cash tied up in excess stock is never High, because
the stock is not lost. These thresholds are my judgement and are written in the app.

**18. Give an example of two rules that could contradict each other.**
The segment rules flagged the Resistance Bands Set as a promotion candidate, but the stock analysis showed it would run out in
about five days. Promoting it would waste money and disappoint customers. I added a cross-check: a product at stock risk is
never suggested for a promotion, and the recommendation says why it was left out.

**19. Why do you write "up to about" for benefits?**
They are estimates from past data. Promising a result would be dishonest and a manager would stop trusting the tool.

## F. Testing and honesty

**20. How did you test it, and what did testing find?**
146 automated tests. For example, a boundary test showed that a product with no sales in the 90-day window disappeared from
the demand table, so its demand was "unknown" instead of zero. I fixed it and the product now gets the status "No recent sales".

**21. What are the weakest points of the project?**
The data is simulated, so the conclusions are not about a real business. Discount results are associations. Thresholds such as the
20% margin floor are judgement. There is no customer analysis because the dataset has no customer field.

**22. Is your validation circular?**
Partly. I planted stories in the data and then tested that the code finds them. That proves the code works as designed, not that it
would find unknown patterns in messy real data. The next step would be to test on real data.

**23. What would you do with real company data?**
Check the column definitions with the data owner, run the quality report, compare my totals with the finance team's numbers,
check the discount verdicts with a price test on a few products, and confirm lead times and stock levels with the warehouse.

**24. How would you improve it?**
Add customer data for repeat-purchase analysis, add seasonality to the demand model, estimate price elasticity from real price
tests, and connect directly to the company's database.

## G. Short answers to keep ready

| If asked | Say |
|---|---|
| "Is this machine learning?" | No. It is rule-based on purpose, so each result can be explained and checked. |
| "Did it improve real profits?" | No. It ran on simulated data. It shows the method. |
| "What is your biggest learning?" | Testing found a real bug in my own code, and cross-checking recommendations against each other prevented a bad one. |
| "What was hardest?" | Making recommendations that do not contradict each other and do not overpromise. |

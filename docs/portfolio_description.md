# Portfolio description (CV and LinkedIn)

**Rule for all versions:** say that the data is simulated. Employers respect honesty, and a sharp interviewer will ask.

## 30-second pitch (spoken)

"I built an application that takes e-commerce sales and stock data and tells a manager what to do first. It checks the
data quality, finds products that sell well but earn little, tests whether discounts really pay off, simulates price
changes, spots products that will run out of stock, and ranks the actions with evidence and risks. I tested it with 146
automated tests and checked the totals independently with SQL. I used simulated data, so the numbers are not a real
company, but the method works on any file with the right columns."

## CV: project entry

**E-commerce Decision Intelligence Engine** | MBA Business Analytics project | Python, pandas, Streamlit, Plotly, SQL

- Built an interactive 8-screen decision-support application that turns sales and inventory data into ranked,
  evidence-based recommendations, using 7 modules (data quality, KPIs, segmentation, discount analysis, pricing
  simulator, inventory, recommendations).
- Designed transparent rule-based analytics instead of black-box models: product segmentation, a seasonality-adjusted
  discount test against the break-even volume lift, and reorder-point and safety-stock calculations.
- Validated with 146 automated tests, including hand-calculated examples and an independent SQL reconciliation that
  matched all 8 reference totals; documented 12 data-quality rules, KPI formulas and known limitations.
- Added cross-checks so recommendations do not contradict each other (for example, no promotion for a product about to
  run out of stock) and wrote every benefit as an estimate with its risks.
- Tested on simulated data (24 products, 13,589 order lines, 18 months).

### Shorter version (3 bullets)

- Built a Python and Streamlit decision-support application (8 screens, 7 analytical modules) that converts sales and inventory data into ranked recommendations with evidence, risks and priorities.
- Implemented data quality checks, product segmentation, a seasonality-adjusted discount-effectiveness test, a pricing simulator and reorder-point inventory analysis, all rule-based and explainable.
- Validated with 146 automated tests and an independent SQL reconciliation; demonstrated on a simulated 18-month dataset.

## LinkedIn: project description (about 150 words)

I built the **E-commerce Decision Intelligence Engine**, an interactive application for an MBA Business Analytics
portfolio. It answers the questions an online retailer asks every week: Which products earn the most profit? Which sell a
lot but earn little? Do discounts pay off? What happens if we change the price? Which products will run out of stock?

The application checks data quality, calculates KPIs, segments products, tests discounts against the break-even volume,
simulates price scenarios, analyses stock, and ranks recommended actions, each with evidence, expected benefit, risks and
priority. I chose simple, explainable methods over machine learning so every number can be traced and defended.

It is built in Python (pandas, Streamlit, Plotly) with a SQL check, and validated by 146 automated tests. The demonstration
data is simulated, and the app says so on every screen.

#hashtags: #BusinessAnalytics #Python #DataAnalytics #Ecommerce #Streamlit #SQL

## Skills this project shows

Data validation and cleaning rules; KPI design (revenue, gross profit, margin); product portfolio analysis; pricing and
discount analysis (break-even logic); inventory analytics (safety stock, reorder point); scenario modelling and clear
statement of assumptions; Python (pandas, Streamlit, Plotly); SQL reconciliation; automated testing; technical and business
documentation; communicating limitations honestly.

## What not to claim

- Do not say the tool improved a real company's profit. It did not touch real data.
- Do not say it "predicts" sales or demand. It makes no forecasts.
- Do not say the discount analysis proves causes. It shows an association in past data.
- Do not mention customer analytics. The dataset has no customer field.

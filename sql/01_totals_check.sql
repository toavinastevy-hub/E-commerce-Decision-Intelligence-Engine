-- 01_totals_check.sql
-- Independent check of the main KPIs, calculated with SQL (not pandas).
-- Formulas (KPI definitions v1):
--   gross_sales   = quantity * list_price
--   net_revenue   = gross_sales * (1 - discount_rate)
--   cogs          = quantity * unit_cost
--   gross_profit  = net_revenue - cogs
SELECT
    COUNT(*)                                                    AS order_lines,
    COUNT(DISTINCT order_id)                                    AS orders,
    SUM(quantity)                                               AS units_sold,
    ROUND(SUM(quantity * list_price), 2)                        AS gross_sales,
    ROUND(SUM(quantity * list_price * discount_rate), 2)        AS discount_amount,
    ROUND(SUM(quantity * list_price * (1 - discount_rate)), 2)  AS net_revenue,
    ROUND(SUM(quantity * unit_cost), 2)                         AS cogs,
    ROUND(SUM(quantity * list_price * (1 - discount_rate))
          - SUM(quantity * unit_cost), 2)                       AS gross_profit
FROM sales;

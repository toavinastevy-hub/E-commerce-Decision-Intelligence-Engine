"""
kpis.py  -  Core KPI calculations for EDIE (KPI definitions v1)

Every KPI in the application is calculated here, so formulas are consistent.

Line-level formulas (one row of sales data):
    gross_sales     = quantity * list_price
    discount_amount = gross_sales * discount_rate
    net_revenue     = gross_sales - discount_amount
    cogs            = quantity * unit_cost            (cost of goods sold)
    gross_profit    = net_revenue - cogs

Summary formulas (many rows):
    gross_margin_pct      = gross_profit / net_revenue
    avg_order_value (AOV) = net_revenue / number of unique orders
    avg_discount_rate     = discount_amount / gross_sales   (weighted by sales value)

NOTE: Net profit is NOT calculated. The data has no fixed costs, shipping,
marketing or tax. "Gross profit" must never be called "net profit".
Dates are assumed to have passed the data-quality check before use here.
"""
import numpy as np
import pandas as pd


def safe_divide(numerator, denominator):
    """Divide, returning NaN (shown as 'n/a') instead of an error when the denominator is 0."""
    if denominator is None or pd.isna(denominator) or denominator == 0:
        return np.nan
    return numerator / denominator


def add_calculated_columns(df):
    """Return a copy of the sales data with the line-level KPI columns added."""
    out = df.copy()
    out["gross_sales"] = out["quantity"] * out["list_price"]
    out["discount_amount"] = out["gross_sales"] * out["discount_rate"]
    out["net_revenue"] = out["gross_sales"] - out["discount_amount"]
    out["cogs"] = out["quantity"] * out["unit_cost"]
    out["gross_profit"] = out["net_revenue"] - out["cogs"]
    return out


def summary_kpis(df):
    """Headline KPIs for a sales table (raw or already with calculated columns)."""
    d = df if "gross_profit" in df.columns else add_calculated_columns(df)
    net_revenue = d["net_revenue"].sum()
    gross_profit = d["gross_profit"].sum()
    gross_sales = d["gross_sales"].sum()
    discount_amount = d["discount_amount"].sum()
    orders = d["order_id"].nunique()
    return {
        "order_lines": int(len(d)),
        "orders": int(orders),
        "units_sold": int(d["quantity"].sum()),
        "gross_sales": float(gross_sales),
        "discount_amount": float(discount_amount),
        "net_revenue": float(net_revenue),
        "cogs": float(d["cogs"].sum()),
        "gross_profit": float(gross_profit),
        "gross_margin_pct": safe_divide(gross_profit, net_revenue),
        "avg_order_value": safe_divide(net_revenue, orders),
        "avg_discount_rate": safe_divide(discount_amount, gross_sales),
    }


def kpis_by(df, group_cols):
    """KPIs per group (e.g. per product, category or month).

    Adds each group's share of total revenue and total gross profit.
    Shares add up to 100% (1.0) across all groups.
    """
    d = df if "gross_profit" in df.columns else add_calculated_columns(df)
    if isinstance(group_cols, str):
        group_cols = [group_cols]
    g = (d.groupby(group_cols, dropna=False)
          .agg(order_lines=("order_id", "size"),
               orders=("order_id", "nunique"),
               units_sold=("quantity", "sum"),
               gross_sales=("gross_sales", "sum"),
               discount_amount=("discount_amount", "sum"),
               net_revenue=("net_revenue", "sum"),
               cogs=("cogs", "sum"),
               gross_profit=("gross_profit", "sum"))
          .reset_index())
    g["gross_margin_pct"] = [safe_divide(p, r) for p, r in zip(g["gross_profit"], g["net_revenue"])]
    g["avg_discount_rate"] = [safe_divide(x, s) for x, s in zip(g["discount_amount"], g["gross_sales"])]
    total_rev, total_gp = g["net_revenue"].sum(), g["gross_profit"].sum()
    g["revenue_share"] = [safe_divide(x, total_rev) for x in g["net_revenue"]]
    g["profit_share"] = [safe_divide(x, total_gp) for x in g["gross_profit"]]
    return g


def kpis_by_month(df):
    """KPIs per calendar month. Adds a 'month' column like '2025-03'."""
    d = df if "gross_profit" in df.columns else add_calculated_columns(df)
    d = d.copy()
    d["month"] = pd.to_datetime(d["order_date"]).dt.strftime("%Y-%m")
    return kpis_by(d, "month").sort_values("month").reset_index(drop=True)

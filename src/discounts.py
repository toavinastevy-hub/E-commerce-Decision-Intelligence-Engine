"""
discounts.py  -  Module B (part 2): Are discounts worth it?

BUSINESS QUESTION
    A discount lowers the profit on every unit sold. It only pays off if the
    extra units sold are enough to make up for that. Do our discounts do that?

METHOD (simple and explainable)
    1. For every product and calendar month, find the effective discount rate:
           discount_amount / gross_sales
    2. Split each product's months into two groups:
           FULL-PRICE months  : effective discount below 5%
           DISCOUNTED months  : effective discount of 10% or more
       (Months in between are left out so the two groups are clearly different.)
    3. Compare the average monthly UNITS and the average monthly GROSS PROFIT
       of the two groups.
    4. Seasonality adjustment: some months are busier for everybody (e.g.
       November). We divide each month by a seasonal index (that month's total
       units for ALL products / the average month) so a busy month is not
       mistaken for a discount effect.

BREAK-EVEN VOLUME LIFT
    With list price P, unit cost C and discount d, profit per unit falls from
    (P - C) to (P*(1-d) - C). Selling Q units at full price earns Q*(P-C).
    To earn the same with a discount we must sell Q' units where
        Q'/Q = (P - C) / (P*(1-d) - C) = m / (m - d)
    with m = (P - C) / P  (unit margin as a share of list price).
    So the required extra volume is:   d / (m - d)
    If d >= m, the discount can never pay for itself.

LIMITATIONS (important - say these in an interview)
    * This compares past months; it does NOT prove the discount CAUSED the change.
      Other things (competitors, ads, stock-outs, trends) can also move sales.
    * Needs enough months in both groups (default 3 each); otherwise "Not enough data".
    * Months with zero sales do not appear in the data, so they are not counted.
"""
import numpy as np
import pandas as pd
from src.kpis import add_calculated_columns, safe_divide


def breakeven_volume_lift(discount_rate, unit_margin_pct_of_list):
    """Extra volume (as a fraction, 0.5 = +50%) needed for a discount to keep gross profit unchanged.

    Returns 0.0 if there is no discount, and infinity if the discount is as large as
    (or larger than) the unit margin, because then it can never break even.
    """
    d, m = discount_rate, unit_margin_pct_of_list
    if d <= 0:
        return 0.0
    if m <= d:
        return float("inf")
    return d / (m - d)


def seasonal_index(df):
    """Index per month = that month's total units (all products) / average monthly total units."""
    d = df.copy()
    d["month"] = pd.to_datetime(d["order_date"]).dt.strftime("%Y-%m")
    totals = d.groupby("month")["quantity"].sum()
    return totals / totals.mean()


def discount_effectiveness(df, adjust_seasonality=True, min_months=3,
                           full_price_below=0.05, discounted_from=0.10,
                           verdict_threshold=0.05):
    """One row per product comparing full-price months with discounted months."""
    d = add_calculated_columns(df)
    d["month"] = pd.to_datetime(d["order_date"]).dt.strftime("%Y-%m")

    pm = (d.groupby(["product_id", "month"])
           .agg(units=("quantity", "sum"), gross_sales=("gross_sales", "sum"),
                discount_amount=("discount_amount", "sum"), cogs=("cogs", "sum"),
                gross_profit=("gross_profit", "sum"))
           .reset_index())
    pm["eff_discount"] = pm["discount_amount"] / pm["gross_sales"].replace(0, np.nan)

    idx = seasonal_index(d) if adjust_seasonality else pd.Series(1.0, index=pm["month"].unique())
    pm["idx"] = pm["month"].map(idx)
    pm["units_adj"] = pm["units"] / pm["idx"]
    pm["gp_adj"] = pm["gross_profit"] / pm["idx"]

    names = d.drop_duplicates("product_id").set_index("product_id")["product_name"]
    rows = []
    for pid, g in pm.groupby("product_id"):
        full = g[g["eff_discount"] < full_price_below]
        disc = g[g["eff_discount"] >= discounted_from]
        total_gs, total_cogs = g["gross_sales"].sum(), g["cogs"].sum()
        unit_margin = 1 - safe_divide(total_cogs, total_gs)       # margin at list price
        avg_disc = safe_divide(disc["discount_amount"].sum(), disc["gross_sales"].sum()) if len(disc) else np.nan
        row = {"product_id": pid, "product_name": names.get(pid),
               "months_full_price": len(full), "months_discounted": len(disc),
               "avg_discount_when_discounted": avg_disc,
               "unit_margin_at_list_price": unit_margin}
        enough = len(full) >= min_months and len(disc) >= min_months
        if enough:
            u_full, u_disc = full["units_adj"].mean(), disc["units_adj"].mean()
            p_full, p_disc = full["gp_adj"].mean(), disc["gp_adj"].mean()
            lift = safe_divide(u_disc, u_full) - 1
            gp_change = safe_divide(p_disc, p_full) - 1
            need = breakeven_volume_lift(avg_disc, unit_margin)
            row.update({"avg_units_full_price": u_full, "avg_units_discounted": u_disc,
                        "volume_lift_pct": lift,
                        "avg_gross_profit_full_price": p_full, "avg_gross_profit_discounted": p_disc,
                        "gross_profit_change_pct": gp_change,
                        "breakeven_lift_pct": need})
            if pd.isna(gp_change):
                verdict, why = "Not enough data", "Full-price profit is zero or missing."
            elif gp_change > verdict_threshold:
                verdict = "Discounts pay off"
            elif gp_change < -verdict_threshold:
                verdict = "Discounts reduce gross profit"
            else:
                verdict = "No clear gain from discounts"
            if verdict != "Not enough data":
                need_txt = "never (discount >= unit margin)" if np.isinf(need) else f"{need:.0%}"
                why = (f"Volume changed {lift:+.0%} in discounted months (needed {need_txt} to break even); "
                       f"gross profit per month changed {gp_change:+.0%}.")
            row["verdict"], row["verdict_reason"] = verdict, why
        else:
            row["verdict"] = "Not enough data"
            row["verdict_reason"] = (f"Need at least {min_months} full-price and {min_months} discounted months; "
                                     f"found {len(full)} and {len(disc)}.")
        rows.append(row)
    return pd.DataFrame(rows)

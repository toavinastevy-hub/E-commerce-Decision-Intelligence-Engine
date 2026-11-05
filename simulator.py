"""
simulator.py  -  Module D: Pricing and discount what-if simulator

BUSINESS QUESTION
    "If we change price, discount, cost or sales volume, what happens to
    revenue and gross profit?"

WHAT IS OBSERVED AND WHAT IS ASSUMED
    OBSERVED (from the uploaded data, per product):
        units sold, average list price, average unit cost, average discount rate.
    ASSUMED (chosen by the user, not known to the model):
        the price change, the new discount, the cost change and, above all,
        the CHANGE IN SALES VOLUME. The data cannot tell us how customers will
        react to a new price, so volume is always an input, never a prediction.
        A helper (implied_volume_change) can suggest a volume change from an
        assumed price elasticity, but the elasticity is still an assumption.

CALCULATION (for each product, then added up)
    list price      P' = P x (1 + price change)
    unit cost       C' = C x (1 + cost change)
    discount rate   d' = new discount, or the observed average if none is given
    units           Q' = Q x (1 + volume change)
    gross sales        = Q' x P'
    discount amount    = gross sales x d'
    net revenue        = gross sales - discount amount
    COGS               = Q' x C'
    gross profit       = net revenue - COGS
    gross margin       = gross profit / net revenue

BREAK-EVEN SALES VOLUME
    The number of units needed at the NEW price, discount and cost to earn the
    SAME gross profit as the baseline:
        break-even units = baseline gross profit / new profit per unit
        new profit per unit = P' x (1 - d') - C'
    If the new profit per unit is zero or negative, no volume is enough (inf).
    This is NOT the classic fixed-cost break-even: the data has no fixed costs,
    shipping, marketing or tax, so only gross profit is used.

LIMITATIONS
    * Uses past average prices and costs; real prices and costs may vary by order.
    * Ignores stock limits, competitors and any effect on other products.
    * Past data covers the whole period in the file, not a single month.
"""
import numpy as np
import pandas as pd
from src.kpis import add_calculated_columns, safe_divide


def implied_volume_change(old_effective_price, new_effective_price, elasticity):
    """Volume change suggested by an ASSUMED price elasticity.

    Constant-elasticity rule: volume ratio = (new price / old price) ** elasticity.
    Elasticity is normally negative: -1.5 means a 10% price rise cuts volume by about 13%.
    Example: price 100 -> 80 with elasticity -1.5 gives +39.8% volume.
    """
    if old_effective_price <= 0 or new_effective_price <= 0:
        raise ValueError("Prices must be above 0.")
    return (new_effective_price / old_effective_price) ** elasticity - 1


def baseline_by_product(df):
    """Observed units, average list price, average unit cost and average discount per product."""
    d = add_calculated_columns(df)
    g = (d.groupby(["product_id", "product_name", "category"], as_index=False)
          .agg(units=("quantity", "sum"), gross_sales=("gross_sales", "sum"),
               discount_amount=("discount_amount", "sum"), cogs=("cogs", "sum")))
    g["list_price"] = g["gross_sales"] / g["units"]
    g["unit_cost"] = g["cogs"] / g["units"]
    g["discount_rate"] = [safe_divide(a, b) for a, b in zip(g["discount_amount"], g["gross_sales"])]
    return g


def _totals(units, gross_sales, discount_amount, cogs):
    net = gross_sales - discount_amount
    gp = net - cogs
    return {"units": units, "gross_sales": gross_sales, "discount_amount": discount_amount,
            "net_revenue": net, "cogs": cogs, "gross_profit": gp,
            "gross_margin_pct": safe_divide(gp, net)}


def simulate(df, price_change=0.0, discount_rate=None, cost_change=0.0, volume_change=0.0, product_ids=None):
    """Compare the observed baseline with a what-if scenario.

    price_change, cost_change, volume_change: fractions (0.10 = +10%, -0.05 = -5%).
    discount_rate: new discount as a fraction (0.20 = 20% off); None keeps each product's observed average.
    product_ids: list of products to simulate; None means all products.
    Returns {"baseline": {...}, "scenario": {...}, "change": {...}, "breakeven_units": float,
             "by_product": DataFrame}.
    """
    if price_change <= -1 or cost_change <= -1 or volume_change <= -1:
        raise ValueError("A change of -100% or lower is not possible.")
    if discount_rate is not None and not (0 <= discount_rate < 1):
        raise ValueError("Discount must be from 0 up to (but not including) 100%.")

    base = baseline_by_product(df)
    if product_ids is not None:
        base = base[base["product_id"].isin(product_ids)]
    if base.empty:
        raise ValueError("No products selected.")
    base = base.reset_index(drop=True)

    p_new = base["list_price"] * (1 + price_change)
    c_new = base["unit_cost"] * (1 + cost_change)
    d_new = base["discount_rate"] if discount_rate is None else pd.Series(discount_rate, index=base.index)
    q_new = base["units"] * (1 + volume_change)
    gs_new = q_new * p_new
    da_new = gs_new * d_new
    cogs_new = q_new * c_new
    gp_base = base["gross_sales"] - base["discount_amount"] - base["cogs"]
    unit_profit_new = p_new * (1 - d_new) - c_new
    be_units = pd.Series(np.where(unit_profit_new > 0, gp_base / unit_profit_new.where(unit_profit_new > 0), np.inf),
                         index=base.index)

    baseline = _totals(base["units"].sum(), base["gross_sales"].sum(),
                       base["discount_amount"].sum(), base["cogs"].sum())
    scenario = _totals(q_new.sum(), gs_new.sum(), da_new.sum(), cogs_new.sum())
    change = {k: safe_divide(scenario[k] - baseline[k], baseline[k])
              for k in ["units", "net_revenue", "gross_profit"]}
    change["gross_margin_pts"] = scenario["gross_margin_pct"] - baseline["gross_margin_pct"]

    # portfolio break-even: units at the scenario's mix of prices needed to match baseline profit
    total_unit_profit = (unit_profit_new * base["units"]).sum() / base["units"].sum()
    portfolio_be = (np.inf if total_unit_profit <= 0
                    else (baseline["gross_profit"] / total_unit_profit))

    by_product = pd.DataFrame({
        "product_id": base["product_id"], "product_name": base["product_name"], "category": base["category"],
        "baseline_units": base["units"], "scenario_units": q_new,
        "baseline_net_revenue": base["gross_sales"] - base["discount_amount"],
        "scenario_net_revenue": gs_new - da_new,
        "baseline_gross_profit": gp_base, "scenario_gross_profit": gs_new - da_new - cogs_new,
        "breakeven_units": be_units})
    return {"baseline": baseline, "scenario": scenario, "change": change,
            "breakeven_units": portfolio_be, "by_product": by_product}

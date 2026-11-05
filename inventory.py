"""
inventory.py  -  Module E: Inventory decision support

BUSINESS QUESTIONS
    Which products may run out before new stock arrives?  When should we reorder,
    and how much?  Which products have far more stock than we need?

INPUT
    Sales history (from the sales file) and an inventory file with ONE row per product:
        product_id, current_stock (units, 0 or more), lead_time_days (above 0)
    The sales file has no stock levels or lead times, so these come from the inventory file.
    Stock is assumed to be as of the LAST sales date in the data.

FORMULAS (all per product)
    d   = average daily demand = units sold in the last N days / N        (N = demand window, default 90)
    s   = standard deviation of daily demand over the same window (days with no sales count as 0)
    L   = lead time in days
    days of stock          = current stock / d
    demand during lead time = d x L
    safety stock           = z x s x sqrt(L)       z from the target service level (95% -> z = 1.645)
    reorder point          = d x L + safety stock
    order-up-to level      = d x (L + cover days) + safety stock          (cover days default 30)
    suggested order        = order-up-to level - current stock, rounded up (only when stock <= reorder point)
    excess units           = current stock - d x excess threshold days     (default 90 days)
    excess value           = excess units x average unit cost (from the sales data)

STATUS RULES (checked in this order)
    No recent sales : d = 0, so days of stock cannot be calculated
    Stockout risk   : days of stock < lead time (stock ends before an order placed today could arrive)
    Reorder now     : current stock <= reorder point
    Excess stock    : days of stock > excess threshold
    OK              : none of the above

ASSUMPTIONS AND LIMITATIONS
    * Demand is assumed steady and roughly normal; trends, seasons and promotions are ignored.
    * Lead time is assumed fixed; suppliers that are late make safety stock too low.
    * Minimum order quantities, storage limits and supplier prices are ignored.
    * Safety stock uses only past variability. A new product with a short history is unreliable.
"""
from math import ceil, sqrt
from statistics import NormalDist

import numpy as np
import pandas as pd
from src.kpis import add_calculated_columns, safe_divide

REQUIRED_COLUMNS = ["product_id", "current_stock", "lead_time_days"]

NO_SALES, STOCKOUT, REORDER, EXCESS, OK, NO_INV = (
    "No recent sales", "Stockout risk", "Reorder now", "Excess stock", "OK", "No inventory data")


def validate_inventory(inv, sales_product_ids):
    """Check an inventory table. Returns (usable_rows, issues, missing_columns).

    Rows with errors are left out (never repaired). Line numbers count the header as line 1.
    """
    missing = [c for c in REQUIRED_COLUMNS if c not in inv.columns]
    if missing:
        return None, pd.DataFrame(), missing
    d = inv[REQUIRED_COLUMNS].copy()
    d["product_id"] = d["product_id"].astype("string").str.strip()
    stock = pd.to_numeric(d["current_stock"], errors="coerce")
    lead = pd.to_numeric(d["lead_time_days"], errors="coerce")
    known = set(sales_product_ids)

    checks = [
        ("Missing product_id", "ERROR", d["product_id"].isna() | (d["product_id"] == "")),
        ("Duplicate product_id (first row kept)", "ERROR", d["product_id"].notna() & d["product_id"].duplicated()),
        ("current_stock missing, not a number or negative", "ERROR", stock.isna() | (stock < 0)),
        ("lead_time_days missing, not a number or not above 0", "ERROR", lead.isna() | (lead <= 0)),
        ("Product not found in the sales data (ignored)", "WARNING",
         d["product_id"].notna() & ~d["product_id"].isin(known)),
    ]
    rows, bad = [], pd.Series(False, index=d.index)
    for name, sev, mask in checks:
        if mask.any():
            rows.append({"check": name, "severity": sev, "rows_affected": int(mask.sum()),
                         "example_line_numbers": ", ".join(str(i + 2) for i in d.index[mask][:5])})
        bad |= mask
    issues = pd.DataFrame(rows, columns=["check", "severity", "rows_affected", "example_line_numbers"])
    good = d[~bad].copy()
    good["current_stock"], good["lead_time_days"] = stock[~bad], lead[~bad]
    return good.reset_index(drop=True), issues, []


def demand_stats(df, window_days=90):
    """Average and standard deviation of DAILY units per product over the last window_days.

    The window ends on the last sales date. If the data is shorter than the window, the data span is used.
    Days with no sales count as 0 units.
    """
    d = df.copy()
    d["order_date"] = pd.to_datetime(d["order_date"]).dt.normalize()
    end = d["order_date"].max()
    start = max(end - pd.Timedelta(days=window_days - 1), d["order_date"].min())
    days = pd.date_range(start, end)
    w = d[(d["order_date"] >= start) & (d["order_date"] <= end)]
    daily = (w.pivot_table(index="order_date", columns="product_id", values="quantity", aggfunc="sum")
              .reindex(index=days, columns=sorted(d["product_id"].unique())).fillna(0))   # every product, even with no sales in the window
    out = pd.DataFrame({"product_id": daily.columns,
                        "avg_daily_demand": daily.mean().values,
                        "std_daily_demand": daily.std(ddof=1).fillna(0).values})
    out.attrs["days_used"], out.attrs["as_of"] = len(days), end
    return out


def analyze_inventory(df, inv, service_level=0.95, window_days=90, cover_days=30, excess_days=90):
    """One row per product with stock position, reorder point, suggested order and status."""
    if not 0.5 <= service_level < 1:
        raise ValueError("Service level must be from 50% up to (but not including) 100%.")
    if window_days < 7 or cover_days < 0 or excess_days <= 0:
        raise ValueError("Demand window must be at least 7 days; cover days cannot be negative; "
                         "excess threshold must be above 0.")
    z = NormalDist().inv_cdf(service_level)
    stats = demand_stats(df, window_days)
    sales = add_calculated_columns(df)
    prod = (sales.groupby(["product_id", "product_name", "category"], as_index=False)
                 .agg(units=("quantity", "sum"), cogs=("cogs", "sum")))
    prod["avg_unit_cost"] = prod["cogs"] / prod["units"]
    base = prod.merge(stats, on="product_id", how="left").merge(inv, on="product_id", how="left")

    rows = []
    for _, r in base.iterrows():
        rec = {"product_id": r["product_id"], "product_name": r["product_name"], "category": r["category"]}
        if pd.isna(r["current_stock"]):
            rec.update(status=NO_INV, reason="No usable inventory row for this product.")
            rows.append(rec)
            continue
        stock, L = float(r["current_stock"]), float(r["lead_time_days"])
        d, s = float(r["avg_daily_demand"]), float(r["std_daily_demand"])
        ss = z * s * sqrt(L)
        rop = d * L + ss
        up_to = d * (L + cover_days) + ss
        days_stock = stock / d if d > 0 else np.inf
        rec.update(current_stock=stock, lead_time_days=L, avg_daily_demand=d, std_daily_demand=s,
                   days_of_stock=days_stock, demand_during_lead_time=d * L, safety_stock=ss,
                   reorder_point=rop, order_up_to_level=up_to, suggested_order_qty=0,
                   shortfall_during_lead_time=max(0.0, d * L - stock), excess_units=0.0, excess_value=0.0)
        if d == 0:
            rec.update(status=NO_SALES, reason=f"No units sold in the last {stats.attrs['days_used']} days; "
                       f"{stock:,.0f} units in stock.")
        elif days_stock < L:
            rec.update(status=STOCKOUT, suggested_order_qty=ceil(up_to - stock),
                       reason=f"Stock lasts {days_stock:.1f} days but the lead time is {L:.0f} days: "
                              f"expected shortfall about {max(0.0, d * L - stock):,.0f} units even if ordered today.")
        elif stock <= rop:
            rec.update(status=REORDER, suggested_order_qty=ceil(up_to - stock),
                       reason=f"Stock {stock:,.0f} is at or below the reorder point {rop:,.0f} "
                              f"(demand in lead time {d * L:,.0f} + safety stock {ss:,.0f}).")
        elif days_stock > excess_days:
            ex = stock - d * excess_days
            rec.update(status=EXCESS, excess_units=ex, excess_value=ex * float(r["avg_unit_cost"]),
                       reason=f"Stock covers {days_stock:.0f} days of demand, above the {excess_days}-day threshold; "
                              f"about {ex:,.0f} units above that level.")
        else:
            rec.update(status=OK, reason=f"Stock covers {days_stock:.0f} days; above the reorder point {rop:,.0f}.")
        rows.append(rec)
    out = pd.DataFrame(rows)
    out.attrs.update(z=z, days_used=stats.attrs["days_used"], as_of=stats.attrs["as_of"])
    return out

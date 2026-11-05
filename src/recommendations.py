"""
recommendations.py  -  Module F: Prioritized decision recommendations

PURPOSE
    Turn the results of Modules C (segments), B (discounts) and E (inventory) into a short, ranked
    action list. Every recommendation is built from the uploaded or simulated data. Nothing is invented,
    and no result is promised: benefits are written as "up to about", "could" or "may".

EVERY RECOMMENDATION HAS SIX PARTS
    issue, evidence (with the KPI), action, expected_benefit, risks_assumptions, priority + priority_reason

PRIORITY RULES (fixed and visible, so they can be challenged)
    1. URGENT items are always High:   Stockout risk (sales are likely to be lost within days).
    2. Time-sensitive but not yet critical:  Reorder now = Medium.
    3. Everything with a profit estimate is ranked by its estimated GROSS PROFIT effect as a share of the
       total gross profit in the data:   5% or more = High,   1% to under 5% = Medium,   below 1% = Low.
    4. Cash-only items (excess stock) are never High because stock is not lost:
       Medium if the cash tied up is 1% or more of net revenue, otherwise Low.
    5. Items with no money estimate (low performers, promotion candidates) are Low.
    6. Data-quality problems: share of rows excluded: 5% or more = High, 1% to under 5% = Medium, else Low.
    Within one priority level, URGENT items (stockouts) come first, then larger estimated effect first.

CROSS-CHECKS (so recommendations do not contradict each other)
    * A product at Stockout risk or Reorder now is NEVER suggested for a promotion or a discount.
    * Excess stock: the advice differs by product depending on its discount verdict
      (do not discount where discounts reduce gross profit; a targeted test is possible where they pay off).

HOW THE MONEY ESTIMATES ARE MADE (all approximate, all from past data)
    Stockout:   expected shortfall units x gross profit per unit
    Thin margin: (portfolio margin - product margin) x product net revenue
    Discounts that reduce profit / pay off:  |profit change| x average monthly gross profit at full price x discounted months
    Declining sales: (units a year earlier - units now, same 6 months) x gross profit per unit
    Excess stock: excess units x average unit cost (cash, not profit)
"""
import numpy as np
import pandas as pd

from src.kpis import add_calculated_columns, summary_kpis
from src import segmentation as sg
from src import discounts as dc
from src import inventory as iv

COLUMNS = ["rank", "priority", "area", "subject", "issue", "evidence", "action",
           "expected_benefit", "risks_assumptions", "priority_reason", "est_impact"]
_ORDER = {"High": 0, "Medium": 1, "Low": 2}


def money(x):
    return f"${x:,.0f}"


def priority_from_share(share):
    """5% or more of total gross profit = High, 1% up to 5% = Medium, below 1% = Low."""
    if share >= 0.05:
        return "High"
    if share >= 0.01:
        return "Medium"
    return "Low"


def price_rise_to_reach_margin(net_price, unit_cost, target_margin):
    """Rise in net selling price (as a fraction) needed to reach target_margin, ignoring any loss of volume.
    Example: price 10, cost 8, target 40% -> needs a net price of 8 / 0.6 = 13.33, a rise of 33.3%."""
    return unit_cost / ((1 - target_margin) * net_price) - 1


def cost_cut_to_reach_margin(net_price, unit_cost, target_margin):
    """Fall in unit cost (as a fraction) needed to reach target_margin at the current net price.
    Example: price 10, cost 8, target 40% -> cost must be 6, a cut of 25%."""
    return 1 - net_price * (1 - target_margin) / unit_cost


def _names(rows, name_col, detail, top=3):
    parts = [f"{r[name_col]} ({detail(r)})" for _, r in rows.head(top).iterrows()]
    more = len(rows) - top
    return ", ".join(parts) + (f" and {more} more" if more > 0 else "")


def generate_recommendations(df, inventory_result=None, excluded_rows=0, total_rows=None,
                             simulated_inventory=False):
    """Return a DataFrame with one row per recommendation, sorted by priority then estimated effect.

    df: cleaned sales data. inventory_result: output of inventory.analyze_inventory (or None if there is no
    inventory data; then no inventory recommendations are made). excluded_rows / total_rows: rows removed by
    data cleaning. simulated_inventory: adds a warning to every inventory recommendation.
    """
    d = add_calculated_columns(df)
    kp = summary_kpis(d)
    total_gp, total_rev, port_margin = kp["gross_profit"], kp["net_revenue"], kp["gross_margin_pct"]
    seg = sg.segment_products(d).set_index("product_id")
    dis = dc.discount_effectiveness(d).set_index("product_id")
    seg["unit_gp"] = seg["gross_profit"] / seg["units_sold"]
    recs = []

    def add(priority, area, subject, issue, evidence, action, benefit, risks, reason, impact=np.nan):
        recs.append({"priority": priority, "area": area, "subject": subject, "issue": issue, "evidence": evidence,
                     "action": action, "expected_benefit": benefit, "risks_assumptions": risks,
                     "priority_reason": reason, "est_impact": impact})

    sim_note = " The inventory data is SIMULATED, so treat this as illustrative." if simulated_inventory else ""
    stock = inventory_result.set_index("product_id") if inventory_result is not None else None
    risky = set()                                   # products that must not get promotions or discounts
    if stock is not None:
        risky = set(stock.index[stock["status"].isin([iv.STOCKOUT, iv.REORDER])])

    # ---------- data quality ----------
    if excluded_rows and total_rows:
        share = excluded_rows / total_rows
        pr = "High" if share >= 0.05 else "Medium" if share >= 0.01 else "Low"
        add(pr, "Data quality", "Source data",
            "Some rows of the source data were rejected by the quality checks.",
            f"{excluded_rows:,} of {total_rows:,} rows ({share:.1%}) were excluded, so the results use less data than was uploaded.",
            "Ask the data owner to fix the rejected rows at the source and upload the corrected file.",
            "More complete data makes every number in this report more reliable.",
            "The rows were excluded, not repaired; the excluded rows could differ from the rest in ways that matter.",
            f"{share:.1%} of rows excluded (5% or more = High, 1% to under 5% = Medium, otherwise Low).")

    # ---------- inventory: stockout, reorder (one recommendation per product) ----------
    if stock is not None:
        for pid, r in stock[stock["status"] == iv.STOCKOUT].iterrows():
            ugp = seg.loc[pid, "unit_gp"]
            at_risk = r["shortfall_during_lead_time"] * ugp
            add("High", "Inventory", f"{r['product_name']} ({pid})",
                "Stock is likely to run out before new stock can arrive.",
                f"{r['current_stock']:,.0f} units cover {r['days_of_stock']:.1f} days, but the lead time is "
                f"{r['lead_time_days']:.0f} days. Average demand is {r['avg_daily_demand']:.1f} units per day; "
                f"expected shortfall about {r['shortfall_during_lead_time']:,.0f} units.",
                f"Order about {int(r['suggested_order_qty']):,} units now and ask the supplier about faster delivery. "
                "Until stock arrives, do not run promotions or discounts on this product.",
                f"Protects up to about {money(at_risk)} of gross profit ({r['shortfall_during_lead_time']:,.0f} units x "
                f"{money(ugp)} per unit) that could otherwise be lost.",
                "Assumes demand stays at its recent average and the lead time does not change. "
                "Check supplier minimum quantities and available cash." + sim_note,
                "Stock ends before an order placed today could arrive, so sales are likely to be lost within days.",
                at_risk)
        for pid, r in stock[stock["status"] == iv.REORDER].iterrows():
            add("Medium", "Inventory", f"{r['product_name']} ({pid})",
                "Stock has reached the reorder point.",
                f"{r['current_stock']:,.0f} units are at or below the reorder point of {r['reorder_point']:,.0f} "
                f"(demand during the {r['lead_time_days']:.0f}-day lead time plus safety stock). Stock covers {r['days_of_stock']:.1f} days.",
                f"Place an order of about {int(r['suggested_order_qty']):,} units.",
                "Keeps stock above the demand expected during the lead time, which avoids lost sales.",
                "Assumes steady demand and a fixed lead time; safety stock uses only past demand variability." + sim_note,
                "Stock still covers the lead time, but it is at or below the reorder point, so the order should not wait.")

    # ---------- thin margin (one per product) ----------
    for pid, r in seg[seg["flags"].str.contains("Price/cost review", na=False)].iterrows():
        net_p, unit_c = r["net_revenue"] / r["units_sold"], r["cogs"] / r["units_sold"]
        gap = max(0.0, port_margin - r["gross_margin_pct"])
        impact = gap * r["net_revenue"]
        share = impact / total_gp
        add(priority_from_share(share), "Pricing and cost", f"{r['product_name']} ({pid})",
            "The product sells in volume but earns a thin margin.",
            f"Gross margin {r['gross_margin_pct']:.1%} against {port_margin:.1%} for the whole portfolio; net revenue "
            f"{money(r['net_revenue'])} ({r['revenue_share']:.1%} of total); average discount {r['avg_discount_rate']:.1%}.",
            f"Review the price and the supplier cost. Reaching the portfolio margin would need about "
            f"{price_rise_to_reach_margin(net_p, unit_c, port_margin):+.0%} on the net price, or about "
            f"{-cost_cut_to_reach_margin(net_p, unit_c, port_margin):+.0%} on the unit cost. Test options in the Simulator.",
            f"If the margin reached the portfolio average at the same revenue, gross profit could rise by up to about {money(impact)}.",
            "A price rise may lose customers (the Simulator shows the volume you must keep). Cost cuts depend on suppliers. "
            "The estimate ignores volume changes.",
            f"Estimated effect is {share:.1%} of total gross profit.", impact)

    # ---------- discounts that reduce profit (grouped) ----------
    dd = dis.join(seg[["product_name", "unit_gp"]], how="left", rsuffix="_s")
    dd["est"] = (dd["gross_profit_change_pct"] * dd["avg_gross_profit_full_price"] * dd["months_discounted"])
    bad = dd[(dd["verdict"] == "Discounts reduce gross profit") & (dd["est"] < 0)].copy()
    bad["loss"] = -bad["est"]
    bad = bad.sort_values("loss", ascending=False).reset_index()
    if not bad.empty:
        loss = bad["loss"].sum()
        share = loss / total_gp
        add(priority_from_share(share), "Discounts", f"{len(bad)} products",
            "Discounts are reducing gross profit on these products.",
            f"{len(bad)} of {len(dis)} products earned less gross profit in discounted months than in full-price months. "
            f"Largest: {_names(bad, 'product_name', lambda r: f'{r.gross_profit_change_pct:+.0%} profit, discount {r.avg_discount_when_discounted:.0%}')}. "
            f"Together about {money(loss)} less gross profit in the discounted months ({share:.1%} of total gross profit).",
            "Stop or sharply reduce discounts on these products, starting with the largest losses, and compare a full-price "
            "test period with the past. Do not use discounts to clear excess stock of these products.",
            f"Could recover up to about {money(loss)} of gross profit if the same units sold at full price.",
            "This compares past months and shows a link, not proof of cause. Volume could fall more than the past suggests; "
            "competitor prices are not considered.",
            f"Estimated effect is {share:.1%} of total gross profit.", loss)

    # ---------- discounts that pay off (grouped, never for products at stock risk) ----------
    good = dd[(dd["verdict"] == "Discounts pay off") & (dd["est"] > 0) & (~dd.index.isin(risky))].copy()
    good = good.sort_values("est", ascending=False).reset_index()
    if not good.empty:
        gain = good["est"].sum()
        share = gain / total_gp
        add(priority_from_share(share), "Discounts", f"{len(good)} products",
            "Discounts are paying off on these products; they are an opportunity.",
            f"{len(good)} products earned more gross profit in discounted months. "
            f"Best: {_names(good, 'product_name', lambda r: f'{r.gross_profit_change_pct:+.0%} profit at about {r.avg_discount_when_discounted:.0%} discount')}. "
            f"The volume increase beat the break-even level.",
            "Keep targeted discounts on these products in the range already used, and track units and gross profit for each campaign.",
            f"Could keep up to about {money(gain)} of extra gross profit seen in past discounted months ({share:.1%} of total gross profit).",
            "A link, not proof of cause. Larger discounts than those observed are untested. Check stock before each campaign.",
            f"Estimated effect is {share:.1%} of total gross profit.", gain)

    # ---------- declining sales (grouped) ----------
    dec = seg[seg["flags"].str.contains("Declining sales", na=False)].copy()
    dec["lost"] = (dec["units_prior_year"] - dec["units_recent"]) * dec["unit_gp"]
    dec = dec[dec["lost"] > 0].sort_values("lost", ascending=False).reset_index()
    if not dec.empty:
        lost = dec["lost"].sum()
        share = lost / total_gp
        add(priority_from_share(share), "Sales trend", f"{len(dec)} products",
            "Unit sales of these products are falling compared with a year earlier.",
            f"{len(dec)} products sold at least 15% fewer units in the latest 6 months than in the same months a year earlier. "
            f"Largest drops: {_names(dec, 'product_name', lambda r: f'{r.trend_pct:+.0%} units')}.",
            "Find the cause before changing price or discounts: stock availability, competitor prices, product listing, or seasonality. "
            "Do not reorder more stock until the cause is known.",
            f"Returning to last year's level for the same 6 months would be worth about {money(lost)} of gross profit ({share:.1%} of the total).",
            "The cause is unknown. A 6-month against 6-month comparison can reflect seasons or one-off events.",
            f"Estimated effect is {share:.1%} of total gross profit.", lost)

    # ---------- excess stock (grouped) ----------
    if stock is not None:
        ex = stock[stock["status"] == iv.EXCESS].sort_values("excess_value", ascending=False)
        if not ex.empty:
            cash = ex["excess_value"].sum()
            share = cash / total_rev
            lines = []
            for pid, r in ex.head(3).iterrows():
                v = dis["verdict"].get(pid, "")
                hint = ("no discounts (they reduce profit here)" if v == "Discounts reduce gross profit"
                        else "a small targeted discount test is possible (discounts pay off here)" if v == "Discounts pay off"
                        else "discount effect is unclear")
                lines.append(f"{r['product_name']}: {r['days_of_stock']:.0f} days of stock, about {money(r['excess_value'])} above the threshold; {hint}")
            add("Medium" if share >= 0.01 else "Low", "Inventory", f"{len(ex)} products",
                "Stock is far above what is needed.",
                f"{len(ex)} products hold more stock than the excess threshold. About {money(cash)} (at cost) is tied up above it, "
                f"{share:.1%} of net revenue. " + "; ".join(lines) + ".",
                "Pause reordering these products until days of stock fall below the threshold, and sell down slowly. "
                "Use discounts only where the discount analysis shows they pay off.",
                f"Frees up to about {money(cash)} of cash over time (not a profit gain).",
                "Assumes demand stays at its recent level. Excess stock is not lost stock. Storage and supplier terms are not in the data." + sim_note,
                f"Cash tied up is {share:.1%} of net revenue (1% or more = Medium, otherwise Low); excess stock is never High because it is not lost.", cash)

    # ---------- low performers (grouped) ----------
    low = seg[seg["segment"] == sg.LOW].sort_values("net_revenue", ascending=False).reset_index()
    if not low.empty:
        add("Low", "Product range", f"{len(low)} products",
            "Several products have low revenue and below-average margin.",
            f"{len(low)} products are Low performers: together {money(low['net_revenue'].sum())} net revenue "
            f"({low['revenue_share'].sum():.1%} of total) and {money(low['gross_profit'].sum())} gross profit ({low['profit_share'].sum():.1%}). "
            f"Largest: {_names(low, 'product_name', lambda r: f'{r.gross_margin_pct:.0%} margin')}.",
            "Review each one: reprice, reduce stock levels, or consider removing it from the range. Avoid new large orders meanwhile.",
            "Frees up money, storage and attention for products that earn more.",
            "Some may support sales of other products or be new; the data cannot show that.",
            "No reliable money estimate and a small share of profit, so Low.")

    # ---------- promotion candidates (grouped, cross-checked) ----------
    promo = seg[seg["flags"].str.contains("Promotion candidate", na=False)].reset_index()
    kept = promo[~promo["product_id"].isin(risky)]
    held = promo[promo["product_id"].isin(risky)]
    if not kept.empty:
        names = ", ".join(f"{r.product_name} ({dis['verdict'].get(r.product_id, 'n/a').lower()})" for r in kept.itertuples())
        held_txt = (" Left out because of stock risk: " + ", ".join(held["product_name"]) + ".") if not held.empty else ""
        add("Low", "Promotion", f"{len(kept)} products",
            "Healthy-margin products with modest sales could grow with a promotion.",
            f"Niche products with healthy margin and stable sales: {names}.{held_txt}",
            "Try a small, time-limited promotion or better visibility on one or two of them, and track units and gross profit. "
            "Where discounts reduce profit, prefer non-price promotion such as featuring or bundling.",
            "May lift sales of products that already earn a healthy margin.",
            "No evidence yet that promotion works for these products. Check stock first." + sim_note,
            "No reliable money estimate, so Low.")

    out = pd.DataFrame(recs, columns=COLUMNS[1:])
    if out.empty:
        out.insert(0, "rank", pd.Series(dtype=int))
        return out
    out["_p"] = out["priority"].map(_ORDER)
    out["_u"] = (out["issue"] != "Stock is likely to run out before new stock can arrive.").astype(int)   # 0 = urgent
    out["_i"] = out["est_impact"].fillna(-1)
    out = out.sort_values(["_p", "_u", "_i", "subject"], ascending=[True, True, False, True]).drop(columns=["_p", "_u", "_i"])
    out.insert(0, "rank", range(1, len(out) + 1))
    return out.reset_index(drop=True)

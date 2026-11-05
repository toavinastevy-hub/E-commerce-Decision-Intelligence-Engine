"""
summary.py  -  Module G (part): executive summary of key findings and a downloadable report

PURPOSE
    Give a manager the five-minute view: the headline numbers, the most important findings written in
    plain sentences, and the top recommended actions. Every sentence is built from the data with a
    fixed template. Nothing is invented and no result is promised.

FINDINGS (each has a headline and a detail sentence)
    1. Performance  : net revenue, gross profit, margin and orders over the whole period
    2. Growth       : net revenue and gross profit of the latest 6 months against the same 6 months
                      a year earlier (needs at least 18 months of history, otherwise says so)
    3. Categories   : largest category by revenue, highest and lowest margin category
    4. Concentration: share of gross profit from the top 3 products, and how many make up half of it
    5. Discounts    : money given away and how many products lose gross profit in discounted months
    6. Margin pressure : products with a gross margin below 20%
    7. Inventory    : stockout risks and excess stock (only if inventory data is available)

LIMITATIONS
    * Gross profit is before fixed costs, shipping, marketing and tax.
    * "Latest 6 months" uses calendar months; the last month may be incomplete.
"""
import pandas as pd

from src.kpis import add_calculated_columns, summary_kpis, kpis_by, kpis_by_month, safe_divide
from src import segmentation as sg
from src import discounts as dc
from src import inventory as iv


def _money(x):
    return f"${x:,.0f}"


def _change(new, old):
    return safe_divide(new - old, old)


def _plural(n, one, many):
    return f"{n} {one if n == 1 else many}"


def _names(items, top=3):
    items = list(items)
    more = len(items) - top
    return ", ".join(items[:top]) + (f" and {more} more" if more > 0 else "")


def key_findings(df, inventory_result=None):
    """Return a list of {"headline", "detail"} dictionaries, most important first."""
    d = add_calculated_columns(df)
    s = summary_kpis(d)
    start, end = pd.to_datetime(d["order_date"]).min(), pd.to_datetime(d["order_date"]).max()
    out = []

    out.append({"headline": f"Performance, {start:%b %Y} to {end:%b %Y}",
                "detail": f"Net revenue {_money(s['net_revenue'])} and gross profit {_money(s['gross_profit'])} "
                          f"(gross margin {s['gross_margin_pct']:.1%}) from {s['orders']:,} orders. "
                          "Gross profit is before fixed costs, shipping, marketing and tax."})

    monthly = kpis_by_month(d)
    if len(monthly) >= 18:
        new, old = monthly.iloc[-6:], monthly.iloc[-18:-12]
        r = _change(new["net_revenue"].sum(), old["net_revenue"].sum())
        g = _change(new["gross_profit"].sum(), old["gross_profit"].sum())
        out.append({"headline": "Growth: latest 6 months against the same months a year earlier",
                    "detail": f"Net revenue {r:+.1%} ({_money(old['net_revenue'].sum())} to {_money(new['net_revenue'].sum())}) "
                              f"and gross profit {g:+.1%} ({_money(old['gross_profit'].sum())} to {_money(new['gross_profit'].sum())}). "
                              f"Compared: {new['month'].iloc[0]} to {new['month'].iloc[-1]} against "
                              f"{old['month'].iloc[0]} to {old['month'].iloc[-1]}. The latest month may be incomplete."})
    else:
        out.append({"headline": "Growth: not enough history",
                    "detail": f"The data covers {len(monthly)} months; a year-on-year comparison needs at least 18."})

    cat = kpis_by(d, "category")
    if len(cat) >= 1:
        top = cat.sort_values("net_revenue", ascending=False).iloc[0]
        hi, lo = cat.sort_values("gross_margin_pct").iloc[-1], cat.sort_values("gross_margin_pct").iloc[0]
        txt = (f"{top['category']} is the largest category with {top['net_revenue'] / s['net_revenue']:.1%} of net revenue. ")
        if len(cat) > 1:
            txt += (f"Highest margin: {hi['category']} ({hi['gross_margin_pct']:.1%}); "
                    f"lowest margin: {lo['category']} ({lo['gross_margin_pct']:.1%}).")
        out.append({"headline": "Categories", "detail": txt.strip()})

    prod = kpis_by(d, "product_name").sort_values("gross_profit", ascending=False)
    cum = prod["gross_profit"].cumsum() / prod["gross_profit"].sum()
    n_half = int((cum < 0.5).sum()) + 1
    if len(prod) > 3:
        top = prod.head(3)
        lead = f"The top 3 products ({_names(top['product_name'])}) earn {top['gross_profit'].sum() / s['gross_profit']:.1%} of gross profit."
    else:
        first = prod.iloc[0]
        lead = f"{first['product_name']} alone earns {first['gross_profit'] / s['gross_profit']:.1%} of gross profit."
    out.append({"headline": "Concentration of profit",
                "detail": f"{lead} {n_half} of {len(prod)} products make up half of it."})

    dis = dc.discount_effectiveness(d)
    bad = int((dis["verdict"] == "Discounts reduce gross profit").sum())
    good = int((dis["verdict"] == "Discounts pay off").sum())
    out.append({"headline": "Discounts",
                "detail": f"{_money(s['discount_amount'])} was given as discounts, {safe_divide(s['discount_amount'], s['gross_sales']):.1%} of gross sales. "
                          f"Of {len(dis)} products, {bad} earned less gross profit in discounted months and {good} earned more "
                          "(a link in past data, not proof of cause)."})

    seg = sg.segment_products(d)
    thin = seg[seg["flags"].str.contains("Price/cost review", na=False)].sort_values("net_revenue", ascending=False)
    if not thin.empty:
        out.append({"headline": "Margin pressure",
                    "detail": f"{len(thin)} products have a gross margin below 20%: "
                              f"{_names(f'{r.product_name} ({r.gross_margin_pct:.1%})' for r in thin.itertuples())}. "
                              f"Together they bring {thin['revenue_share'].sum():.1%} of net revenue."})

    if inventory_result is not None:
        st = inventory_result["status"].value_counts()
        so = inventory_result[inventory_result["status"] == iv.STOCKOUT]
        ex = inventory_result[inventory_result["status"] == iv.EXCESS]
        parts = []
        if len(so):
            parts.append(f"{_plural(len(so), 'product', 'products')} may run out before new stock arrives ({_names(so['product_name'])})")
        if int(st.get(iv.REORDER, 0)):
            parts.append(f"{_plural(int(st[iv.REORDER]), 'product is', 'products are')} at the reorder point")
        if len(ex):
            parts.append(f"{_plural(len(ex), 'product holds', 'products hold')} excess stock ({_names(ex['product_name'])}), "
                         f"about {_money(ex['excess_value'].sum())} at cost above the threshold")
        out.append({"headline": "Inventory",
                    "detail": ("; ".join(parts) + "." if parts else "No stockout, reorder or excess alerts at the current assumptions.")})
    return out


def executive_markdown(df, findings, recs, data_label="", simulated=False, top_actions=5):
    """A one-page report in Markdown: headline numbers, findings and the top actions."""
    s = summary_kpis(add_calculated_columns(df))
    lines = ["# Executive summary", ""]
    if data_label:
        lines.append(f"Data: {data_label}")
    if simulated:
        lines += ["", "**Important: this report uses SIMULATED data. It shows how the tool works; the numbers are not real.**"]
    lines += ["", "## Headline numbers", "",
              "| Measure | Value |", "|---|---|",
              f"| Net revenue | {_money(s['net_revenue'])} |",
              f"| Gross profit | {_money(s['gross_profit'])} |",
              f"| Gross margin | {s['gross_margin_pct']:.1%} |",
              f"| Orders | {s['orders']:,} |",
              f"| Units sold | {s['units_sold']:,} |",
              f"| Average discount rate | {s['avg_discount_rate']:.1%} |",
              "", "## Key findings", ""]
    for i, f in enumerate(findings, 1):
        lines.append(f"{i}. **{f['headline']}.** {f['detail']}")
    lines += ["", f"## Top {min(top_actions, len(recs))} recommended actions", ""]
    for _, r in recs.head(top_actions).iterrows():
        lines += [f"{r['rank']}. **[{r['priority']}] {r['area']}: {r['subject']}.** {r['issue']} "
                  f"Action: {r['action']} Benefit: {r['expected_benefit']}"]
    lines += ["", "## Limitations", "",
              "- Gross profit excludes fixed costs, shipping, marketing and tax.",
              "- Benefits are estimates from past data, not promises.",
              "- Discount results show a link between discounts and profit, not proof of cause."]
    return "\n".join(lines) + "\n"

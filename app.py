"""
app.py  -  E-commerce Decision Intelligence Engine (EDIE), version 0.6

Run from the project folder with:   streamlit run app.py

Screens in this version:
    Data       load demo or uploaded data, quality report, confirm rows to use
    Executive summary  one-page view: KPIs, key findings, top actions, inventory alerts, report download
    Dashboard  KPIs, trends, category/product comparison, profitability, filters
    Products   product segments (with the rule for each), flags, filters
    Discounts  do discounts pay off? break-even calculator
    Simulator  what-if: price, discount, cost, volume (volume is an assumption)
    Inventory  days of stock, reorder points, stockout and excess alerts
    Recommendations  ranked action list (issue, evidence, action, benefit, risks, priority)
All calculations come from the tested modules in the src folder.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from src import data_quality as dq          # noqa: E402
from src import kpis                        # noqa: E402
from src import segmentation as seg        # noqa: E402
from src import discounts as disc          # noqa: E402
from src import simulator as sim           # noqa: E402
from src import inventory as inv           # noqa: E402
from src import recommendations as rec     # noqa: E402
from src import summary as summ            # noqa: E402
from src import excel_io                   # noqa: E402

st.set_page_config(page_title="EDIE - Decision Intelligence Engine", page_icon="📊", layout="wide")

# ---------- look and feel ----------
THEME_CSS = """
<style>
.block-container {padding-top: 1.4rem; max-width: 1250px;}
[data-testid="stSidebar"] {background: #F1F2FB;}
[data-testid="stMetric"] {background: #FFFFFF; border: 1px solid #E5E7EB; border-left: 6px solid #4F46E5;
    border-radius: 14px; padding: 14px 16px; box-shadow: 0 2px 6px rgba(79,70,229,.08);}
[data-testid="stMetricLabel"] p {font-weight: 600; color: #4B5563;}
[data-testid="stMetricValue"] {color: #111827;}
.hero {background: linear-gradient(120deg, #4F46E5 0%, #7C3AED 55%, #DB2777 125%); color: #FFFFFF;
    padding: 26px 32px; border-radius: 18px; margin: 0 0 16px 0; box-shadow: 0 6px 18px rgba(79,70,229,.25);}
.hero h1 {color: #FFFFFF; margin: 0; padding: 0; font-size: 2.1rem; line-height: 1.2;}
.hero p {color: #EEF2FF; margin: 8px 0 0 0; font-size: 1.08rem;}
.tip {background: #EEF2FF; border-left: 6px solid #4F46E5; padding: 12px 18px; border-radius: 12px;
    color: #1F2937; margin: 4px 0 16px 0; font-size: 1.0rem;}
.sim {background: #FEF3C7; border-left: 6px solid #F59E0B; padding: 10px 16px; border-radius: 12px;
    color: #78350F; margin: 4px 0 12px 0;}
h2, h3 {color: #1F2937;}
div.stButton > button[kind="primary"] {border-radius: 12px; font-weight: 700; padding: 0.6rem 1.2rem;}
div.stButton > button {border-radius: 10px;}
details {border-radius: 12px !important;}
</style>
"""
st.markdown(THEME_CSS, unsafe_allow_html=True)
px.defaults.template = "plotly_white"
px.defaults.color_discrete_sequence = ["#4F46E5", "#EC4899", "#10B981", "#F59E0B", "#06B6D4", "#8B5CF6", "#EF4444", "#64748B"]


def hero(title, subtitle, icon=""):
    """Coloured banner at the top of every page."""
    st.markdown(f'<div class="hero"><h1>{icon} {title}</h1><p>{subtitle}</p></div>', unsafe_allow_html=True)


def tip(text, label="In plain words"):
    st.markdown(f'<div class="tip"><b>{label}:</b> {text}</div>', unsafe_allow_html=True)


# Technical words are translated into everyday language wherever text comes from the analysis modules.
_PLAIN = [
    ("Gross profit is before fixed costs, shipping, marketing and tax.",
     "Profit before overheads means sales after discounts minus the cost of the products sold; rent, staff, shipping, advertising and tax are not included."),
    ("net revenue", "sales after discounts"), ("Net revenue", "Sales after discounts"),
    ("gross profit", "profit before overheads"), ("Gross profit", "Profit before overheads"),
    ("gross margin", "profit margin"), ("Gross margin", "Profit margin"),
    ("gross sales", "sales before discounts"), ("Gross sales", "Sales before discounts"),
    ("product cost", "product cost"), ("lead time", "delivery time"), ("Lead time", "Delivery time"),
    ("reorder point", "reorder level"), ("Reorder point", "Reorder level"),
    ("safety stock", "safety stock (extra buffer)"), ("Safety stock", "Safety stock (extra buffer)"),
    ("KPI", "key number"), ("units", "items"), ("sells in volume", "sells in large quantities"),
]


def plain(text):
    """Replace technical terms by everyday words (display only; the calculations are not touched)."""
    if not isinstance(text, str):
        return text
    for a, b in _PLAIN:
        text = text.replace(a, b)
    return text


def plain_df(df):
    out = df.copy()
    for c in out.columns:
        if out[c].dtype == object or str(out[c].dtype).startswith("str"):
            out[c] = out[c].map(plain)
    return out


HELP = {
    "Sales after discounts": "Money received from customers after discounts are taken off.",
    "Profit before overheads": "Sales after discounts minus what the products cost you. Rent, staff, shipping, advertising and tax are NOT included, so your real final profit is lower.",
    "Profit margin": "How many cents you keep from each $1 of sales, before overheads.",
    "Orders": "Number of separate customer orders.",
    "Items sold": "Total number of items sold.",
    "Average order size": "Average amount spent per order, after discounts.",
    "Discounts given": "Total money given away as discounts.",
    "Average discount": "Discounts as a share of sales before discounts.",
}
EXPLAIN = {
    "Star": "Sells a lot AND keeps a good profit. Protect these products.",
    "Core volume": "Sells a lot and keeps a fair profit. The steady base of the business.",
    "Busy but thin": "Sells a lot but keeps very little profit per item. Check the price and the cost.",
    "Niche": "Sells less, but keeps a good profit per item. May grow with some promotion.",
    "Low performer": "Sells little and keeps little profit. Review whether to keep it.",
    "Discounts pay off": "Products that made MORE profit in discounted months than in full-price months.",
    "No clear gain from discounts": "Discounts did not clearly help or hurt.",
    "Discounts reduce profit": "Products that made LESS profit in discounted months. The extra sales did not make up for the lower price.",
    "Not enough data": "Too few months with and without discounts to compare fairly.",
    "Stockout risk": "Stock will run out before a new order could arrive. Act now.",
    "Reorder now": "Stock has reached the level where you should place an order.",
    "Excess stock": "Much more stock than you need. Money is tied up in the warehouse.",
    "OK": "Stock level looks healthy.",
    "High": "Do first.",
    "Medium": "Do soon.",
    "Low": "Do when you have time.",
}
VERDICT_LABEL = {"Discounts reduce gross profit": "Discounts reduce profit"}

GLOSSARY = """
**Sales after discounts**: money you receive after discounts are taken off.

**Profit before overheads**: sales after discounts minus the cost of the products. Rent, staff, shipping, advertising and tax are not included.

**Profit margin**: cents of profit you keep from each $1 of sales.

**Delivery time**: days between placing an order with your supplier and receiving the goods.

**Days of stock**: how many days your stock lasts at the recent selling speed.

**Reorder level**: the stock level at which you should order more.

**Safety stock**: an extra buffer in case sales are higher than usual.

**Break-even**: the extra sales needed so a discount earns the same profit as full price.

**Simulated data**: made-up data used for the demo. It is not a real business.
"""


# ---------- small helpers ----------
def money(x):
    return "n/a" if pd.isna(x) else f"${x:,.0f}"


def pct(x):
    return "n/a" if pd.isna(x) else f"{x:.1%}"


def load_into_state(df, label, is_simulated):
    """Store a freshly loaded file and clear any earlier confirmed analysis."""
    st.session_state["raw_df"] = df
    st.session_state["source_label"] = label
    st.session_state["is_simulated"] = is_simulated
    st.session_state["analysis_df"] = None
    st.session_state["excluded_df"] = None


def read_demo(filename):
    return pd.read_csv(ROOT / "data" / filename, dtype={"order_id": str, "product_id": str})


for key in ["raw_df", "analysis_df", "excluded_df", "source_label", "is_simulated",
            "inv_raw", "inv_label", "inv_simulated"]:
    st.session_state.setdefault(key, None)

# ---------- sidebar navigation ----------
PAGES = {"Data": "🏁  Start here", "Executive summary": "📊  The big picture", "Dashboard": "📈  Explore your sales",
         "Products": "🏷️  Your products", "Discounts": "💸  Do discounts pay off?", "Simulator": "🧪  Try a price change",
         "Inventory": "📦  Stock check", "Recommendations": "✅  What to do next"}
st.sidebar.markdown("## 📊 EDIE")
st.sidebar.caption("Decision Intelligence Engine for online shops")
page = st.sidebar.radio("Where do you want to go?", list(PAGES), format_func=lambda k: PAGES[k], key="page")
with st.sidebar.expander("📖 Words explained"):
    st.markdown(GLOSSARY)
st.sidebar.caption("The demo uses made-up (simulated) data.")


# =====================================================================
# PAGE 1: DATA
# =====================================================================
def quick_start():
    """One click: load the clean demo data, confirm it, load the demo stock file, open the big picture."""
    df = read_demo("sales.csv")
    load_into_state(df, "SIMULATED demo data (clean)", True)
    report = dq.check_data_quality(df)
    valid, excluded = dq.split_valid_rows(df, report)
    st.session_state["analysis_df"], st.session_state["excluded_df"] = valid, excluded
    st.session_state["inv_raw"] = pd.read_csv(ROOT / "data" / "inventory.csv", dtype={"product_id": str})
    st.session_state["inv_label"], st.session_state["inv_simulated"] = "SIMULATED demo inventory", True
    st.session_state["page"] = "Executive summary"


def page_data():
    hero("Start here", "Choose your sales data. We check it for mistakes before we use it, so you can trust the results.", "🏁")
    tip("New here? Click the big button. It loads made-up demo data and takes you straight to the results. "
        "You can also upload your own file below.", "Quick start")
    st.button("🚀  Try the demo in one click", type="primary", key="btn_quickstart", on_click=quick_start)
    st.markdown("---")
    st.subheader("Or choose your own data")

    with st.expander("Required file format (data dictionary)"):
        st.table(pd.DataFrame({
            "Column": dq.REQUIRED_COLUMNS,
            "Meaning": ["Order number (an order may have several rows)", "Order date, YYYY-MM-DD",
                        "Product code", "Product name", "Product category",
                        "Items sold (whole number, 1 or more)", "Price per unit before discount (above 0)",
                        "Discount as a fraction: 0.10 = 10% (0 to 1)", "Cost per unit (0 or more)"]}))

    c1, c2 = st.columns(2)
    if c1.button("Use clean demo data (SIMULATED)", key="btn_demo_clean"):
        load_into_state(read_demo("sales.csv"), "SIMULATED demo data (clean)", True)
    if c2.button("Use demo data with deliberate errors (SIMULATED)", key="btn_demo_dirty"):
        load_into_state(read_demo("sales_dirty.csv"), "SIMULATED demo data with planted errors", True)

    template = ROOT / "templates" / "EDIE_data_template.xlsx"
    if template.exists():
        st.write("No file ready? Download the Excel template, fill it in (it checks your entries as you type), then upload it here.")
        st.download_button("📥  Download the Excel template", template.read_bytes(), file_name=template.name,
                           mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", key="btn_download_template")
    uploaded = st.file_uploader("Upload your sales file: the filled Excel template (.xlsx) or a CSV", type=["xlsx", "csv"], key="uploader")
    if uploaded is not None and st.session_state["source_label"] != f"Uploaded file: {uploaded.name}":
        try:
            stock = None
            if uploaded.name.lower().endswith(".xlsx"):
                df = excel_io.read_sales_workbook(uploaded)
                stock = excel_io.read_inventory_workbook(uploaded)
            else:
                df = pd.read_csv(uploaded, dtype={"order_id": str, "product_id": str})
            load_into_state(df, f"Uploaded file: {uploaded.name}", False)
            if stock is not None:                                   # the workbook also had stock levels
                st.session_state["inv_raw"] = stock
                st.session_state["inv_label"], st.session_state["inv_simulated"] = f"Uploaded workbook: {uploaded.name} (Inventory sheet)", False
                st.info(f"The Inventory sheet was loaded too ({len(stock):,} rows). The Stock check page will use it.")
            elif st.session_state["inv_simulated"]:                  # never mix real sales with demo stock
                st.session_state["inv_raw"], st.session_state["inv_label"], st.session_state["inv_simulated"] = None, None, False
        except Exception as exc:                                     # unreadable or empty file
            st.error(f"The file could not be read: {exc}")

    raw = st.session_state["raw_df"]
    if raw is None:
        st.info("Choose demo data or upload a file to begin.")
        return

    if st.session_state["is_simulated"]:
        st.warning("This is SIMULATED data created for demonstration. It is not real business data.")
    st.subheader("Data quality report")
    st.caption(f"Source: {st.session_state['source_label']}")

    report = dq.check_data_quality(raw)
    if not report.ok_to_proceed:
        st.error("Required columns are missing: " + ", ".join(report.missing_columns)
                 + ". Please fix the file and upload it again.")
        return

    m1, m2, m3 = st.columns(3)
    m1.metric("Rows in file", f"{report.n_rows:,}")
    m2.metric("Rows with errors", f"{report.n_error_rows:,}")
    m3.metric("Rows usable", f"{report.n_rows - report.n_error_rows:,}")

    if report.issues.empty:
        st.success("No problems found.")
    else:
        shown = report.issues.rename(columns={
            "check": "Check", "severity": "Severity", "rows_affected": "Rows affected",
            "example_row_numbers": "Example line numbers in file", "impact": "How it can affect the analysis"})
        st.dataframe(shown, hide_index=True)
        st.caption("ERROR = the row cannot be used. WARNING = the row is kept, but review it. "
                   "Nothing is changed or filled in automatically.")

    if report.n_error_rows > 0:
        st.warning(f"{report.n_error_rows:,} rows with errors will be LEFT OUT of all calculations, "
                   "so totals will be lower than the raw file suggests. The original rows are kept "
                   "and can be downloaded below. Fix them in the source system if they matter.")
        excluded = raw[report.error_mask]
        st.download_button("Download the excluded rows (CSV)", excluded.to_csv(index=False),
                           file_name="excluded_rows.csv", mime="text/csv", key="btn_download_excluded")

    if st.button("Use this data for analysis", type="primary", key="btn_confirm"):
        valid, excluded = dq.split_valid_rows(raw, report)
        if valid.empty:
            st.error("No usable rows are left after removing errors. Please fix the file.")
        else:
            st.session_state["analysis_df"] = valid
            st.session_state["excluded_df"] = excluded
    if st.session_state["analysis_df"] is not None:
        st.success(f"Data confirmed: {len(st.session_state['analysis_df']):,} rows used, "
                   f"{len(st.session_state['excluded_df']):,} rows excluded. Next: open 'The big picture' in the left menu.")


# =====================================================================
# PAGE 2: DASHBOARD
# =====================================================================
def page_dashboard():
    hero("Explore your sales", "See how sales and profit change over time, by category and by product. Use the filters on the left.", "📈")
    df = st.session_state["analysis_df"]
    if df is None:
        st.info("No data confirmed yet. Go to the Data page and click 'Use this data for analysis'.")
        return

    banner = st.session_state["source_label"]
    if st.session_state["is_simulated"]:
        banner = "SIMULATED data - " + banner
    st.caption(f"{banner} | {len(df):,} rows used | {len(st.session_state['excluded_df']):,} rows excluded for errors")

    # ----- filters -----
    st.sidebar.subheader("Filters")
    dmin, dmax = df["order_date"].min().date(), df["order_date"].max().date()
    date_range = st.sidebar.date_input("Order dates", (dmin, dmax), min_value=dmin, max_value=dmax, key="f_dates")
    cats = sorted(df["category"].dropna().unique())
    sel_cats = st.sidebar.multiselect("Categories", cats, default=cats, key="f_cats")

    if not (isinstance(date_range, (tuple, list)) and len(date_range) == 2):
        st.info("Select both a start and an end date in the sidebar.")
        return
    start, end = pd.Timestamp(date_range[0]), pd.Timestamp(date_range[1])
    f = df[(df["order_date"] >= start) & (df["order_date"] <= end) & (df["category"].isin(sel_cats))]
    if f.empty:
        st.warning("No data matches these filters. Widen the date range or select more categories.")
        return
    f = kpis.add_calculated_columns(f)
    s = kpis.summary_kpis(f)

    # ----- KPI cards -----
    a = st.columns(4)
    a[0].metric("Sales after discounts", money(s["net_revenue"]), help=HELP["Sales after discounts"])
    a[1].metric("Profit before overheads", money(s["gross_profit"]), help=HELP["Profit before overheads"])
    a[2].metric("Profit margin", pct(s["gross_margin_pct"]), help=HELP["Profit margin"])
    a[3].metric("Orders", f"{s['orders']:,}", help=HELP["Orders"])
    b = st.columns(4)
    b[0].metric("Items sold", f"{s['units_sold']:,}", help=HELP["Items sold"])
    b[1].metric("Average order size", money(s["avg_order_value"]), help=HELP["Average order size"])
    b[2].metric("Discounts given", money(s["discount_amount"]), help=HELP["Discounts given"])
    b[3].metric("Average discount", pct(s["avg_discount_rate"]), help=HELP["Average discount"])
    st.caption("Profit before overheads = sales after discounts minus cost of goods sold. It is NOT net profit: the data has no fixed "
               "costs, shipping, marketing or tax, so net profit cannot be calculated.")
    with st.expander("How each number is calculated (for the curious)"):
        st.markdown(
            "- **Sales before discounts** = quantity x list price\n"
            "- **Discount amount** = sales before discounts x discount rate\n"
            "- **Sales after discounts** = sales before discounts - discount amount\n"
            "- **product cost** = quantity x unit cost\n"
            "- **Profit before overheads** = sales after discounts - product cost\n"
            "- **Profit margin** = profit before overheads / sales after discounts\n"
            "- **Average order size** = sales after discounts / number of unique orders\n"
            "- **Average discount** = discount amount / sales before discounts")

    # ----- trends -----
    st.subheader("Sales and profit trend")
    monthly = kpis.kpis_by_month(f)
    t1, t2 = st.columns(2)
    long = monthly.melt(id_vars="month", value_vars=["net_revenue", "gross_profit"],
                        var_name="Measure", value_name="Amount")
    long["Measure"] = long["Measure"].map({"net_revenue": "Sales after discounts", "gross_profit": "Profit before overheads"})
    fig = px.line(long, x="month", y="Amount", color="Measure", markers=True,
                  labels={"month": "Month", "Amount": "$"}, title="Sales after discounts and profit before overheads by month")
    t1.plotly_chart(fig)
    mm = monthly.assign(margin=monthly["gross_margin_pct"] * 100)
    fig = px.line(mm, x="month", y="margin", markers=True,
                  labels={"month": "Month", "margin": "Profit margin (%)"}, title="Profit margin by month")
    t2.plotly_chart(fig)
    st.caption("Months at the edges of the date range may be incomplete if the data starts or ends mid-month.")

    # ----- categories -----
    st.subheader("Category comparison")
    cat = kpis.kpis_by(f, "category").sort_values("net_revenue", ascending=False)
    c_long = cat.melt(id_vars="category", value_vars=["net_revenue", "gross_profit"],
                      var_name="Measure", value_name="Amount")
    c_long["Measure"] = c_long["Measure"].map({"net_revenue": "Sales after discounts", "gross_profit": "Profit before overheads"})
    fig = px.bar(c_long, x="category", y="Amount", color="Measure", barmode="group",
                 labels={"category": "Category", "Amount": "$"})
    st.plotly_chart(fig)

    # ----- products -----
    st.subheader("Product performance")
    prod = kpis.kpis_by(f, ["product_id", "product_name", "category"]).sort_values("net_revenue", ascending=False)
    table = pd.DataFrame({
        "Product": prod["product_name"], "Category": prod["category"],
        "Units": prod["units_sold"], "Sales after discounts": prod["net_revenue"],
        "Revenue share (%)": prod["revenue_share"] * 100, "Profit before overheads": prod["gross_profit"],
        "Profit share (%)": prod["profit_share"] * 100, "Profit margin (%)": prod["gross_margin_pct"] * 100,
        "Avg discount (%)": prod["avg_discount_rate"] * 100})
    st.dataframe(table, hide_index=True, column_config={
        "Sales after discounts": st.column_config.NumberColumn(format="$%.0f"),
        "Profit before overheads": st.column_config.NumberColumn(format="$%.0f"),
        "Revenue share (%)": st.column_config.NumberColumn(format="%.1f%%"),
        "Profit share (%)": st.column_config.NumberColumn(format="%.1f%%"),
        "Profit margin (%)": st.column_config.NumberColumn(format="%.1f%%"),
        "Avg discount (%)": st.column_config.NumberColumn(format="%.1f%%")})

    st.subheader("Profitability analysis: revenue versus margin")
    pts = prod.dropna(subset=["gross_margin_pct"]).assign(margin=lambda x: x["gross_margin_pct"] * 100)
    fig = px.scatter(pts, x="net_revenue", y="margin", color="category", hover_name="product_name",
                     labels={"net_revenue": "Sales after discounts ($)", "margin": "Profit margin (%)"})
    if pd.notna(s["gross_margin_pct"]):
        fig.add_hline(y=s["gross_margin_pct"] * 100, line_dash="dash",
                      annotation_text=f"Overall margin {s['gross_margin_pct']:.1%}")
    st.plotly_chart(fig)
    st.caption("Products far to the right and low on the chart sell a lot but earn little per dollar: "
               "good candidates for a price or cost review.")

    st.subheader("Best and worst products by profit before overheads")
    n = min(5, len(prod))
    left, right = st.columns(2)
    cols = {"product_name": "Product", "net_revenue": "Sales after discounts", "gross_profit": "Profit before overheads"}
    cfg = {"Sales after discounts": st.column_config.NumberColumn(format="$%.0f"),
           "Profit before overheads": st.column_config.NumberColumn(format="$%.0f")}
    left.markdown("**Top products**")
    left.dataframe(prod.nlargest(n, "gross_profit")[list(cols)].rename(columns=cols),
                   hide_index=True, column_config=cfg)
    right.markdown("**Bottom products**")
    right.dataframe(prod.nsmallest(n, "gross_profit")[list(cols)].rename(columns=cols),
                    hide_index=True, column_config=cfg)


# =====================================================================
# PAGE 3: PRODUCTS (Module C)
# =====================================================================
def require_data():
    """Return the confirmed data, or show guidance and return None."""
    df = st.session_state["analysis_df"]
    if df is None:
        st.info("No data confirmed yet. Go to the Data page and click 'Use this data for analysis'.")
        return None
    banner = st.session_state["source_label"]
    if st.session_state["is_simulated"]:
        banner = "SIMULATED data - " + banner
    st.caption(f"{banner} | {len(df):,} rows used")
    return kpis.add_calculated_columns(df)


def page_products():
    hero("Your products", "Which products are your stars, and which need attention? Every label explains why.", "🏷️")
    tip("Think of a report card. <b>Star</b>: sells a lot and keeps a good profit. <b>Busy but thin</b>: sells a lot but keeps little profit. "
        "<b>Niche</b>: sells less but keeps a good profit. <b>Low performer</b>: sells little and keeps little profit.")
    df = require_data()
    if df is None:
        return
    st.write("Every product is placed in one main group and, where needed, gets alert tags. "
             "Each label shows the rule and the real numbers behind it. "
             "This page always uses all confirmed data, so the trend comparison stays fair.")

    table = seg.segment_products(df)
    counts = table["segment"].value_counts()
    cols = st.columns(len(seg_order := [seg.STAR, seg.CORE, seg.THIN, seg.NICHE, seg.LOW]))
    for c, name in zip(cols, seg_order):
        c.metric(name, int(counts.get(name, 0)), help=EXPLAIN.get(name))

    with st.expander("How the groups and alerts are decided (for the curious)"):
        st.markdown(
            "**Segments** (revenue is compared with the median product; margin with the whole portfolio)\n"
            "- **Star**: revenue at or above the median, and margin at or above the portfolio margin\n"
            "- **Busy but thin**: revenue at or above the median, and margin below 20%\n"
            "- **Core volume**: revenue at or above the median, and margin in between\n"
            "- **Niche**: revenue below the median, and healthy margin\n"
            "- **Low performer**: revenue below the median, and margin below the portfolio margin\n\n"
            "**Flags**\n"
            "- **Declining sales**: units in the latest 6 months are at least 15% below the same 6 months a year earlier\n"
            "- **Promotion candidate**: Niche and not declining\n"
            "- **Price/cost review**: margin below 20%\n\n"
            "*High revenue and healthy margin are relative to your own product range, not to an outside benchmark.*")

    st.sidebar.subheader("Product filters")
    sel_seg = st.sidebar.multiselect("Product groups", seg_order, default=seg_order, key="p_segments")
    only_flagged = st.sidebar.checkbox("Only products with alerts", value=False, key="p_flagged")
    view = table[table["segment"].isin(sel_seg)]
    if only_flagged:
        view = view[view["flags"] != ""]
    if view.empty:
        st.warning("No products match these filters.")
        return

    st.subheader("Sales versus profit margin, by product group")
    pts = view.dropna(subset=["gross_margin_pct"]).assign(margin=lambda x: x["gross_margin_pct"] * 100)
    fig = px.scatter(pts, x="net_revenue", y="margin", color="segment", hover_name="product_name",
                     labels={"net_revenue": "Sales after discounts ($)", "margin": "Profit margin (%)", "segment": "Product group"})
    st.plotly_chart(fig)

    st.subheader("Product table")
    shown = pd.DataFrame({
        "Product": view["product_name"], "Category": view["category"], "Product group": view["segment"],
        "Alerts": view["flags"], "Sales after discounts": view["net_revenue"],
        "Profit margin (%)": view["gross_margin_pct"] * 100, "Units trend vs last year (%)": view["trend_pct"] * 100,
        "Why this segment": view["segment_rule"].map(plain), "Why these flags": view["flag_reasons"].map(plain)})
    st.dataframe(shown, hide_index=True, column_config={
        "Sales after discounts": st.column_config.NumberColumn(format="$%.0f"),
        "Profit margin (%)": st.column_config.NumberColumn(format="%.1f%%"),
        "Units trend vs last year (%)": st.column_config.NumberColumn(format="%+.0f%%")})
    if view["trend_pct"].isna().all():
        st.caption("The year-on-year trend is empty because the data covers less than about 18 months.")
    st.caption("Declining products are never marked as promotion candidates: find out why sales fall "
               "before spending money on promotion.")


# =====================================================================
# PAGE 4: DISCOUNTS (Module B, part 2)
# =====================================================================
def page_discounts():
    hero("Do discounts pay off?", "A discount lowers the profit on every item sold. It only pays off if it brings enough extra sales.", "💸")
    tip("Example: an item sells for $100 and costs you $50. A 20% discount cuts your profit per item from $50 to $30, "
        "so you must sell about 67% more items just to earn the same total profit.")
    df = require_data()
    if df is None:
        return
    st.write("A discount cuts your profit on every item sold. It only pays off if enough extra items are sold to make up for it.")

    with st.expander("How this is calculated (for the curious)"):
        st.markdown(
            "1. For each product and month, the real discount rate = discount amount / sales before discounts.\n"
            "2. **Full-price months** have a discount below 5%. **Discounted months** have 10% or more. "
            "Months in between are left out so the two groups are clearly different.\n"
            "3. We compare average monthly units and profit before overheads in the two groups, "
            "adjusted for seasonality (a busy month such as November is not credited to a discount).\n"
            "4. **Break-even volume lift = d / (m - d)**, where d is the discount and m the margin at list price.\n\n"
            "**Limitation:** this compares past months. It shows a link, not proof that discounts caused the change.")

    res = disc.discount_effectiveness(df)
    res["verdict"] = res["verdict"].replace(VERDICT_LABEL)          # friendlier wording on screen
    res["verdict_reason"] = res["verdict_reason"].map(plain)
    order = ["Discounts pay off", "No clear gain from discounts", "Discounts reduce profit", "Not enough data"]
    counts = res["verdict"].value_counts()
    cols = st.columns(4)
    for c, name in zip(cols, order):
        c.metric(name, int(counts.get(name, 0)), help=EXPLAIN.get(name))

    st.subheader("Results by product")
    shown = pd.DataFrame({
        "Product": res["product_name"], "Verdict": res["verdict"],
        "Avg discount when discounted (%)": res["avg_discount_when_discounted"] * 100,
        "Volume change (%)": res.get("volume_lift_pct", pd.Series(dtype=float)) * 100,
        "Volume change needed to break even (%)": res.get("breakeven_lift_pct", pd.Series(dtype=float)).replace(float("inf"), float("nan")) * 100,
        "Profit before overheads change (%)": res.get("gross_profit_change_pct", pd.Series(dtype=float)) * 100,
        "Months full price": res["months_full_price"], "Months discounted": res["months_discounted"],
        "Explanation": res["verdict_reason"]})
    st.dataframe(shown, hide_index=True, column_config={
        "Avg discount when discounted (%)": st.column_config.NumberColumn(format="%.0f%%"),
        "Volume change (%)": st.column_config.NumberColumn(format="%+.0f%%"),
        "Volume change needed to break even (%)": st.column_config.NumberColumn(format="%.0f%%"),
        "Profit before overheads change (%)": st.column_config.NumberColumn(format="%+.0f%%")})
    st.caption("A blank break-even value means the discount is as big as the margin, so no number of extra sales can pay for it.")

    plot = res.dropna(subset=["gross_profit_change_pct"]).assign(change=lambda x: x["gross_profit_change_pct"] * 100)
    if not plot.empty:
        plot = plot.sort_values("change")
        fig = px.bar(plot, x="change", y="product_name", color="verdict", orientation="h",
                     labels={"change": "Profit before overheads change in discounted months (%)", "product_name": "Product",
                             "verdict": "Verdict"})
        st.plotly_chart(fig)

    st.subheader("Break-even calculator")
    st.write("Try a discount on a product of your choice (an assumption, not an observed result).")
    k1, k2 = st.columns(2)
    d = k1.slider("Discount you offer (%)", 0, 90, 20, key="calc_discount", help="How much you take off the normal price.") / 100
    m = k2.slider("Profit you keep per item at full price (%)", 1, 95, 50, key="calc_margin", help="Share of the normal price that is profit, before overheads.") / 100
    need = disc.breakeven_volume_lift(d, m)
    if d == 0:
        st.info("With no discount, no extra volume is needed.")
    elif d >= m:
        st.error("The discount is as big as the margin (or bigger). No amount of extra volume can pay for it.")
    else:
        st.success(f"You must sell {need:.0%} more units just to earn the same profit before overheads as at full price.")


# =====================================================================
# PAGE 5: SIMULATOR (Module D)
# =====================================================================
def page_simulator():
    hero("Try a price change", "Ask \"what if?\" Change the price, discount or cost and see the effect on sales and profit. Your real data is never changed.", "🧪")
    df = require_data()
    if df is None:
        return
    st.info("**Observed** = from your data (today's numbers). **Assumed** = the settings you choose below. "
            "The data cannot tell us how customers will react to a new price, so sales volume is always YOUR assumption. "
            "Results are scenarios, not forecasts.")

    base = sim.baseline_by_product(df)
    names = dict(zip(base["product_id"], base["product_name"]))
    sel = st.multiselect("Products to include (default: all)", list(names), default=list(names),
                         format_func=lambda pid: f"{names[pid]} ({pid})", key="s_products")
    if not sel:
        st.warning("Select at least one product.")
        return

    st.subheader("Your \"what if\" settings")
    a1, a2, a3 = st.columns(3)
    price_chg = a1.slider("Change the selling price by (%)", -30, 30, 0, key="s_price", help="+10 means every price goes up by 10%.") / 100
    cost_chg = a2.slider("Change what each item costs you by (%)", -30, 30, 0, key="s_cost", help="+10 means your suppliers charge 10% more.") / 100
    set_disc = a3.checkbox("Offer a different discount (otherwise each product keeps the discount it had)", key="s_setdisc")
    new_disc = a3.slider("New discount (%)", 0, 80, 10, key="s_disc", disabled=not set_disc) / 100
    disc_arg = new_disc if set_disc else None

    mode = st.radio("How many items will you sell after the change?",
                    ["I choose how many more or fewer items sell", "Estimate it from how strongly customers react to price"],
                    key="s_mode", horizontal=True)
    if mode == "I choose how many more or fewer items sell":
        vol_chg = st.slider("Change in items sold (%)", -60, 200, 0, key="s_volume", help="This is YOUR guess. Your data cannot tell how customers will react.") / 100
    else:
        el = st.slider("How strongly customers react to price", -4.0, 0.0, -1.5, 0.1, key="s_elasticity", help="-1.5 means: a 10% lower price brings about 15% more sales. 0 means customers do not react. This is a guess you set.")
        st.caption("A reaction of -1.5 means: a 10% lower customer price brings about 15% more items sold. "
                   "This is an ASSUMPTION; the data does not measure it. It uses the average price across the selected products.")
        flat = sim.simulate(df, price_chg, disc_arg, cost_chg, 0.0, sel)
        old_p = flat["baseline"]["net_revenue"] / flat["baseline"]["units"]
        new_p = flat["scenario"]["net_revenue"] / flat["scenario"]["units"]
        if new_p <= 0:
            st.error("The new customer price is zero or negative. Reduce the discount.")
            return
        vol_chg = sim.implied_volume_change(old_p, new_p, el)
        st.write(f"Customer price per unit moves from ${old_p:,.2f} to ${new_p:,.2f}, "
                 f"which implies a volume change of **{vol_chg:+.0%}**.")

    try:
        r = sim.simulate(df, price_chg, disc_arg, cost_chg, vol_chg, sel)
    except ValueError as exc:
        st.error(str(exc))
        return
    b, s, ch = r["baseline"], r["scenario"], r["change"]

    st.subheader("Results: today versus after your change")
    k = st.columns(4)
    k[0].metric("Sales after discounts", money(s["net_revenue"]), f"{ch['net_revenue']:+.1%}", help=HELP["Sales after discounts"])
    k[1].metric("Profit before overheads", money(s["gross_profit"]), f"{ch['gross_profit']:+.1%}", help=HELP["Profit before overheads"])
    k[2].metric("Profit margin", pct(s["gross_margin_pct"]), f"{ch['gross_margin_pts'] * 100:+.1f} pts", help=HELP["Profit margin"])
    k[3].metric("Items sold", f"{s['units']:,.0f}", f"{ch['units']:+.1%}", help=HELP["Items sold"])
    be = r["breakeven_units"]
    if np.isinf(be):
        st.error("Break-even point: none. At the new price, discount and cost, each item earns nothing "
                 "or loses money, so no number of extra sales can match your current profit before overheads.")
    else:
        st.write(f"**Break-even point:** {be:,.0f} items must be sold to match your current profit before overheads "
                 f"of {money(b['gross_profit'])} (now: {b['units']:,.0f} items; your change assumes {s['units']:,.0f}). "
                 + ("Your assumed volume reaches it." if s["units"] >= be else "Your assumed volume does NOT reach it."))
    st.caption("Break-even here means matching your current profit before overheads. The data has no fixed costs, shipping, "
               "marketing or tax, so a fixed-cost break-even cannot be calculated.")

    comp = pd.DataFrame({"Measure": ["Items sold", "Sales after discounts", "Product cost", "Profit before overheads"],
                         "Now (from your data)": [b["units"], b["net_revenue"], b["cogs"], b["gross_profit"]],
                         "After your change (assumption)": [s["units"], s["net_revenue"], s["cogs"], s["gross_profit"]]})
    st.dataframe(comp, hide_index=True, column_config={
        "Now (from your data)": st.column_config.NumberColumn(format="%.0f"),
        "After your change (assumption)": st.column_config.NumberColumn(format="%.0f")})
    chart = comp[comp["Measure"] != "Items sold"].melt(id_vars="Measure", var_name="Case", value_name="Amount")
    st.plotly_chart(px.bar(chart, x="Measure", y="Amount", color="Case", barmode="group", labels={"Amount": "$"}))

    st.subheader("By product")
    bp = r["by_product"]
    shown = pd.DataFrame({
        "Product": bp["product_name"], "Items now": bp["baseline_units"], "Items after change": bp["scenario_units"],
        "Profit now": bp["baseline_gross_profit"], "Profit after change": bp["scenario_gross_profit"],
        "Items needed to break even": bp["breakeven_units"].replace(np.inf, np.nan)})
    st.dataframe(shown, hide_index=True, column_config={
        "Items now": st.column_config.NumberColumn(format="%.0f"),
        "Items after change": st.column_config.NumberColumn(format="%.0f"),
        "Profit now": st.column_config.NumberColumn(format="$%.0f"),
        "Profit after change": st.column_config.NumberColumn(format="$%.0f"),
        "Items needed to break even": st.column_config.NumberColumn(format="%.0f")})
    st.caption("A blank value means no number of extra sales can match your current profit at the new settings.")


# =====================================================================
# PAGE 6: INVENTORY (Module E)
# =====================================================================
def page_inventory():
    hero("Stock check", "Which products may run out, what to order, and where you hold too much stock.", "📦")
    tip("<b>Days of stock</b> = how many days your stock lasts at the recent selling speed. <b>Delivery time</b> = how long a new order takes to arrive. "
        "If stock runs out before a new order can arrive, there is a risk of lost sales.")
    df = require_data()
    if df is None:
        return

    st.write("Which products may run out before new stock arrives, when to reorder, and where there is too much stock.")
    with st.expander("Required inventory file (one row per product)"):
        st.table(pd.DataFrame({
            "Column": inv.REQUIRED_COLUMNS,
            "Meaning": ["Product code, the same as in the sales file",
                        "Units in stock now, as of the last sales date (0 or more)",
                        "Days from placing an order to receiving it (above 0)"]}))
        st.caption("The sales file has no stock levels or lead times, so these fields must come from this file. "
                   "Demand variability is calculated from your sales history.")

    c1, c2 = st.columns(2)
    if c1.button("Use simulated inventory (demo)", key="btn_inv_demo"):
        st.session_state["inv_raw"] = pd.read_csv(ROOT / "data" / "inventory.csv", dtype={"product_id": str})
        st.session_state["inv_label"], st.session_state["inv_simulated"] = "SIMULATED demo inventory", True
    up = c2.file_uploader("Or upload your stock file (the Excel template or a CSV)", type=["xlsx", "csv"], key="inv_uploader")
    if up is not None and st.session_state["inv_label"] != f"Uploaded file: {up.name}":
        try:
            if up.name.lower().endswith(".xlsx"):
                st.session_state["inv_raw"] = excel_io.read_inventory_workbook(up, strict=True)
            else:
                st.session_state["inv_raw"] = pd.read_csv(up, dtype={"product_id": str})
            st.session_state["inv_label"], st.session_state["inv_simulated"] = f"Uploaded file: {up.name}", False
        except Exception as exc:
            st.error(f"The file could not be read: {exc}")

    raw = st.session_state["inv_raw"]
    if raw is None:
        st.info("No inventory data loaded. Without current stock and lead times, reliable inventory results are "
                "not possible. Click 'Use simulated inventory (demo)' for a clearly labelled illustrative scenario, "
                "or upload your own file.")
        return

    good, issues, missing = inv.validate_inventory(raw, df["product_id"].unique())
    if missing:
        st.error("Required columns are missing: " + ", ".join(missing) + ". Please fix the file and upload it again.")
        return
    if st.session_state["inv_simulated"]:
        st.warning("The inventory is SIMULATED for demonstration. Results are illustrative, not real stock positions.")
        if not st.session_state["is_simulated"]:
            st.warning("You are combining simulated inventory with real sales data. Do not act on these results.")
    st.caption(f"Inventory source: {st.session_state['inv_label']} | {len(good):,} usable rows of {len(raw):,}")
    if not issues.empty:
        st.dataframe(issues.rename(columns={"check": "Check", "severity": "Severity", "rows_affected": "Rows affected",
                                            "example_line_numbers": "Example line numbers in file"}), hide_index=True)
        st.caption("Rows with ERROR are left out. Nothing is repaired automatically.")
    if good.empty:
        st.error("No usable inventory rows. Please fix the file.")
        return

    with st.expander("Assumptions (change them to see the effect)", expanded=True):
        a = st.columns(4)
        service = a[0].slider("How sure do you want to be of not running out? (%)", 90, 99, 95, key="i_service", help="Higher means a bigger safety buffer and more money tied up in stock.") / 100
        window = a[1].slider("Days of sales history to use", 30, 180, 90, key="i_window", help="How far back to look when measuring the selling speed.")
        cover = a[2].slider("Days of sales each order should cover", 7, 90, 30, key="i_cover", help="Extra days of sales to cover after the delivery arrives.")
        excess = a[3].slider("Call it too much stock above (days)", 30, 365, 90, key="i_excess", help="Stock that lasts longer than this many days is shown as excess.")
    res = inv.analyze_inventory(df, good, service, window, cover, excess)
    st.caption(f"Stock is assumed to be as of {res.attrs['as_of']:%d %b %Y}, the last sales date. "
               f"Demand is measured over the last {res.attrs['days_used']} days.")

    with st.expander("How this is calculated (for the curious)"):
        st.markdown(
            "- **Average daily demand (d)** = units sold in the demand window / days in the window\n"
            "- **Days of stock** = current stock / d\n"
            "- **Safety stock** = z x (standard deviation of daily demand) x square root of lead time; "
            "z comes from the service level\n"
            "- **Reorder point** = d x lead time + safety stock\n"
            "- **Suggested order** = d x (lead time + cover days) + safety stock - current stock\n\n"
            "**Status rules, in this order:** *Stockout risk* = days of stock is below the lead time. "
            "*Reorder now* = stock is at or below the reorder point. "
            "*Excess stock* = days of stock above the threshold. Otherwise *OK*.\n\n"
            "**Limits:** assumes steady demand and a fixed lead time; ignores seasons, promotions, minimum order "
            "quantities and storage limits.")

    n = res["status"].value_counts()
    k = st.columns(4)
    for col, name in zip(k, [inv.STOCKOUT, inv.REORDER, inv.EXCESS, inv.OK]):
        col.metric(name, int(n.get(name, 0)), help=EXPLAIN.get(name))
    other = [f"{int(n[s])} {s.lower()}" for s in (inv.NO_SALES, inv.NO_INV) if s in n]
    if other:
        st.caption("Also: " + ", ".join(other) + ".")
    tied = res["excess_value"].sum() if "excess_value" in res else 0
    st.metric("Cash tied up in excess stock (at cost)", money(tied))
    st.caption("Excess value = units above the threshold x average unit cost. It is stock that may be sold more slowly, "
               "not stock that is lost.")

    st.subheader("Days of stock versus lead time")
    plot = res.dropna(subset=["days_of_stock"])
    plot = plot[np.isfinite(plot["days_of_stock"])].sort_values("days_of_stock")
    if not plot.empty:
        fig = px.bar(plot, x="days_of_stock", y="product_name", color="status", orientation="h",
                     labels={"days_of_stock": "Days of stock", "product_name": "Product", "status": "Status"})
        st.plotly_chart(fig)
        st.caption("A product is in stockout risk when its bar is shorter than its lead time (see the table).")

    st.subheader("Product table")
    order = [inv.STOCKOUT, inv.REORDER, inv.EXCESS, inv.NO_SALES, inv.NO_INV, inv.OK]
    sel = st.multiselect("Show statuses", order, default=order, key="i_status")
    view = res[res["status"].isin(sel)].copy()
    view["_o"] = view["status"].map({s: i for i, s in enumerate(order)})
    view = view.sort_values(["_o", "product_name"])
    if view.empty:
        st.warning("No products match these filters.")
        return
    def col(name):
        return view[name] if name in view else pd.Series(np.nan, index=view.index)
    shown = pd.DataFrame({
        "Product": view["product_name"], "Status": view["status"],
        "Stock": col("current_stock"), "Days of stock": col("days_of_stock").replace(np.inf, np.nan),
        "Lead time (days)": col("lead_time_days"), "Avg daily demand": col("avg_daily_demand"),
        "Reorder point": col("reorder_point"), "Suggested order (units)": col("suggested_order_qty"),
        "Excess units": col("excess_units"), "Why": view["reason"].map(plain)})
    st.dataframe(shown, hide_index=True, column_config={
        "Stock": st.column_config.NumberColumn(format="%.0f"),
        "Days of stock": st.column_config.NumberColumn(format="%.1f"),
        "Lead time (days)": st.column_config.NumberColumn(format="%.0f"),
        "Avg daily demand": st.column_config.NumberColumn(format="%.1f"),
        "Reorder point": st.column_config.NumberColumn(format="%.0f"),
        "Suggested order (units)": st.column_config.NumberColumn(format="%.0f"),
        "Excess units": st.column_config.NumberColumn(format="%.0f")})
    to_order = shown[shown["Suggested order (units)"] > 0][["Product", "Status", "Stock", "Reorder point", "Suggested order (units)"]]
    if not to_order.empty:
        st.download_button("Download the reorder list (CSV)", to_order.to_csv(index=False),
                           file_name="reorder_list.csv", mime="text/csv", key="btn_download_reorder")
    st.caption("Suggestions are a starting point. Check supplier minimums, budget and upcoming promotions before ordering.")


def get_inventory_result(df):
    """Inventory analysis with default assumptions, or (None, False) if no usable inventory is loaded."""
    raw_inv = st.session_state["inv_raw"]
    if raw_inv is None:
        return None, False
    good, _issues, missing = inv.validate_inventory(raw_inv, df["product_id"].unique())
    if missing or good is None or good.empty:
        return None, False
    return inv.analyze_inventory(df, good), bool(st.session_state["inv_simulated"])


def get_recommendations(df, inv_res, inv_sim):
    excluded = st.session_state["excluded_df"]
    n_excl = 0 if excluded is None else len(excluded)
    n_total = len(st.session_state["raw_df"]) if st.session_state["raw_df"] is not None else None
    return rec.generate_recommendations(df, inv_res, n_excl, n_total, inv_sim)


# =====================================================================
# PAGE 7: RECOMMENDATIONS (Module F)
# =====================================================================
def page_recommendations():
    hero("What to do next", "A short, ranked to-do list built from your numbers. Start at the top.", "✅")
    tip("Each card shows: what is wrong, the proof, what to do, what you might gain, what could go wrong, and why it ranks where it does.")
    df = require_data()
    if df is None:
        return

    inv_res, inv_sim = get_inventory_result(df)
    recs = get_recommendations(df, inv_res, inv_sim)
    if inv_res is None:
        st.info("No usable inventory data is loaded, so there are no stock recommendations. "
                "Load inventory on the Inventory page to add them.")
    else:
        st.caption("Inventory recommendations use the default Inventory assumptions "
                   "(95% service level, 90-day demand window, 30 days of cover, 90-day excess threshold).")
    if st.session_state["is_simulated"] or inv_sim:
        st.warning("These recommendations are based on SIMULATED data. They show how the engine works; "
                   "do not act on them as real findings.")
    st.write("Each action comes from rules applied to your data. Benefits are estimates from past data, "
             "not promises. Check the risks before acting.")

    with st.expander("How priorities are decided"):
        st.markdown(
            "- **Stockout risk** is always **High**: sales are likely to be lost within days.\n"
            "- **Reorder now** is **Medium**.\n"
            "- Items with a profit estimate: **High** if the estimate is 5% or more of total profit before overheads, "
            "**Medium** from 1% to under 5%, **Low** below 1%.\n"
            "- **Excess stock** is never High (the stock is not lost): Medium if the cash tied up is 1% or more of sales after discounts, else Low.\n"
            "- Items with no money estimate are **Low**.\n"
            "- Inside a level, urgent items come first, then the larger estimated effect.\n\n"
            "**Cross-checks:** a product at stock risk is never suggested for a promotion or discount, "
            "and excess-stock advice depends on whether discounts pay off for that product.")

    if recs.empty:
        st.success("No recommendations were triggered by the current data.")
        return
    counts = recs["priority"].value_counts()
    k = st.columns(3)
    for col, name in zip(k, ["High", "Medium", "Low"]):
        col.metric(f"{name} priority", int(counts.get(name, 0)), help=EXPLAIN.get(name))

    sel = st.multiselect("Show priorities", ["High", "Medium", "Low"], default=["High", "Medium", "Low"], key="r_priority")
    view = recs[recs["priority"].isin(sel)]
    if view.empty:
        st.warning("No recommendations match these filters.")
        return
    for _, r in view.iterrows():
        title = f"#{r['rank']}  [{r['priority']}]  {r['area']}: {r['subject']}"
        with st.expander(title, expanded=(r["priority"] == "High")):
            st.markdown(f"**Issue:** {plain(r['issue'])}")
            st.markdown(f"**Evidence:** {plain(r['evidence'])}")
            st.markdown(f"**Proposed action:** {plain(r['action'])}")
            st.markdown(f"**Expected benefit:** {plain(r['expected_benefit'])}")
            st.markdown(f"**Risks and assumptions:** {plain(r['risks_assumptions'])}")
            st.markdown(f"**Priority: {r['priority']}.** {plain(r['priority_reason'])}")
    st.download_button("Download the recommendations (CSV)", plain_df(recs.drop(columns=["est_impact"])).to_csv(index=False),
                       file_name="recommendations.csv", mime="text/csv", key="btn_download_recs")


# =====================================================================
# PAGE 8: EXECUTIVE SUMMARY (Module G)
# =====================================================================
def page_executive():
    hero("The big picture", "Your key numbers, what they mean, and what to do first.", "📊")
    df = require_data()
    if df is None:
        return
    sim_any = st.session_state["is_simulated"]
    inv_res, inv_sim = get_inventory_result(df)
    if sim_any or inv_sim:
        st.warning("This summary uses SIMULATED data. It shows how the tool works; the numbers are not real.")
    recs = get_recommendations(df, inv_res, inv_sim)
    findings = summ.key_findings(df, inv_res)
    s = kpis.summary_kpis(df)

    k = st.columns(4)
    k[0].metric("Sales after discounts", money(s["net_revenue"]), help=HELP["Sales after discounts"])
    k[1].metric("Profit before overheads", money(s["gross_profit"]), help=HELP["Profit before overheads"])
    k[2].metric("Profit margin", pct(s["gross_margin_pct"]), help=HELP["Profit margin"])
    k[3].metric("Orders", f"{s['orders']:,}", help=HELP["Orders"])
    st.caption("Profit before overheads = sales after discounts minus what the products cost you. Rent, staff, shipping, advertising and tax are not included.")

    st.subheader("Key findings")
    for i, f in enumerate(findings, 1):
        st.markdown(f"{i}. **{plain(f['headline'])}.** {plain(f['detail'])}")

    st.subheader("Top recommended actions")
    if recs.empty:
        st.success("No recommendations were triggered by the current data.")
    else:
        top = recs.head(5)
        st.dataframe(pd.DataFrame({"#": top["rank"], "Priority": top["priority"], "Area": top["area"],
                                   "Subject": top["subject"], "Proposed action": top["action"].map(plain)}), hide_index=True)
        st.caption("Full detail (evidence, benefit, risks) is on the Recommendations page.")

    st.subheader("Sales and profit trend")
    c1, c2 = st.columns(2)
    monthly = kpis.kpis_by_month(df)
    long = monthly.melt(id_vars="month", value_vars=["net_revenue", "gross_profit"], var_name="Measure", value_name="Amount")
    long["Measure"] = long["Measure"].map({"net_revenue": "Sales after discounts", "gross_profit": "Profit before overheads"})
    c1.plotly_chart(px.line(long, x="month", y="Amount", color="Measure", markers=True,
                            labels={"month": "Month", "Amount": "$"}, title="Sales after discounts and profit before overheads by month"))
    cat = kpis.kpis_by(df, "category").sort_values("gross_profit", ascending=False)
    c2.plotly_chart(px.bar(cat, x="category", y="gross_profit", labels={"category": "Category", "gross_profit": "Profit before overheads ($)"},
                           title="Profit before overheads by category"))
    st.caption("This page always uses all confirmed data. Use the Dashboard page to filter by date or category.")

    st.subheader("Inventory alerts")
    if inv_res is None:
        st.info("No usable inventory data is loaded. Load it on the Inventory page to see stock alerts here.")
    else:
        alerts = inv_res[inv_res["status"].isin([inv.STOCKOUT, inv.REORDER])]
        if alerts.empty:
            st.success("No stockout or reorder alerts at the default assumptions.")
        else:
            st.dataframe(pd.DataFrame({"Product": alerts["product_name"], "Status": alerts["status"],
                                       "Stock": alerts["current_stock"], "Days of stock": alerts["days_of_stock"],
                                       "Lead time (days)": alerts["lead_time_days"],
                                       "Suggested order (units)": alerts["suggested_order_qty"]}),
                         hide_index=True, column_config={
                "Stock": st.column_config.NumberColumn(format="%.0f"),
                "Days of stock": st.column_config.NumberColumn(format="%.1f"),
                "Lead time (days)": st.column_config.NumberColumn(format="%.0f"),
                "Suggested order (units)": st.column_config.NumberColumn(format="%.0f")})

    report = plain(summ.executive_markdown(df, findings, recs, st.session_state["source_label"], sim_any or inv_sim))
    st.download_button("Download this summary (Markdown report)", report, file_name="executive_summary.md",
                       mime="text/markdown", key="btn_download_summary")


if page == "Data":
    page_data()
elif page == "Executive summary":
    page_executive()
elif page == "Dashboard":
    page_dashboard()
elif page == "Products":
    page_products()
elif page == "Discounts":
    page_discounts()
elif page == "Simulator":
    page_simulator()
elif page == "Inventory":
    page_inventory()
else:
    page_recommendations()

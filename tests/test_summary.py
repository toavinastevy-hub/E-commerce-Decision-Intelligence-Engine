"""
Tests for src/summary.py. Hand-built data: 18 months (2025-01 to 2026-06), one order per product per month.
  Product A (category X): price 100, cost 60. 10 units a month, but 20 units in the last 6 months.
  Product B (category Y): price  50, cost 40.  5 units every month.   No discounts.
Hand results
  net revenue: months 1-12 = 1250 each (A 1000 + B 250), last 6 months = 2250 each -> 7500 + 7500 + 13500 = 28,500
  gross profit per month: first 12 = 10x40 + 5x10 = 450; last 6 = 20x40 + 50 = 850 -> 5400 + 5100 = 10,500, margin 36.8%
  latest 6 vs same 6 a year earlier: revenue 13,500 vs 7,500 = +80.0%, gross profit 5,100 vs 2,700 = +88.9%
  category X revenue 24,000 / 28,500 = 84.2%; margin X 40%, Y 20%
  product A gross profit 9,600 of 10,500 = 91.4%; 1 product makes up half
"""
import pandas as pd
import pytest
from src import summary as sm
from src import kpis, recommendations as rc, inventory as iv


def toy(months=18):
    rows = []
    for i, m in enumerate(pd.date_range("2025-01-01", periods=months, freq="MS")):
        qa = 20 if i >= months - 6 else 10
        for pid, name, cat, q, price, cost in (("A", "Alpha", "X", qa, 100.0, 60.0), ("B", "Beta", "Y", 5, 50.0, 40.0)):
            rows.append({"order_id": f"{pid}{i}", "order_date": m, "product_id": pid, "product_name": name,
                         "category": cat, "quantity": q, "list_price": price, "discount_rate": 0.0, "unit_cost": cost})
    return pd.DataFrame(rows)


def by_head(findings, start):
    return next(f for f in findings if f["headline"].startswith(start))


def test_performance_and_growth_hand_numbers():
    f = sm.key_findings(toy())
    perf = by_head(f, "Performance")["detail"]
    assert "$28,500" in perf and "$10,500" in perf and "36.8%" in perf
    growth = by_head(f, "Growth")["detail"]
    assert "+80.0%" in growth and "+88.9%" in growth
    assert "$7,500 to $13,500" in growth


def test_categories_concentration_and_discounts_hand_numbers():
    f = sm.key_findings(toy())
    cat = by_head(f, "Categories")["detail"]
    assert "X is the largest category with 84.2%" in cat and "Highest margin: X (40.0%)" in cat and "lowest margin: Y (20.0%)" in cat
    conc = by_head(f, "Concentration")["detail"]
    assert "Alpha alone earns 91.4%" in conc and "1 of 2 products make up half" in conc
    assert "$0 was given as discounts" in by_head(f, "Discounts")["detail"]


def test_short_history_is_stated_not_guessed():
    f = sm.key_findings(toy(months=12))
    g = by_head(f, "Growth")
    assert g["headline"] == "Growth: not enough history" and "12 months" in g["detail"]


def test_inventory_finding_only_with_inventory_data():
    assert not any(x["headline"] == "Inventory" for x in sm.key_findings(toy()))
    df = toy()
    inv = pd.DataFrame({"product_id": ["A", "B"], "current_stock": [5, 5000], "lead_time_days": [14, 14]})
    res = iv.analyze_inventory(df, inv)
    txt = by_head(sm.key_findings(df, res), "Inventory")["detail"]
    assert "Alpha" in txt and "may run out" in txt and "Beta" in txt and "excess" in txt


def test_demo_data_findings_match_the_kpi_module():
    df = pd.read_csv("data/sales.csv", dtype={"order_id": str, "product_id": str}, parse_dates=["order_date"])
    inv = pd.read_csv("data/inventory.csv", dtype={"product_id": str})
    res = iv.analyze_inventory(df, inv)
    f = sm.key_findings(df, res)
    s = kpis.summary_kpis(kpis.add_calculated_columns(df))
    assert f"${s['net_revenue']:,.0f}" in by_head(f, "Performance")["detail"]
    assert len(f) == 7
    assert "Face Moisturizer" in by_head(f, "Inventory")["detail"]
    assert "Bluetooth Speaker Mini" in by_head(f, "Margin pressure")["detail"]


def test_markdown_report_contents_and_simulated_warning():
    df = pd.read_csv("data/sales.csv", dtype={"order_id": str, "product_id": str}, parse_dates=["order_date"])
    inv = pd.read_csv("data/inventory.csv", dtype={"product_id": str})
    res = iv.analyze_inventory(df, inv)
    f = sm.key_findings(df, res)
    recs = rc.generate_recommendations(df, res)
    md = sm.executive_markdown(df, f, recs, "demo", simulated=True)
    assert md.startswith("# Executive summary") and "SIMULATED" in md
    assert "$852,008" in md and "## Key findings" in md and "## Top 5 recommended actions" in md
    assert "[High]" in md and "Limitations" in md
    assert "SIMULATED" not in sm.executive_markdown(df, f, recs, "real", simulated=False)

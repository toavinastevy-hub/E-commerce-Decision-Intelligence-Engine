"""
Tests for src/kpis.py.
The small example below is simple enough to check by hand:

 line | order | product | qty | price | disc | cost | gross | discount | net | cogs | profit
  1   |  A    |  P1     |  2  |  10   | 0.10 |  4   |  20   |    2     | 18  |  8   |  10
  2   |  A    |  P2     |  1  |  20   | 0.00 | 12   |  20   |    0     | 20  | 12   |   8
  3   |  B    |  P1     |  5  |   8   | 0.25 |  5   |  40   |   10     | 30  | 25   |   5

 Totals: gross 80, discount 12, net 68, cogs 45, profit 23, units 8, orders 2
 AOV = 68/2 = 34   margin = 23/68   avg discount rate = 12/80 = 0.15
"""
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from src import kpis


@pytest.fixture
def small():
    return pd.DataFrame({
        "order_id": ["A", "A", "B"],
        "order_date": ["2025-01-05", "2025-01-05", "2025-02-10"],
        "product_id": ["P1", "P2", "P1"],
        "product_name": ["One", "Two", "One"],
        "category": ["X", "X", "X"],
        "quantity": [2, 1, 5],
        "list_price": [10.0, 20.0, 8.0],
        "discount_rate": [0.10, 0.0, 0.25],
        "unit_cost": [4.0, 12.0, 5.0],
    })


def test_line_level_columns(small):
    d = kpis.add_calculated_columns(small)
    assert list(d["gross_sales"]) == [20, 20, 40]
    assert list(d["discount_amount"]) == pytest.approx([2, 0, 10])
    assert list(d["net_revenue"]) == pytest.approx([18, 20, 30])
    assert list(d["cogs"]) == [8, 12, 25]
    assert list(d["gross_profit"]) == pytest.approx([10, 8, 5])


def test_original_data_not_changed(small):
    before = small.copy()
    kpis.add_calculated_columns(small)
    pd.testing.assert_frame_equal(small, before)


def test_summary_totals(small):
    s = kpis.summary_kpis(small)
    assert s["order_lines"] == 3
    assert s["orders"] == 2
    assert s["units_sold"] == 8
    assert s["gross_sales"] == pytest.approx(80)
    assert s["discount_amount"] == pytest.approx(12)
    assert s["net_revenue"] == pytest.approx(68)
    assert s["cogs"] == pytest.approx(45)
    assert s["gross_profit"] == pytest.approx(23)
    assert s["avg_order_value"] == pytest.approx(34)
    assert s["gross_margin_pct"] == pytest.approx(23 / 68)
    assert s["avg_discount_rate"] == pytest.approx(0.15)


def test_profit_identity(small):
    s = kpis.summary_kpis(small)
    assert s["gross_sales"] - s["discount_amount"] == pytest.approx(s["net_revenue"])
    assert s["net_revenue"] - s["cogs"] == pytest.approx(s["gross_profit"])


def test_by_product(small):
    g = kpis.kpis_by(small, "product_id").set_index("product_id")
    assert g.loc["P1", "net_revenue"] == pytest.approx(48)
    assert g.loc["P1", "gross_profit"] == pytest.approx(15)
    assert g.loc["P2", "net_revenue"] == pytest.approx(20)
    assert g.loc["P1", "revenue_share"] == pytest.approx(48 / 68)
    assert g.loc["P2", "profit_share"] == pytest.approx(8 / 23)


def test_groups_reconcile_to_total_and_shares_sum_to_one(small):
    total = kpis.summary_kpis(small)
    for col in ["product_id", "category"]:
        g = kpis.kpis_by(small, col)
        assert g["net_revenue"].sum() == pytest.approx(total["net_revenue"])
        assert g["gross_profit"].sum() == pytest.approx(total["gross_profit"])
        assert g["revenue_share"].sum() == pytest.approx(1.0)
        assert g["profit_share"].sum() == pytest.approx(1.0)


def test_by_month(small):
    m = kpis.kpis_by_month(small)
    assert list(m["month"]) == ["2025-01", "2025-02"]
    assert list(m["net_revenue"]) == pytest.approx([38, 30])


def test_zero_revenue_gives_nan_not_error(small):
    free = small.copy()
    free["discount_rate"] = 1.0          # 100% discount -> zero revenue
    s = kpis.summary_kpis(free)
    assert s["net_revenue"] == pytest.approx(0)
    assert np.isnan(s["gross_margin_pct"])


def test_empty_data_does_not_crash(small):
    empty = small.iloc[0:0]
    s = kpis.summary_kpis(empty)
    assert s["order_lines"] == 0
    assert s["net_revenue"] == 0
    assert np.isnan(s["avg_order_value"])
    assert np.isnan(s["gross_margin_pct"])


def test_safe_divide():
    assert kpis.safe_divide(10, 4) == 2.5
    assert np.isnan(kpis.safe_divide(10, 0))
    assert np.isnan(kpis.safe_divide(10, None))


def test_real_demo_data_matches_independent_reference():
    """Reference numbers come from the separate SQL check (sql/01_totals_check.sql)."""
    path = Path(__file__).resolve().parent.parent / "data" / "sales.csv"
    if not path.exists():
        pytest.skip("data/sales.csv not found")
    s = kpis.summary_kpis(pd.read_csv(path))
    assert s["order_lines"] == 13589
    assert s["orders"] == 9132
    assert s["units_sold"] == 22716
    assert s["net_revenue"] == pytest.approx(852007.95, abs=0.02)
    assert s["cogs"] == pytest.approx(527086.48, abs=0.02)
    assert s["gross_profit"] == pytest.approx(324921.47, abs=0.02)

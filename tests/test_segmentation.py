"""
Tests for src/segmentation.py. Hand example (rows dated 2025-01-01 and 2026-06-15,
so the latest 6 months are compared with the same 6 months one year earlier):

 product | price | cost | units (prior -> recent) | revenue | gross profit | margin
   A     |  100  |  40  |     10 -> 10            |  2000   |   1200       |  60%
   B     |  100  |  95  |     10 -> 10            |  2000   |    100       |   5%
   E     |  100  |  75  |     10 -> 10            |  2000   |    500       |  25%
   C     |   10  |   5  |      2 ->  2            |    40   |     20       |  50%
   D     |   10  |   9  |     10 ->  3            |   130   |     13       |  10%
   H     |   10  |   3  |     10 ->  2            |   120   |     84       |  70%

 Median revenue = (130 + 2000) / 2 = 1065  -> high revenue: A, B, E
 Portfolio margin = (1200+100+500+20+13+84) / (2000*3+40+130+120) = 1917/6290 = 30.5%
"""
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from src import segmentation as seg
from src.kpis import summary_kpis

DATA = Path(__file__).resolve().parent.parent / "data"


def build(spec):
    rows, n = [], 0
    for pid, price, cost, prior, recent in spec:
        for date, qty in (("2025-01-01", prior), ("2026-06-15", recent)):
            n += 1
            rows.append({"order_id": f"O{n}", "order_date": date, "product_id": pid,
                         "product_name": f"Product {pid}", "category": "C", "quantity": qty,
                         "list_price": price, "discount_rate": 0.0, "unit_cost": cost})
    return pd.DataFrame(rows)


SPEC = [("A", 100, 40, 10, 10), ("B", 100, 95, 10, 10), ("E", 100, 75, 10, 10),
        ("C", 10, 5, 2, 2), ("D", 10, 9, 10, 3), ("H", 10, 3, 10, 2)]


@pytest.fixture
def result():
    return seg.segment_products(build(SPEC)).set_index("product_id")


def test_hand_numbers(result):
    assert result.loc["A", "net_revenue"] == pytest.approx(2000)
    assert result.loc["B", "gross_margin_pct"] == pytest.approx(0.05)
    assert result.loc["D", "net_revenue"] == pytest.approx(130)
    assert result.loc["D", "trend_pct"] == pytest.approx(-0.7)


def test_main_segments(result):
    assert result.loc["A", "segment"] == seg.STAR
    assert result.loc["B", "segment"] == seg.THIN
    assert result.loc["E", "segment"] == seg.CORE
    assert result.loc["C", "segment"] == seg.NICHE
    assert result.loc["H", "segment"] == seg.NICHE
    assert result.loc["D", "segment"] == seg.LOW


def test_flags(result):
    assert result.loc["B", "flags"] == "Price/cost review"
    assert result.loc["C", "flags"] == "Promotion candidate"
    assert "Declining sales" in result.loc["D", "flags"]
    assert "Price/cost review" in result.loc["D", "flags"]       # margin 10% < 20% floor
    assert result.loc["A", "flags"] == ""


def test_declining_product_is_not_a_promotion_candidate(result):
    # H is a niche product with healthy margin, but units fell 80%.
    assert result.loc["H", "flags"] == "Declining sales"


def test_every_product_has_a_rule_explanation(result):
    assert (result["segment_rule"].str.len() > 20).all()


def test_each_product_has_exactly_one_segment_and_totals_reconcile():
    df = build(SPEC)
    r = seg.segment_products(df)
    assert len(r) == df["product_id"].nunique()
    assert r["segment"].notna().all()
    assert r["net_revenue"].sum() == pytest.approx(summary_kpis(df)["net_revenue"])


def test_short_history_gives_no_trend_and_no_decline_flag():
    df = build(SPEC)
    df["order_date"] = df["order_date"].replace({"2025-01-01": "2026-02-01"})   # only 5 months of data
    r = seg.segment_products(df).set_index("product_id")
    assert r["trend_pct"].isna().all()
    assert not r["flags"].str.contains("Declining").any()


def test_decline_threshold_boundary_is_included():
    df = build([("A", 100, 40, 20, 17), ("B", 100, 40, 20, 18)])    # -15% and -10%
    r = seg.segment_products(df).set_index("product_id")
    assert "Declining sales" in r.loc["A", "flags"]
    assert "Declining sales" not in r.loc["B", "flags"]


def test_zero_prior_sales_does_not_crash():
    df = build([("A", 100, 40, 0, 10), ("B", 100, 40, 10, 10)])
    r = seg.segment_products(df).set_index("product_id")
    assert np.isnan(r.loc["A", "trend_pct"])


def test_input_not_modified():
    df = build(SPEC)
    before = df.copy()
    seg.segment_products(df)
    pd.testing.assert_frame_equal(df, before)


def test_demo_data_matches_planted_product_stories():
    r = seg.segment_products(pd.read_csv(DATA / "sales.csv")).set_index("product_id")
    for pid in ["P001", "P007", "P019", "P013"]:                 # planted stars
        assert r.loc[pid, "segment"] == seg.STAR, pid
    for pid in ["P004", "P012"]:                                 # planted busy-but-thin
        assert r.loc[pid, "segment"] == seg.THIN and "Price/cost review" in r.loc[pid, "flags"], pid
    for pid in ["P005", "P017", "P024"]:                         # planted decliners
        assert "Declining sales" in r.loc[pid, "flags"], pid
    for pid in ["P005", "P017"]:                                 # declining -> never a promotion candidate
        assert "Promotion candidate" not in r.loc[pid, "flags"], pid
    for pid in ["P006", "P018", "P024"]:                         # planted low performers
        assert r.loc[pid, "segment"] == seg.LOW, pid

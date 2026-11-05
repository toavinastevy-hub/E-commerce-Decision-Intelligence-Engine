"""
Tests for src/recommendations.py.
Hand examples for the helper formulas: price 10, cost 8 (margin 20%), target margin 40%
    price rise = 8 / (0.6 x 10) - 1 = 33.3%        cost cut = 1 - 10 x 0.6 / 8 = 25%
Priority boundaries: share of total gross profit  5% or more High, 1% to under 5% Medium, under 1% Low.
"""
import numpy as np
import pandas as pd
import pytest
from src import recommendations as rc
from src import inventory as iv
from src import segmentation as sg

SIX = ["issue", "evidence", "action", "expected_benefit", "risks_assumptions", "priority_reason"]


@pytest.fixture(scope="module")
def data():
    df = pd.read_csv("data/sales.csv", dtype={"order_id": str, "product_id": str}, parse_dates=["order_date"])
    inv = pd.read_csv("data/inventory.csv", dtype={"product_id": str})
    res = iv.analyze_inventory(df, inv)
    return df, res


@pytest.fixture(scope="module")
def recs(data):
    return rc.generate_recommendations(data[0], data[1])


def test_helper_formulas_hand_examples():
    assert rc.price_rise_to_reach_margin(10, 8, 0.40) == pytest.approx(1 / 3)
    assert rc.cost_cut_to_reach_margin(10, 8, 0.40) == pytest.approx(0.25)
    assert rc.price_rise_to_reach_margin(10, 6, 0.40) == pytest.approx(0)       # already at 40%


def test_priority_boundaries():
    assert rc.priority_from_share(0.05) == "High"
    assert rc.priority_from_share(0.0499) == "Medium"
    assert rc.priority_from_share(0.01) == "Medium"
    assert rc.priority_from_share(0.0099) == "Low"
    assert rc.priority_from_share(0) == "Low"


def test_every_recommendation_has_all_six_parts_and_a_valid_priority(recs):
    assert len(recs) >= 8
    for c in SIX:
        assert recs[c].astype(str).str.strip().ne("").all(), c
    assert set(recs["priority"]) <= {"High", "Medium", "Low"}
    assert list(recs["rank"]) == list(range(1, len(recs) + 1))


def test_sorted_by_priority_then_urgent_first(recs):
    order = recs["priority"].map({"High": 0, "Medium": 1, "Low": 2})
    assert order.is_monotonic_increasing
    high = recs[recs["priority"] == "High"]
    assert high.iloc[0]["area"] == "Inventory" and high.iloc[1]["area"] == "Inventory"     # stockouts first
    assert {"P014", "P021"} == {s.split("(")[1].strip(")") for s in high.iloc[:2]["subject"]}


def test_stockout_numbers_follow_the_inventory_and_segment_modules(data, recs):
    df, res = data
    r = res.set_index("product_id").loc["P014"]
    unit_gp = sg.segment_products(df).set_index("product_id").loc["P014"]
    unit_gp = unit_gp["gross_profit"] / unit_gp["units_sold"]
    row = recs[recs["subject"].str.contains("P014")].iloc[0]
    assert row["est_impact"] == pytest.approx(r["shortfall_during_lead_time"] * unit_gp)
    assert f"{int(r['suggested_order_qty']):,} units" in row["action"]
    assert "promotion" in row["action"].lower()                       # warns against promotions while stock is short


def test_cross_check_no_promotion_for_a_product_at_stock_risk(data, recs):
    promo = recs[recs["area"] == "Promotion"].iloc[0]
    assert "Resistance Bands Set" in promo["evidence"] and "Left out because of stock risk" in promo["evidence"]
    seg_flags = sg.segment_products(data[0]).set_index("product_id")["flags"]
    assert "Promotion candidate" in seg_flags["P014"]                 # the segment module DID flag it
    kept_part = promo["evidence"].split("Left out")[0]
    assert "Resistance Bands" not in kept_part                         # but the engine kept it out of the promotion list


def test_excess_advice_depends_on_discount_verdict(recs):
    ex = recs[(recs["area"] == "Inventory") & recs["subject"].str.contains("products")].iloc[0]
    assert "Coffee Grinder Manual" in ex["evidence"]
    assert "no discounts" in ex["evidence"]                            # P011: discounts reduce profit
    assert ex["priority"] in ("Low", "Medium")                         # excess stock is never High


def test_no_guarantees_in_the_wording(recs):
    text = " ".join(recs[SIX].astype(str).agg(" ".join, axis=1)).lower()
    for banned in ("guarantee", "will definitely", "certainly", "for sure", "will increase", "will rise"):
        assert banned not in text


def test_without_inventory_no_inventory_recommendations(data):
    r = rc.generate_recommendations(data[0], None)
    assert not (r["area"] == "Inventory").any()
    assert (r["area"] == "Pricing and cost").any()


def test_simulated_inventory_warning_is_added(data):
    r = rc.generate_recommendations(data[0], data[1], simulated_inventory=True)
    inv_rows = r[r["area"] == "Inventory"]
    assert inv_rows["risks_assumptions"].str.contains("SIMULATED").all()
    assert not r[r["area"] == "Pricing and cost"]["risks_assumptions"].str.contains("SIMULATED").any()


def test_data_quality_recommendation_and_its_priority(data):
    df = data[0]
    r = rc.generate_recommendations(df, None, excluded_rows=60, total_rows=1000)        # 6%
    dq = r[r["area"] == "Data quality"].iloc[0]
    assert dq["priority"] == "High" and "6.0%" in dq["evidence"]
    r2 = rc.generate_recommendations(df, None, excluded_rows=20, total_rows=1000)       # 2%
    assert r2[r2["area"] == "Data quality"].iloc[0]["priority"] == "Medium"
    assert not (rc.generate_recommendations(df, None)["area"] == "Data quality").any()


def test_result_is_repeatable(data):
    a = rc.generate_recommendations(data[0], data[1])
    b = rc.generate_recommendations(data[0], data[1])
    pd.testing.assert_frame_equal(a, b)

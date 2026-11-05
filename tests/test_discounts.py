"""
Tests for src/discounts.py. Hand example (product X, price 100, cost 50):
  unit margin at list price m = 0.5
  Full-price months make 10 units: gross profit = 10 * (100-50) = 500
  Discounted months (20% off): profit per unit = 80 - 50 = 30
     20 units -> 600  (volume +100%, profit +20%)  break-even lift = 0.2/(0.5-0.2) = 66.7%
     12 units -> 360  (volume +20%,  profit -28%)
     17 units -> 510  (volume +70%,  profit +2%)
"""
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from src import discounts

DATA = Path(__file__).resolve().parent.parent / "data"


def make(units, discs, product="X", price=100.0, cost=50.0, start_id=1):
    rows = []
    for i, (u, d) in enumerate(zip(units, discs), start=1):
        rows.append({"order_id": f"{product}{start_id}-{i}", "order_date": f"2025-{i:02d}-15",
                     "product_id": product, "product_name": f"Product {product}", "category": "C",
                     "quantity": u, "list_price": price, "discount_rate": d, "unit_cost": cost})
    return pd.DataFrame(rows)


def one(df, **kw):
    return discounts.discount_effectiveness(df, adjust_seasonality=False, **kw).iloc[0]


def test_breakeven_formula():
    assert discounts.breakeven_volume_lift(0.2, 0.5) == pytest.approx(2 / 3)
    assert discounts.breakeven_volume_lift(0.0, 0.5) == 0.0
    assert np.isinf(discounts.breakeven_volume_lift(0.5, 0.4))     # discount bigger than margin
    assert np.isinf(discounts.breakeven_volume_lift(0.4, 0.4))


def test_discount_pays_off():
    r = one(make([10, 10, 10, 20, 20, 20], [0, 0, 0, .2, .2, .2]))
    assert r["months_full_price"] == 3 and r["months_discounted"] == 3
    assert r["avg_discount_when_discounted"] == pytest.approx(0.2)
    assert r["unit_margin_at_list_price"] == pytest.approx(0.5)
    assert r["volume_lift_pct"] == pytest.approx(1.0)
    assert r["breakeven_lift_pct"] == pytest.approx(2 / 3)
    assert r["gross_profit_change_pct"] == pytest.approx(0.2)
    assert r["verdict"] == "Discounts pay off"


def test_discount_reduces_profit():
    r = one(make([10, 10, 10, 12, 12, 12], [0, 0, 0, .2, .2, .2]))
    assert r["volume_lift_pct"] == pytest.approx(0.2)
    assert r["gross_profit_change_pct"] == pytest.approx(-0.28)
    assert r["verdict"] == "Discounts reduce gross profit"


def test_small_change_is_no_clear_gain():
    r = one(make([10, 10, 10, 17, 17, 17], [0, 0, 0, .2, .2, .2]))
    assert r["gross_profit_change_pct"] == pytest.approx(0.02)
    assert r["verdict"] == "No clear gain from discounts"


def test_not_enough_months():
    r = one(make([10, 10, 10, 10, 20, 20], [0, 0, 0, 0, .2, .2]))   # only 2 discounted months
    assert r["verdict"] == "Not enough data"
    assert "Need at least 3" in r["verdict_reason"]


def test_in_between_discount_months_are_left_out():
    df = make([10, 10, 10, 20, 20, 20, 15], [0, 0, 0, .2, .2, .2, .05])   # 7th month: 5% discount
    r = one(df)
    assert r["months_full_price"] == 3 and r["months_discounted"] == 3


def test_discount_larger_than_margin_never_breaks_even():
    r = one(make([10, 10, 10, 30, 30, 30], [0, 0, 0, .3, .3, .3], cost=80))   # margin 20% < discount 30%
    assert np.isinf(r["breakeven_lift_pct"])
    assert r["verdict"] == "Discounts reduce gross profit"


def test_seasonal_index():
    df = pd.concat([make([10], [0]), make([30], [0], product="Y")])   # month 2025-01 total = 40
    df2 = make([10, 30], [0, 0])                                      # monthly totals 10 and 30
    idx = discounts.seasonal_index(df2)
    assert list(idx) == pytest.approx([0.5, 1.5])


def test_seasonality_adjustment_removes_market_wide_busy_months():
    """X and Y both double in months 4-6 (a busy season). Only X is discounted.
    Without adjustment X looks like volume +100%; with adjustment the lift is 0."""
    units = [10, 10, 10, 20, 20, 20]
    x = make(units, [0, 0, 0, .2, .2, .2], product="X")
    y = make(units, [0] * 6, product="Y", price=10, cost=5)
    df = pd.concat([x, y], ignore_index=True)
    raw = discounts.discount_effectiveness(df, adjust_seasonality=False).set_index("product_id")
    adj = discounts.discount_effectiveness(df, adjust_seasonality=True).set_index("product_id")
    assert raw.loc["X", "volume_lift_pct"] == pytest.approx(1.0)
    assert adj.loc["X", "volume_lift_pct"] == pytest.approx(0.0)


def test_input_not_modified():
    df = make([10, 10, 10, 20, 20, 20], [0, 0, 0, .2, .2, .2])
    before = df.copy()
    discounts.discount_effectiveness(df)
    pd.testing.assert_frame_equal(df, before)


def test_demo_data_matches_planted_discount_stories():
    r = discounts.discount_effectiveness(pd.read_csv(DATA / "sales.csv")).set_index("product_id")
    assert r.loc["P008", "verdict"] == "Discounts pay off"              # planted: discount works
    for pid in ["P020", "P023", "P004", "P012"]:                         # planted: discount fails / thin margin
        assert r.loc[pid, "verdict"] == "Discounts reduce gross profit", pid
    assert np.isinf(r.loc["P004", "breakeven_lift_pct"])                 # discount larger than 12% margin
    assert set(r["verdict"]) <= {"Discounts pay off", "Discounts reduce gross profit",
                                 "No clear gain from discounts", "Not enough data"}

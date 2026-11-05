"""
Tests for src/simulator.py. Hand example (product X: price 100, cost 50, 10 units, no discount):
  baseline  : gross sales 1000, net revenue 1000, COGS 500, gross profit 500, margin 50%
  20% discount, volume +100%  : 20 units, gross sales 2000, discount 400, net 1600, COGS 1000, profit 600, margin 37.5%
                                break-even units = 500 / (80 - 50) = 16.67
  price +10%, volume -10%     : price 110, 9 units, net 990, COGS 450, profit 540
  cost +20% (cost 60)         : profit per unit 40 -> 10 units give profit 400
"""
import numpy as np
import pandas as pd
import pytest
from src import simulator as sim
from src import kpis


def make(product="X", units=(5, 5), price=100.0, cost=50.0, disc=0.0):
    rows = [{"order_id": f"{product}{i}", "order_date": f"2025-0{i + 1}-10", "product_id": product,
             "product_name": f"Product {product}", "category": "C", "quantity": u,
             "list_price": price, "discount_rate": disc, "unit_cost": cost} for i, u in enumerate(units)]
    return pd.DataFrame(rows)


def test_no_change_reproduces_the_observed_baseline():
    df = make()
    r = sim.simulate(df)
    assert r["baseline"] == pytest.approx(r["scenario"])
    assert r["baseline"]["gross_profit"] == pytest.approx(500)
    assert r["change"]["gross_profit"] == pytest.approx(0)


def test_baseline_matches_kpi_module_on_real_demo_data():
    df = pd.read_csv("data/sales.csv", dtype={"order_id": str, "product_id": str}, parse_dates=["order_date"])
    r = sim.simulate(df)
    s = kpis.summary_kpis(kpis.add_calculated_columns(df))
    assert r["baseline"]["net_revenue"] == pytest.approx(s["net_revenue"])
    assert r["baseline"]["gross_profit"] == pytest.approx(s["gross_profit"])
    assert r["baseline"]["units"] == s["units_sold"]
    assert r["scenario"]["gross_profit"] == pytest.approx(s["gross_profit"])


def test_discount_with_volume_lift_hand_example():
    r = sim.simulate(make(), discount_rate=0.2, volume_change=1.0)
    s = r["scenario"]
    assert s["units"] == pytest.approx(20)
    assert s["gross_sales"] == pytest.approx(2000)
    assert s["discount_amount"] == pytest.approx(400)
    assert s["net_revenue"] == pytest.approx(1600)
    assert s["cogs"] == pytest.approx(1000)
    assert s["gross_profit"] == pytest.approx(600)
    assert s["gross_margin_pct"] == pytest.approx(0.375)
    assert r["breakeven_units"] == pytest.approx(500 / 30)
    assert r["change"]["gross_profit"] == pytest.approx(0.2)


def test_price_increase_with_volume_loss():
    s = sim.simulate(make(), price_change=0.10, volume_change=-0.10)["scenario"]
    assert s["units"] == pytest.approx(9)
    assert s["net_revenue"] == pytest.approx(990)
    assert s["cogs"] == pytest.approx(450)
    assert s["gross_profit"] == pytest.approx(540)


def test_cost_increase():
    r = sim.simulate(make(), cost_change=0.20)
    assert r["scenario"]["gross_profit"] == pytest.approx(400)
    assert r["breakeven_units"] == pytest.approx(500 / 40)


def test_discount_bigger_than_margin_can_never_break_even():
    r = sim.simulate(make(), discount_rate=0.6)           # 100 x 0.4 = 40 < cost 50
    assert np.isinf(r["breakeven_units"])
    assert np.isinf(r["by_product"]["breakeven_units"].iloc[0])
    assert r["scenario"]["gross_profit"] < 0


def test_observed_discount_is_kept_when_none_is_given():
    df = make(disc=0.10)
    r = sim.simulate(df, volume_change=0.5)
    assert r["scenario"]["discount_amount"] == pytest.approx(1500 * 0.10)


def test_product_selection_and_totals_add_up():
    df = pd.concat([make("A"), make("B", price=200, cost=100)], ignore_index=True)
    all_ = sim.simulate(df, volume_change=0.1)
    only_b = sim.simulate(df, volume_change=0.1, product_ids=["B"])
    assert len(all_["by_product"]) == 2 and len(only_b["by_product"]) == 1
    assert all_["scenario"]["gross_profit"] == pytest.approx(all_["by_product"]["scenario_gross_profit"].sum())
    assert only_b["baseline"]["gross_profit"] == pytest.approx(1000)


def test_invalid_inputs_are_rejected():
    df = make()
    with pytest.raises(ValueError):
        sim.simulate(df, discount_rate=1.0)
    with pytest.raises(ValueError):
        sim.simulate(df, discount_rate=-0.1)
    with pytest.raises(ValueError):
        sim.simulate(df, volume_change=-1.0)
    with pytest.raises(ValueError):
        sim.simulate(df, price_change=-1.5)
    with pytest.raises(ValueError):
        sim.simulate(df, product_ids=["nope"])


def test_implied_volume_change_from_elasticity():
    assert sim.implied_volume_change(100, 80, -1.5) == pytest.approx(0.8 ** -1.5 - 1)   # about +39.8%
    assert sim.implied_volume_change(100, 100, -1.5) == pytest.approx(0)
    assert sim.implied_volume_change(100, 110, 0) == pytest.approx(0)                    # nobody reacts
    with pytest.raises(ValueError):
        sim.implied_volume_change(0, 80, -1.5)

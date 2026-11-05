"""
Tests for src/inventory.py. Hand examples (product X, lead time L = 10 days, 90 days of sales ending 2025-03-31):

Steady demand: 10 units every day  -> d = 10, std = 0, safety stock 0, reorder point 100, order-up-to 10 x (10+30) = 400
    stock  50 -> 5 days < 10          -> Stockout risk, shortfall 100-50 = 50, suggested order 350
    stock 150 -> 15 days, above ROP   -> OK, no order
    stock 1000 -> 100 days > 90       -> Excess stock, excess units 1000 - 10 x 90 = 100

Alternating demand 5, 15, 5, 15 ...  -> d = 10, std = sqrt(90 x 25 / 89) = 5.028
    safety stock = 1.645 x 5.028 x sqrt(10) = 26.2, reorder point = 126.2
    stock 110 -> 11 days >= 10 but 110 <= 126.2 -> Reorder now, order = ceil(10 x 40 + 26.2 - 110)
"""
from math import ceil, sqrt
from statistics import NormalDist

import numpy as np
import pandas as pd
import pytest
from src import inventory as inv

Z95 = NormalDist().inv_cdf(0.95)


def sales(daily, product="X", days=90, cost=5.0):
    dates = pd.date_range("2025-01-01", periods=days)
    rows = [{"order_id": f"{product}{i}", "order_date": dt, "product_id": product, "product_name": f"Product {product}",
             "category": "C", "quantity": daily(i), "list_price": 10.0, "discount_rate": 0.0, "unit_cost": cost}
            for i, dt in enumerate(dates) if daily(i) > 0]
    return pd.DataFrame(rows)


def stock_table(stock, lead=10, product="X"):
    return pd.DataFrame({"product_id": [product], "current_stock": [stock], "lead_time_days": [lead]})


def row(df, stock, **kw):
    return inv.analyze_inventory(df, stock_table(stock), **kw).iloc[0]


STEADY = sales(lambda i: 10)
ALT = sales(lambda i: 5 if i % 2 == 0 else 15)


def test_demand_statistics():
    st = inv.demand_stats(ALT, 90).iloc[0]
    assert st["avg_daily_demand"] == pytest.approx(10)
    assert st["std_daily_demand"] == pytest.approx(sqrt(90 * 25 / 89))
    assert inv.demand_stats(STEADY, 90).iloc[0]["std_daily_demand"] == pytest.approx(0)


def test_days_without_sales_count_as_zero():
    every_other_day = sales(lambda i: 10 if i % 2 == 0 else 0, days=91)   # 91 days so the last day has a sale
    assert inv.demand_stats(every_other_day, 90).iloc[0]["avg_daily_demand"] == pytest.approx(5)


def test_window_shorter_than_data_uses_only_recent_days():
    df = sales(lambda i: 1 if i < 60 else 10)                  # last 30 days: 10 per day
    assert inv.demand_stats(df, 30).iloc[0]["avg_daily_demand"] == pytest.approx(10)


def test_stockout_risk_hand_example():
    r = row(STEADY, 50)
    assert r["status"] == inv.STOCKOUT
    assert r["days_of_stock"] == pytest.approx(5)
    assert r["shortfall_during_lead_time"] == pytest.approx(50)
    assert r["reorder_point"] == pytest.approx(100)
    assert r["order_up_to_level"] == pytest.approx(400)
    assert r["suggested_order_qty"] == 350


def test_ok_and_excess_hand_examples():
    ok = row(STEADY, 150)
    assert ok["status"] == inv.OK and ok["suggested_order_qty"] == 0
    ex = row(STEADY, 1000)
    assert ex["status"] == inv.EXCESS
    assert ex["excess_units"] == pytest.approx(100)
    assert ex["excess_value"] == pytest.approx(100 * 5.0)          # 100 units x $5 average cost


def test_reorder_now_uses_safety_stock():
    r = row(ALT, 110)
    ss = Z95 * sqrt(90 * 25 / 89) * sqrt(10)
    assert r["safety_stock"] == pytest.approx(ss)
    assert r["reorder_point"] == pytest.approx(100 + ss)
    assert r["status"] == inv.REORDER
    assert r["suggested_order_qty"] == ceil(10 * 40 + ss - 110)


def test_higher_service_level_means_more_safety_stock():
    assert row(ALT, 200, service_level=0.99)["safety_stock"] > row(ALT, 200, service_level=0.90)["safety_stock"]


def test_status_boundaries():
    assert row(STEADY, 100)["status"] == inv.REORDER               # exactly at the reorder point
    assert row(STEADY, 99.0)["status"] == inv.STOCKOUT             # 9.9 days < 10-day lead time
    assert row(STEADY, 900)["status"] == inv.OK                    # exactly 90 days, not above threshold
    assert row(STEADY, 901)["status"] == inv.EXCESS


def test_no_recent_sales_is_not_divided_by_zero():
    # X sold only in the first 10 days; Y keeps selling, so the data runs to day 90 and X has nothing in the last 30
    both = pd.concat([sales(lambda i: 10 if i < 10 else 0, days=90), sales(lambda i: 10, product="Y")])
    r = inv.analyze_inventory(both, stock_table(40), window_days=30).set_index("product_id").loc["X"]
    assert r["status"] == inv.NO_SALES
    assert np.isinf(r["days_of_stock"])


def test_product_without_inventory_row():
    other = pd.DataFrame({"product_id": ["Z"], "current_stock": [5], "lead_time_days": [3]})
    r = inv.analyze_inventory(STEADY, other).iloc[0]
    assert r["status"] == inv.NO_INV


def test_invalid_settings_rejected():
    for kw in ({"service_level": 1.0}, {"service_level": 0.3}, {"window_days": 3},
               {"cover_days": -1}, {"excess_days": 0}):
        with pytest.raises(ValueError):
            inv.analyze_inventory(STEADY, stock_table(50), **kw)


def test_validation_finds_problems_and_never_repairs():
    bad = pd.DataFrame({"product_id": ["A", "A", "B", "C", "D", None, "E"],
                        "current_stock": [10, 20, -5, "abc", 8, 3, 4],
                        "lead_time_days": [5, 5, 5, 5, 0, 5, 7]})
    good, issues, missing = inv.validate_inventory(bad, ["A", "B", "C", "D"])
    assert missing == []
    assert list(good["product_id"]) == ["A"]                        # only the first A survives
    checks = dict(zip(issues["check"], issues["rows_affected"]))
    assert checks["Duplicate product_id (first row kept)"] == 1
    assert checks["current_stock missing, not a number or negative"] == 2
    assert checks["lead_time_days missing, not a number or not above 0"] == 1
    assert checks["Missing product_id"] == 1
    assert checks["Product not found in the sales data (ignored)"] == 1
    lines = issues.loc[issues["check"].str.startswith("current_stock"), "example_line_numbers"].iloc[0]
    assert lines == "4, 5"                                          # -5 is on line 4, "abc" on line 5 (header = line 1)


def test_validation_reports_missing_columns():
    good, issues, missing = inv.validate_inventory(pd.DataFrame({"product_id": ["A"]}), ["A"])
    assert good is None and missing == ["current_stock", "lead_time_days"]


def test_planted_stories_in_demo_data():
    s = pd.read_csv("data/sales.csv", dtype={"order_id": str, "product_id": str}, parse_dates=["order_date"])
    stock = pd.read_csv("data/inventory.csv", dtype={"product_id": str})
    good, issues, _ = inv.validate_inventory(stock, s["product_id"].unique())
    assert issues.empty and len(good) == 24
    res = inv.analyze_inventory(s, good).set_index("product_id")
    assert res.loc["P014", "status"] == inv.STOCKOUT              # planted: 5 days of cover, lead time 21
    assert res.loc["P011", "status"] == inv.EXCESS                # planted: 400 days of cover
    assert (res["suggested_order_qty"] >= 0).all()
    print(res["status"].value_counts().to_dict())

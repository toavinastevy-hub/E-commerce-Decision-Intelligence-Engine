"""
Tests for src/data_quality.py.
Small examples are checked by hand; the dirty demo file is checked against the
errors that were planted on purpose by src/generate_demo_data.py.
"""
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from src import data_quality as dq

DATA = Path(__file__).resolve().parent.parent / "data"


@pytest.fixture
def good():
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


def count(report, check_name):
    row = report.issues[report.issues["check"] == check_name]
    return 0 if row.empty else int(row["rows_affected"].iloc[0])


def test_clean_small_data_has_no_issues(good):
    r = dq.check_data_quality(good)
    assert r.ok_to_proceed and r.issues.empty and r.n_error_rows == 0


def test_missing_column_blocks_analysis(good):
    r = dq.check_data_quality(good.drop(columns=["unit_cost"]))
    assert not r.ok_to_proceed
    assert r.missing_columns == ["unit_cost"]
    with pytest.raises(ValueError):
        dq.split_valid_rows(good.drop(columns=["unit_cost"]), r)


def test_each_invalid_value_is_found(good):
    bad = good.copy()
    bad.loc[0, "quantity"] = -1            # row 0: negative quantity
    bad.loc[1, "discount_rate"] = 1.5      # row 1: discount 150%
    bad.loc[2, "list_price"] = 0           # row 2: zero price
    r = dq.check_data_quality(bad)
    assert count(r, "Quantity not a whole number above 0") == 1
    assert count(r, "Discount rate outside 0 to 1") == 1
    assert count(r, "List price not above 0") == 1
    assert r.n_error_rows == 3


def test_non_numeric_and_fractional_quantity(good):
    bad = good.copy()
    bad["quantity"] = bad["quantity"].astype(object)
    bad.loc[0, "quantity"] = "abc"
    bad.loc[1, "quantity"] = 1.5
    r = dq.check_data_quality(bad)
    assert count(r, "Quantity not a whole number above 0") == 2


def test_missing_value_is_error_but_missing_label_is_warning(good):
    bad = good.copy()
    bad.loc[0, "unit_cost"] = np.nan
    bad.loc[1, "product_name"] = np.nan
    r = dq.check_data_quality(bad)
    assert count(r, "Missing value: unit_cost") == 1
    assert count(r, "Missing label: product_name") == 1
    assert r.n_error_rows == 1             # only the missing cost row is an error


def test_invalid_date(good):
    bad = good.copy()
    bad.loc[0, "order_date"] = "2025-13-45"
    r = dq.check_data_quality(bad)
    assert count(r, "Invalid date") == 1


def test_duplicates_warn_but_are_kept(good):
    dup = pd.concat([good, good.iloc[[0]]], ignore_index=True)
    r = dq.check_data_quality(dup)
    assert count(r, "Duplicate rows") == 1
    assert r.n_error_rows == 0
    valid, excluded = dq.split_valid_rows(dup, r)
    assert len(valid) == 4 and len(excluded) == 0     # nothing deleted silently


def test_cost_above_price_and_inconsistent_ids(good):
    bad = good.copy()
    bad.loc[0, "unit_cost"] = 50                     # cost 50 > price 10
    bad.loc[2, "product_name"] = "Different"         # P1 now has two names
    r = dq.check_data_quality(bad)
    assert count(r, "Unit cost above list price") == 1
    assert count(r, "Product ID with several names or categories") == 2


def test_order_with_two_dates(good):
    bad = good.copy()
    bad.loc[1, "order_date"] = "2025-01-06"          # order A now has 2 dates
    r = dq.check_data_quality(bad)
    assert count(r, "Order ID with several dates") == 2


def test_split_does_not_invent_or_lose_rows(good):
    bad = good.copy()
    bad.loc[0, "quantity"] = -1
    r = dq.check_data_quality(bad)
    valid, excluded = dq.split_valid_rows(bad, r)
    assert len(valid) + len(excluded) == len(bad)
    assert len(excluded) == 1 and excluded["quantity"].iloc[0] == -1   # original kept
    assert valid["quantity"].dtype.kind == "i"
    assert str(valid["order_date"].dtype).startswith("datetime64")


def test_input_is_not_modified(good):
    bad = good.copy(); bad.loc[0, "quantity"] = -1
    before = bad.copy()
    dq.check_data_quality(bad)
    pd.testing.assert_frame_equal(bad, before)


def test_clean_demo_file_has_only_the_three_natural_duplicates():
    r = dq.check_data_quality(pd.read_csv(DATA / "sales.csv"))
    assert r.n_error_rows == 0
    assert list(r.issues["check"]) == ["Duplicate rows"]
    assert count(r, "Duplicate rows") == 3


def test_dirty_demo_file_finds_every_planted_error():
    """Planted: 10 missing cost, 8 missing name, 12 bad quantity (8 negative + 4 zero),
    4 discount 150%, 4 zero price, 4 bad date, 4 cost 1.8x price, 10 appended duplicates."""
    r = dq.check_data_quality(pd.read_csv(DATA / "sales_dirty.csv"))
    assert count(r, "Missing value: unit_cost") == 10
    assert count(r, "Missing label: product_name") == 8
    assert count(r, "Quantity not a whole number above 0") == 12
    assert count(r, "Discount rate outside 0 to 1") == 4
    assert count(r, "List price not above 0") == 4
    assert count(r, "Invalid date") == 4
    assert count(r, "Unit cost above list price") == 4
    assert count(r, "Duplicate rows") == 13            # 10 planted + 3 natural
    assert r.n_error_rows == 34                         # 10 + 12 + 4 + 4 + 4

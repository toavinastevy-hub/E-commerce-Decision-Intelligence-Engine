"""
Tests for the Excel template (src/make_template.py) and its reader (src/excel_io.py).

What is checked
  * The template has the right sheets, exact column names, filters, a frozen header and fill-in rules that match
    the data quality rules of the app (so Excel and the app never disagree about what is valid).
  * The row_check formulas have balanced brackets (an unbalanced formula makes Excel report a damaged file).
  * The reader turns Excel dates, numeric codes and blank rows into what the quality check expects, and keeps the
    original row numbers (index + 2 = Excel row).
  * Round trip: the demo data typed into the template, read back and analysed gives the same totals as the CSV
    (net revenue 852,007.95, 13,589 rows, 2 stockout risks).
Limit: automated tests cannot press keys in Excel. The fill-in rules and the row_check results were also checked by
hand in LibreOffice; see docs/validation_report.md.
"""
import datetime as dt
import io

import pandas as pd
import pytest
from openpyxl import Workbook, load_workbook

from src import data_quality as dq, excel_io, inventory as iv, kpis
from src.make_template import build_template
from tests.conftest import fill_sheet

D = dt.date


@pytest.fixture(scope="module")
def small(tmp_path_factory):
    p = tmp_path_factory.mktemp("small") / "t.xlsx"
    build_template(str(p), rows=60)
    return p


def dvs(ws):
    return {str(dv.sqref).split(":")[0].rstrip("0123456789"): dv for dv in ws.data_validations.dataValidation}


# ---------------- template structure ----------------
def test_sheets_headers_filters_and_frozen_header(small):
    wb = load_workbook(small)
    assert wb.sheetnames == ["Read me first", "Sales", "Inventory", "Example"]
    s, i = wb["Sales"], wb["Inventory"]
    assert [c.value for c in s[1]] == excel_io.SALES_COLUMNS + ["row_check"]
    assert [c.value for c in i[1]] == excel_io.INVENTORY_COLUMNS + ["row_check"]
    assert s.freeze_panes == "A2" and i.freeze_panes == "A2"
    assert s.auto_filter.ref == "A1:J61" and i.auto_filter.ref == "A1:D2001"


def test_template_columns_match_the_data_quality_rules():
    assert set(excel_io.SALES_COLUMNS) == set(dq.REQUIRED_COLUMNS)
    assert set(excel_io.SALES_REQUIRED) == set(dq.ERROR_IF_MISSING)


def test_required_and_optional_headers_look_different(small):
    s = load_workbook(small)["Sales"]
    required = {s.cell(1, k).fill.start_color.rgb[-6:] for k, n in enumerate(excel_io.SALES_COLUMNS, 1) if n in excel_io.SALES_REQUIRED}
    optional = {s.cell(1, k).fill.start_color.rgb[-6:] for k, n in enumerate(excel_io.SALES_COLUMNS, 1) if n not in excel_io.SALES_REQUIRED}
    assert required == {"4F46E5"} and optional == {"64748B"}


def test_fill_in_rules_match_the_app_rules(small):
    v = dvs(load_workbook(small)["Sales"])
    assert (v["B"].type, v["B"].operator) == ("date", "between")
    assert (v["F"].type, v["F"].operator, v["F"].formula1) == ("whole", "greaterThanOrEqual", "1")           # whole number, 1 or more
    assert (v["G"].type, v["G"].operator, v["G"].formula1) == ("decimal", "greaterThan", "0")               # price above 0
    assert (v["H"].type, v["H"].operator, v["H"].formula1, v["H"].formula2) == ("decimal", "between", "0", "1")
    assert (v["I"].type, v["I"].operator, v["I"].formula1) == ("decimal", "greaterThanOrEqual", "0")        # cost 0 or more
    for col in "ABCDEFGHI":
        assert v[col].showErrorMessage and v[col].showInputMessage and v[col].prompt and v[col].error, col
    inv = dvs(load_workbook(small)["Inventory"])
    assert (inv["B"].type, inv["B"].operator, inv["B"].formula1) == ("decimal", "greaterThanOrEqual", "0")
    assert (inv["C"].type, inv["C"].operator, inv["C"].formula1) == ("decimal", "greaterThan", "0")
    assert inv["A"].type == "custom" and inv["A"].errorStyle == "warning"
    assert "COUNTIF(Sales!" in inv["A"].formula1


def test_prompts_and_errors_respect_excel_length_limits(small):
    wb = load_workbook(small)
    for ws in (wb["Sales"], wb["Inventory"]):
        for dv in ws.data_validations.dataValidation:
            assert len(dv.promptTitle) <= 32 and len(dv.errorTitle) <= 32
            assert len(dv.prompt) <= 255 and len(dv.error) <= 255


def test_highlighting_rules_and_check_formulas_exist_for_every_row(small):
    wb = load_workbook(small)
    s, i = wb["Sales"], wb["Inventory"]
    assert sum(len(cf.rules) for cf in s.conditional_formatting) == 8     # 7 red 'required cell empty' rules + 1 amber cost rule
    for sheet, col, last in ((s, 10, 61), (i, 4, 2001)):
        for r in (2, last):
            f = sheet.cell(r, col).value
            assert f.startswith("=IF(") and f.count("(") == f.count(")"), (sheet.title, r)       # balanced brackets
        assert sheet.cell(last + 1, col).value is None            # no formula beyond the last ready row


def test_example_sheet_is_clearly_marked_and_not_the_sales_sheet(small):
    ex = load_workbook(small)["Example"]
    assert any("EXAMPLE ONLY" in str(c.value) for row in ex.iter_rows() for c in row if c.value)


# ---------------- the reader ----------------
def filled(path, tmp_path, rows):
    wb = load_workbook(path)
    fill_sheet(wb["Sales"], rows)
    out = tmp_path / "f.xlsx"
    wb.save(out)
    return out


ROWS = [("O1", D(2026, 3, 1), "P1", "Mug", "Home", 2, 12.5, 0.10, 6.0),              # Excel row 2
        ("O2", dt.datetime(2026, 3, 2, 14, 30), 1001.0, None, None, 1, 20, 0, 11),   # row 3: float code, date with time
        ("O3", "15/03/2026", "P3", "Cream", "Beauty", 1, 18, 0, 7.5),                # row 4: date typed as text
        None,                                                                         # row 5: blank
        ("O4", D(2026, 3, 5), 55, "Cap", "Fashion", 3, 20, 0.05, 11.0)]               # row 6: numeric code


def test_reader_converts_dates_and_codes_and_drops_blank_rows(small, tmp_path):
    df = excel_io.read_sales_workbook(filled(small, tmp_path, ROWS))
    assert len(df) == 4 and "row_check" not in df.columns
    assert list(df.index + 2) == [2, 3, 4, 6]                                         # original Excel row numbers kept
    assert list(df["product_id"]) == ["P1", "1001", "P3", "55"]                       # never "1001.0"
    assert df.loc[0, "order_date"] == "2026-03-01" and df.loc[1, "order_date"] == "2026-03-02"
    assert df.loc[2, "order_date"] == "15/03/2026"                                    # text date passed on to be reported


def test_quality_check_reports_the_right_excel_row(small, tmp_path):
    df = excel_io.read_sales_workbook(filled(small, tmp_path, ROWS))
    rep = dq.check_data_quality(df)
    assert rep.ok_to_proceed and rep.n_error_rows == 1
    line = rep.issues[rep.issues["check"] == "Invalid date"].iloc[0]
    assert line["example_row_numbers"] == "4"                                         # row 4 in Excel
    valid, excluded = dq.split_valid_rows(df, rep)
    assert len(valid) == 3 and list(excluded["order_id"]) == ["O3"]


def test_blank_template_gives_a_plain_message(small):
    with pytest.raises(ValueError, match="no data rows"):
        excel_io.read_sales_workbook(small)


def test_missing_sales_sheet_and_single_sheet_workbook(tmp_path):
    wb = Workbook()
    wb.active.title = "Orders"
    wb.create_sheet("Notes")
    p = tmp_path / "two.xlsx"
    wb.save(p)
    with pytest.raises(ValueError, match="No sheet named 'Sales'.*Orders, Notes"):
        excel_io.read_sales_workbook(p)
    wb2 = Workbook()
    ws = wb2.active
    ws.title = "My data"
    ws.append(excel_io.SALES_COLUMNS)
    ws.append(["O1", D(2026, 1, 2), "P1", "Mug", "Home", 1, 10, 0, 5])
    p2 = tmp_path / "one.xlsx"
    wb2.save(p2)
    assert len(excel_io.read_sales_workbook(p2)) == 1                                 # a single sheet is used whatever its name


def test_file_that_is_not_excel_gives_a_plain_message(tmp_path):
    bad = tmp_path / "bad.xlsx"
    bad.write_bytes(b"this is not a workbook")
    with pytest.raises(ValueError, match="could not be opened"):
        excel_io.read_sales_workbook(bad)


def test_inventory_reader(small, tmp_path):
    assert excel_io.read_inventory_workbook(small) is None                            # empty sheet is fine when optional
    with pytest.raises(ValueError, match="no data rows"):
        excel_io.read_inventory_workbook(small, strict=True)
    wb = load_workbook(small)
    fill_sheet(wb["Inventory"], [("P1", 120, 14), (1001.0, 5, 7), None, ("P3", 30, 10)])
    p = tmp_path / "inv.xlsx"
    wb.save(p)
    inv = excel_io.read_inventory_workbook(p)
    assert list(inv["product_id"]) == ["P1", "1001", "P3"] and "row_check" not in inv.columns
    assert list(inv.index + 2) == [2, 3, 5]
    good, issues, missing = iv.validate_inventory(inv, ["P1", "1001", "P3"])
    assert missing == [] and issues.empty and len(good) == 3


def test_uploaded_file_objects_can_be_read_twice():
    class Upload:                                           # behaves like Streamlit's uploaded file: bytes only
        def __init__(self, data): self._d = data
        def getvalue(self): return self._d
    wb = Workbook()
    wb.active.title = "Sales"
    wb.active.append(excel_io.SALES_COLUMNS)
    wb.active.append(["O1", D(2026, 1, 2), "P1", "Mug", "Home", 1, 10, 0, 5])
    wb.create_sheet("Inventory").append(excel_io.INVENTORY_COLUMNS)
    wb["Inventory"].append(["P1", 5, 3])
    buf = io.BytesIO()
    wb.save(buf)
    up = Upload(buf.getvalue())
    assert len(excel_io.read_sales_workbook(up)) == 1 and len(excel_io.read_inventory_workbook(up)) == 1


# ---------------- round trip with the demo data ----------------
def test_demo_data_through_the_excel_template_matches_the_csv(demo_workbook_path):
    df = excel_io.read_sales_workbook(demo_workbook_path)
    rep = dq.check_data_quality(df)
    assert rep.ok_to_proceed and rep.n_error_rows == 0 and len(df) == 13589
    valid, _ = dq.split_valid_rows(df, rep)
    csv = pd.read_csv("data/sales.csv", dtype={"order_id": str, "product_id": str}, parse_dates=["order_date"])
    a = kpis.summary_kpis(kpis.add_calculated_columns(valid))
    b = kpis.summary_kpis(kpis.add_calculated_columns(csv))
    for k in ("net_revenue", "gross_profit", "orders", "units_sold"):
        assert a[k] == pytest.approx(b[k]), k
    assert a["net_revenue"] == pytest.approx(852007.95, abs=0.01)
    stock = excel_io.read_inventory_workbook(demo_workbook_path)
    good, issues, _ = iv.validate_inventory(stock, valid["product_id"].unique())
    res = iv.analyze_inventory(valid, good)
    assert issues.empty and (res["status"] == iv.STOCKOUT).sum() == 2

# Lets the tests find the 'src' folder.
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


# ---------- shared helpers for the Excel template tests ----------
import datetime as _dt
import pandas as _pd
import pytest as _pytest


def fill_sheet(ws, rows, start_row=2):
    """Write a list of tuples into a worksheet; None means leave that row blank."""
    for i, row in enumerate(rows, start=start_row):
        if row is None:
            continue
        for j, v in enumerate(row, start=1):
            if v is not None:
                ws.cell(row=i, column=j, value=v)


@_pytest.fixture(scope="session")
def demo_workbook_path(tmp_path_factory):
    """The real demo sales (13,589 rows) and demo stock typed into the Excel template."""
    from openpyxl import load_workbook
    from src.make_template import build_template
    path = tmp_path_factory.mktemp("xl") / "demo_filled.xlsx"
    build_template(str(path), rows=14000)
    wb = load_workbook(path)
    sales = _pd.read_csv("data/sales.csv")
    ws = wb["Sales"]
    for i, r in enumerate(sales.itertuples(index=False), start=2):
        ws.cell(row=i, column=1, value=r.order_id)
        ws.cell(row=i, column=2, value=_dt.datetime.strptime(r.order_date, "%Y-%m-%d"))
        ws.cell(row=i, column=3, value=r.product_id)
        ws.cell(row=i, column=4, value=r.product_name)
        ws.cell(row=i, column=5, value=r.category)
        ws.cell(row=i, column=6, value=int(r.quantity))
        ws.cell(row=i, column=7, value=float(r.list_price))
        ws.cell(row=i, column=8, value=float(r.discount_rate))
        ws.cell(row=i, column=9, value=float(r.unit_cost))
    inv = _pd.read_csv("data/inventory.csv")
    fill_sheet(wb["Inventory"], [tuple(x) for x in inv.itertuples(index=False)])
    wb.save(path)
    return path

"""
excel_io.py  -  Reads the EDIE Excel template (or any workbook that follows its layout)

LAYOUT EXPECTED
    Sheet "Sales"      (required)  row 1 = the column names, one order line per row below it
    Sheet "Inventory"  (optional)  row 1 = product_id, current_stock, lead_time_days
    A column called "row_check" (the template's automatic check) is ignored.
    If the workbook has only ONE sheet, that sheet is used even if it has another name.

WHAT THIS MODULE DOES, AND DOES NOT DO
    * It only READS. Values are never corrected, filled in or guessed.
    * Completely empty rows (the template has thousands of ready-made empty rows) are dropped.
      The original row position is kept, so a message such as "row 57" matches row 57 in Excel.
    * Excel dates are turned into text YYYY-MM-DD so that the normal data quality check judges them.
      Text typed instead of a real date is passed on unchanged and is reported as an error there.
    * Product and order codes stored by Excel as numbers (1001) become text ("1001"), never "1001.0".
    * All other judging (missing values, wrong numbers, duplicates ...) is done by data_quality.py,
      so a workbook is held to exactly the same rules as a CSV file.
"""
import io

import pandas as pd

SALES_SHEET = "Sales"
INVENTORY_SHEET = "Inventory"
SALES_COLUMNS = ["order_id", "order_date", "product_id", "product_name", "category",
                 "quantity", "list_price", "discount_rate", "unit_cost"]
SALES_REQUIRED = ["order_id", "order_date", "product_id", "quantity", "list_price", "discount_rate", "unit_cost"]
INVENTORY_COLUMNS = ["product_id", "current_stock", "lead_time_days"]


def _open(file):
    """Open a path or an uploaded file (Streamlit upload objects can only be read once, so copy the bytes)."""
    if hasattr(file, "getvalue"):
        file = io.BytesIO(file.getvalue())
    try:
        return pd.ExcelFile(file, engine="openpyxl")
    except Exception as exc:
        raise ValueError(f"The file could not be opened as an Excel (.xlsx) workbook: {exc}") from exc


def _find_sheet(names, wanted):
    for n in names:
        if n.strip().lower() == wanted.lower():
            return n
    return None


def _is_blank(v):
    return pd.isna(v) or (isinstance(v, str) and v.strip() == "")


def _code(v):
    """Excel numbers used as codes: 1001 and 1001.0 both become '1001'."""
    if _is_blank(v):
        return v
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def _iso_date(v):
    if _is_blank(v):
        return v
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    return v                                   # typed text: left as it is, the quality check reports it


def _tidy(df, key_columns):
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    df = df[[c for c in df.columns if not c.lower().startswith("row_check") and not c.startswith("Unnamed:")]]
    present = [c for c in key_columns if c in df.columns]
    if present:
        used = df[present].apply(lambda s: s.map(lambda v: not _is_blank(v))).any(axis=1)
        df = df[used]                          # the index is kept on purpose: index + 2 = the Excel row number
    return df


def read_sales_workbook(file):
    """Return the sales table from the 'Sales' sheet. Raises ValueError with a plain message if impossible."""
    xl = _open(file)
    sheet = _find_sheet(xl.sheet_names, SALES_SHEET)
    if sheet is None and len(xl.sheet_names) == 1:
        sheet = xl.sheet_names[0]
    if sheet is None:
        raise ValueError(f"No sheet named '{SALES_SHEET}' was found. The sheets in this file are: "
                         + ", ".join(xl.sheet_names) + ".")
    df = _tidy(xl.parse(sheet, dtype=object), SALES_REQUIRED)
    if df.empty:
        raise ValueError(f"The '{sheet}' sheet has no data rows yet. Fill it in below the column names and try again.")
    for c in ("order_id", "product_id"):
        if c in df.columns:
            df[c] = df[c].map(_code)
    if "order_date" in df.columns:
        df["order_date"] = df["order_date"].map(_iso_date)
    return df


def read_inventory_workbook(file, strict=False):
    """Return the stock table from the 'Inventory' sheet, or None when there is no stock data.

    strict=True is used when the person uploads a workbook on the Inventory page: then a missing or empty
    sheet is an error with a clear message instead of None.
    """
    xl = _open(file)
    sheet = _find_sheet(xl.sheet_names, INVENTORY_SHEET)
    if sheet is None and len(xl.sheet_names) == 1:
        sheet = xl.sheet_names[0]
    if sheet is None:
        if strict:
            raise ValueError(f"No sheet named '{INVENTORY_SHEET}' was found. The sheets in this file are: "
                             + ", ".join(xl.sheet_names) + ".")
        return None
    df = _tidy(xl.parse(sheet, dtype=object), INVENTORY_COLUMNS)
    if df.empty:
        if strict:
            raise ValueError(f"The '{sheet}' sheet has no data rows yet.")
        return None
    if "product_id" in df.columns:
        df["product_id"] = df["product_id"].map(_code)
    return df

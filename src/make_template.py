"""
make_template.py  -  Builds the EDIE Excel data template

    python src/make_template.py                      creates templates/EDIE_data_template.xlsx (30,000 sales rows ready)
    python src/make_template.py my_file.xlsx 5000    custom path and number of ready rows

SHEETS
    Read me first   instructions, column guide, colour legend (not read by the app)
    Sales           the data to fill in. READ BY THE APP. Row 1 holds the exact column names.
    Inventory       optional stock levels. READ BY THE APP.
    Example         a few made-up rows to copy the style from (not read by the app)

BUILT-IN HELP IN THE SALES AND INVENTORY SHEETS
    * Fill-in rules (Excel "data validation"): a date must be a real date, quantity a whole number of 1 or more,
      price above 0, discount between 0% and 100%, cost 0 or more. A message appears when a cell is selected,
      and a wrong value is refused when typed.
    * Red cells: a required cell is empty in a row that has other data.   Amber cell: cost is above the price.
    * Last column "row_check": says OK or what to fix. The app ignores this column.
    * Filter arrows on every header (for example, filter row_check to anything that is not OK).
    * The header row stays visible while scrolling.

LIMIT: Excel does NOT apply fill-in rules to pasted values. The red cells and row_check column still work on
pasted data, and the app runs the full quality check again on upload.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # lets "python src/make_template.py" find the project

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from src.excel_io import SALES_COLUMNS, INVENTORY_COLUMNS, SALES_REQUIRED

INDIGO, SLATE, GREEN, PALE = "4F46E5", "64748B", "059669", "EEF2FF"
RED_FILL = PatternFill(start_color="FECACA", end_color="FECACA", fill_type="solid")
AMBER_FILL = PatternFill(start_color="FDE68A", end_color="FDE68A", fill_type="solid")
THIN = Side(style="thin", color="D1D5DB")

# column: (width, number format, what to enter, rule shown when the cell is selected, example)
SALES_GUIDE = {
    "order_id":      (14, "@", "The order number. Use the same number on every row of the same order.", "Required. Any text or number. Not empty.", "O1001"),
    "order_date":    (14, "yyyy-mm-dd", "The day the order was placed.", "Required. A real date, for example 2026-03-15.", "2026-03-15"),
    "product_id":    (13, "@", "Your product code. The same product must always have the same code.", "Required. Any text or number. Not empty.", "P01"),
    "product_name":  (26, "@", "The product name shown in the reports.", "Optional, but reports show a blank name without it.", "Coffee Mug"),
    "category":      (18, "@", "The product group, for example Home, Fashion, Beauty.", "Optional, but charts by group need it.", "Home"),
    "quantity":      (11, "General", "How many items of this product were in this order line.", "Required. A whole number, 1 or more. Returns are not supported.", "2"),
    "list_price":    (13, "#,##0.00", "The normal selling price of ONE item, before any discount.", "Required. A number above 0. No currency symbol.", "12.50"),
    "discount_rate": (14, "0.0%", "The discount given on this line. Type 10 or 10% for ten percent.", "Required. Between 0% and 100%. Type 0 when there is no discount.", "10%"),
    "unit_cost":     (12, "#,##0.00", "What ONE item costs you (purchase or production cost).", "Required. A number of 0 or more. No currency symbol.", "6.00"),
}
INVENTORY_GUIDE = {
    "product_id":     (14, "@", "The product code, exactly as in the Sales sheet.", "Required. One row per product. Must exist in the Sales sheet.", "P01"),
    "current_stock":  (15, "General", "How many items you have in stock on the last date of your sales data.", "Required. A number of 0 or more.", "120"),
    "lead_time_days": (16, "General", "Days between placing an order with your supplier and receiving the goods.", "Required. A number above 0.", "14"),
}


def _header(ws, columns, guide, required):
    for i, name in enumerate(columns, start=1):
        c = ws.cell(row=1, column=i, value=name)
        c.font = Font(bold=True, color="FFFFFF", size=11)
        c.fill = PatternFill("solid", start_color=INDIGO if name in required else SLATE)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
        width, fmt, what, rule, example = guide[name]
        note = Comment(f"{name}\n{what}\n{rule}\nExample: {example}", "EDIE")
        note.width, note.height = 300, 130
        c.comment = note
        ws.column_dimensions[get_column_letter(i)].width = max(width, len(name) + 4)
        ws.column_dimensions[get_column_letter(i)].number_format = fmt
    ws.row_dimensions[1].height = 30
    ws.freeze_panes = "A2"


def _check_header(ws, col, text="row_check"):
    c = ws.cell(row=1, column=col, value=text)
    c.font = Font(bold=True, color="FFFFFF")
    c.fill = PatternFill("solid", start_color=GREEN)
    c.alignment = Alignment(horizontal="center", vertical="center")
    c.comment = Comment("Automatic check of the row. Do not type here. The app ignores this column.\n"
                        "Filter it to anything that is not OK to find rows to fix.", "EDIE")
    ws.column_dimensions[get_column_letter(col)].width = 36
    ws.column_dimensions[get_column_letter(col)].number_format = "General"


def _validation(ws, rng, prompt_title, prompt, error_title, error, **kwargs):
    dv = DataValidation(allow_blank=True, showErrorMessage=True, showInputMessage=True,
                        promptTitle=prompt_title[:32], prompt=prompt[:255],
                        errorTitle=error_title[:32], error=error[:255], **kwargs)
    ws.add_data_validation(dv)
    dv.add(rng)


def _sales_check_formula(r):
    """Nested IFs that never raise an Excel error, whatever is typed in the cells."""
    return (f'=IF(COUNTA(A{r}:I{r})=0,"",'
            f'IF(COUNTA(A{r}:C{r},F{r}:I{r})<7,"Fill all required cells",'
            f'IF(NOT(ISNUMBER(B{r})),"Date is not a real date",'
            f'IF(NOT(ISNUMBER(F{r})),"Quantity must be a whole number, 1 or more",'
            f'IF(OR(F{r}<1,F{r}<>INT(F{r})),"Quantity must be a whole number, 1 or more",'
            f'IF(NOT(ISNUMBER(G{r})),"List price must be above 0",'
            f'IF(G{r}<=0,"List price must be above 0",'
            f'IF(NOT(ISNUMBER(H{r})),"Discount must be between 0% and 100%",'
            f'IF(OR(H{r}<0,H{r}>1),"Discount must be between 0% and 100%",'
            f'IF(NOT(ISNUMBER(I{r})),"Unit cost must be 0 or more",'
            f'IF(I{r}<0,"Unit cost must be 0 or more",'
            f'IF(I{r}>G{r},"Cost is above price - check","OK"))))))))))))')


def _inventory_check_formula(r, last_sales):
    return (f'=IF(COUNTA(A{r}:C{r})=0,"",'
            f'IF(COUNTA(A{r}:C{r})<3,"Fill all three cells",'
            f'IF(NOT(ISNUMBER(B{r})),"Stock must be a number of 0 or more",'
            f'IF(B{r}<0,"Stock must be a number of 0 or more",'
            f'IF(NOT(ISNUMBER(C{r})),"Lead time must be above 0",'
            f'IF(C{r}<=0,"Lead time must be above 0",'
            f'IF(COUNTIF($A$2:$A$2001,A{r})>1,"Duplicate product_id",'
            f'IF(COUNTIF(Sales!$C$2:$C${last_sales},A{r})=0,"Product not found in the Sales sheet","OK"))))))))')


def _sales_sheet(wb, rows):
    ws = wb.create_sheet("Sales")
    last = rows + 1
    _header(ws, SALES_COLUMNS, SALES_GUIDE, SALES_REQUIRED)
    _check_header(ws, 10)
    for r in range(2, last + 1):
        c = ws.cell(row=r, column=10, value=_sales_check_formula(r))
        c.font = Font(italic=True, color="6B7280")
    rng = lambda col: f"{col}2:{col}{last}"
    _validation(ws, rng("A"), "order_id", "Order number. Same number on every line of one order.", "Order number missing",
                "Please type the order number.", type="textLength", operator="greaterThan", formula1="0")
    _validation(ws, rng("B"), "order_date", "A real date, for example 2026-03-15.", "Not a valid date",
                "Type a real date such as 2026-03-15 (not text, and not a date before the year 2000).",
                type="date", operator="between", formula1="DATE(2000,1,1)", formula2="DATE(2100,12,31)")
    _validation(ws, rng("C"), "product_id", "Your product code. Same code for the same product every time.", "Product code missing",
                "Please type the product code.", type="textLength", operator="greaterThan", formula1="0")
    _validation(ws, rng("D"), "product_name", "Optional. The name shown in the reports.", "Name too long",
                "Please use 200 characters or fewer.", type="textLength", operator="lessThanOrEqual", formula1="200")
    _validation(ws, rng("E"), "category", "Optional. The product group, e.g. Home or Fashion.", "Category too long",
                "Please use 100 characters or fewer.", type="textLength", operator="lessThanOrEqual", formula1="100")
    _validation(ws, rng("F"), "quantity", "Items in this order line. A whole number, 1 or more.", "Not a valid quantity",
                "Type a whole number of 1 or more. Returns (negative numbers) are not supported.",
                type="whole", operator="greaterThanOrEqual", formula1="1")
    _validation(ws, rng("G"), "list_price", "Normal price of ONE item before discount. Above 0.", "Not a valid price",
                "Type a number above 0. Do not type a currency symbol.", type="decimal", operator="greaterThan", formula1="0")
    _validation(ws, rng("H"), "discount_rate", "Type 10 or 10% for ten percent. Type 0 for no discount.", "Not a valid discount",
                "The discount must be between 0% and 100%.", type="decimal", operator="between", formula1="0", formula2="1")
    _validation(ws, rng("I"), "unit_cost", "What ONE item costs you. 0 or more.", "Not a valid cost",
                "Type a number of 0 or more. Do not type a currency symbol.", type="decimal", operator="greaterThanOrEqual", formula1="0")
    for col in "ABCFGHI":                                                       # red: required cell empty in a used row
        ws.conditional_formatting.add(rng(col), FormulaRule(formula=[f'AND(COUNTA($A2:$I2)>0,{col}2="")'], fill=RED_FILL))
    ws.conditional_formatting.add(rng("I"), FormulaRule(                         # amber: cost above price
        formula=['AND(ISNUMBER($I2),ISNUMBER($G2),$I2>$G2)'], fill=AMBER_FILL))
    ws.auto_filter.ref = f"A1:J{last}"
    return ws


def _inventory_sheet(wb, sales_rows):
    ws = wb.create_sheet("Inventory")
    last = 2001
    _header(ws, INVENTORY_COLUMNS, INVENTORY_GUIDE, INVENTORY_COLUMNS)
    _check_header(ws, 4)
    for r in range(2, last + 1):
        c = ws.cell(row=r, column=4, value=_inventory_check_formula(r, sales_rows + 1))
        c.font = Font(italic=True, color="6B7280")
    _validation(ws, f"A2:A{last}", "product_id", "One row per product. Use the same code as in the Sales sheet.",
                "Check the product code", "This code is duplicated here, or it is not in the Sales sheet yet. "
                "Fill the Sales sheet first. You can still continue.", type="custom",
                formula1=f"AND(COUNTIF($A$2:$A${last},A2)=1,COUNTIF(Sales!$C$2:$C${sales_rows + 1},A2)>0)", errorStyle="warning")
    _validation(ws, f"B2:B{last}", "current_stock", "Items in stock on the last date of your sales data. 0 or more.",
                "Not a valid stock number", "Type a number of 0 or more.", type="decimal", operator="greaterThanOrEqual", formula1="0")
    _validation(ws, f"C2:C{last}", "lead_time_days", "Days from ordering to receiving the goods. Above 0.",
                "Not a valid delivery time", "Type a number of days above 0.", type="decimal", operator="greaterThan", formula1="0")
    for col in "ABC":
        ws.conditional_formatting.add(f"{col}2:{col}{last}", FormulaRule(formula=[f'AND(COUNTA($A2:$C2)>0,{col}2="")'], fill=RED_FILL))
    ws.auto_filter.ref = f"A1:D{last}"
    return ws


def _example_sheet(wb):
    ws = wb.create_sheet("Example")
    _header(ws, SALES_COLUMNS, SALES_GUIDE, SALES_REQUIRED)
    import datetime as dt
    rows = [("O1001", dt.date(2026, 3, 15), "P01", "Coffee Mug", "Home", 2, 12.50, 0.10, 6.00),
            ("O1001", dt.date(2026, 3, 15), "P02", "Baseball Cap", "Fashion", 1, 20.00, 0, 11.00),
            ("O1002", dt.date(2026, 3, 16), "P01", "Coffee Mug", "Home", 1, 12.50, 0, 6.00),
            ("O1003", dt.date(2026, 3, 18), "P03", "Face Cream", "Beauty", 3, 18.00, 0.20, 7.50),
            ("O1004", dt.date(2026, 3, 20), "P02", "Baseball Cap", "Fashion", 2, 20.00, 0.05, 11.00)]
    for r, row in enumerate(rows, start=2):
        for c, v in enumerate(row, start=1):
            ws.cell(row=r, column=c, value=v)
    ws["A8"] = "EXAMPLE ONLY. The app does not read this sheet. Type your own data in the 'Sales' sheet."
    ws["A8"].font = Font(bold=True, color="B91C1C")
    ws["A10"] = "Inventory example (copy the style into the 'Inventory' sheet):"
    ws["A10"].font = Font(bold=True)
    for c, name in enumerate(INVENTORY_COLUMNS, start=1):
        h = ws.cell(row=11, column=c, value=name)
        h.font, h.fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", start_color=INDIGO)
    for r, row in enumerate([("P01", 120, 14), ("P02", 35, 21), ("P03", 400, 10)], start=12):
        for c, v in enumerate(row, start=1):
            ws.cell(row=r, column=c, value=v)
    return ws


def _readme_sheet(wb, rows):
    ws = wb.active
    ws.title = "Read me first"
    ws.sheet_view.showGridLines = False
    for col, w in zip("ABCDE", (22, 16, 52, 40, 16)):
        ws.column_dimensions[col].width = w
    r = 1

    def line(text, bold=False, size=11, color="1F2937", fill=None, height=None, merge=True):
        nonlocal r
        c = ws.cell(row=r, column=1, value=text)
        c.font = Font(bold=bold, size=size, color=color)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        if merge:
            ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
        if fill:
            for cc in range(1, 6):
                ws.cell(row=r, column=cc).fill = PatternFill("solid", start_color=fill)
        if height:
            ws.row_dimensions[r].height = height
        r += 1

    line("EDIE data template", True, 20, "FFFFFF", INDIGO, 36)
    line("Fill in your shop's sales (and, if you like, your stock) and upload this file in the EDIE app on the page 'Start here'. "
         "The app checks every row and tells you what to fix.", size=11, color="EEF2FF", fill=INDIGO, height=34)
    r += 1
    line("HOW TO USE IT (5 steps)", True, 13, INDIGO)
    for s in ["1.  Open the sheet 'Sales'. Each row is ONE product in ONE order (an order with three products takes three rows).",
              "2.  Type or paste your data under the column names. Do not change, move or delete row 1. Do not rename the sheets.",
              "3.  Optional: open the sheet 'Inventory' and add one row per product with its stock and delivery time. This switches on the stock check.",
              "4.  Look at the last column 'row_check'. Filter it to anything that is not OK and fix those rows. Red cells = something is missing.",
              "5.  Save the file as .xlsx and upload it on the page 'Start here' in the app (or send it to the person who will do it)."]:
        line(s, height=32)
    r += 1
    line("THE 'SALES' SHEET  (dark blue header = required, grey header = optional)", True, 13, INDIGO)
    for i, h in enumerate(["Column", "Required?", "What to enter", "Rule", "Example"], start=1):
        c = ws.cell(row=r, column=i, value=h)
        c.font, c.fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", start_color=INDIGO)
    r += 1
    for name in SALES_COLUMNS:
        width, fmt, what, rule, example = SALES_GUIDE[name]
        for i, v in enumerate([name, "Yes" if name in SALES_REQUIRED else "Optional", what, rule, example], start=1):
            c = ws.cell(row=r, column=i, value=v)
            c.alignment = Alignment(wrap_text=True, vertical="top")
            c.fill = PatternFill("solid", start_color=PALE if r % 2 else "FFFFFF")
        ws.row_dimensions[r].height = 46
        r += 1
    r += 1
    line("THE 'INVENTORY' SHEET  (optional, one row per product)", True, 13, INDIGO)
    for i, h in enumerate(["Column", "Required?", "What to enter", "Rule", "Example"], start=1):
        c = ws.cell(row=r, column=i, value=h)
        c.font, c.fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", start_color=INDIGO)
    r += 1
    for name in INVENTORY_COLUMNS:
        width, fmt, what, rule, example = INVENTORY_GUIDE[name]
        for i, v in enumerate([name, "Yes", what, rule, example], start=1):
            c = ws.cell(row=r, column=i, value=v)
            c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[r].height = 46
        r += 1
    r += 1
    line("COLOURS AND HELP INSIDE THE SHEETS", True, 13, INDIGO)
    for s in ["Click a cell in the Sales sheet and a small yellow box explains what to type. Hover over a header to read more.",
              "Excel refuses wrong values as you type (for example text instead of a date, or a discount above 100%).",
              "RED cell: a required cell is empty in a row that has other data.      AMBER cell: the cost is above the price (check it, it may be a typing mistake).",
              "IMPORTANT: Excel does not check values that you PASTE. After pasting, look at the 'row_check' column. The app also checks everything again on upload."]:
        line(s, height=32)
    r += 1
    line("WHAT THE APP DOES WITH EACH COLUMN", True, 13, INDIGO)
    for s in ["order_id, order_date: counts orders, builds the monthly trend, compares the latest 6 months with a year earlier (needs 12+ months of dates).",
              "product_id, product_name, category: groups results by product and by category.",
              "quantity, list_price, discount_rate: sales before discounts, discounts given, sales after discounts, and the discount analysis.",
              "unit_cost: profit before overheads, profit margin, product groups, price simulator.",
              "Inventory sheet: days of stock, safety buffer, reorder level, risk of running out, excess stock. Stock is assumed to be as of the LAST date in your sales data."]:
        line(s, height=32)
    r += 1
    line("GOOD TO KNOW", True, 13, INDIGO)
    for s in ["The template has room for %s sales rows. For more rows, select the last row of the Sales sheet and copy it down." % f"{rows:,}",
              "Useful results need several months of history, ideally 12 or more. Discount results need months with and without discounts for the same product.",
              "Returns and refunds (negative quantities) are not supported. Leave them out or handle them before uploading.",
              "Rows with errors are left out by the app and listed with their row number, which matches the row number in this sheet. Nothing is changed or guessed.",
              "Profit here means profit BEFORE overheads: sales after discounts minus what the products cost. Rent, staff, shipping, advertising and tax are not included.",
              "Your file is read on your own computer by the app. It is not sent anywhere."]:
        line(s, height=32)


def build_template(path, rows=30000):
    """Create the workbook at `path` with `rows` ready sales rows."""
    wb = Workbook()
    _readme_sheet(wb, rows)
    _sales_sheet(wb, rows)
    _inventory_sheet(wb, rows)
    _example_sheet(wb)
    wb.save(path)
    return path


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "templates/EDIE_data_template.xlsx"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 30000
    build_template(out, n)
    print(f"Template written to {out} ({n:,} sales rows ready)")

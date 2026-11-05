"""
data_quality.py  -  Module A: data validation and quality report

What this module does:
  1. Checks that the required columns exist.
  2. Checks every row for missing values and invalid values.
  3. Warns about duplicates and inconsistent data.
  4. Explains how each problem could affect the analysis.

Rules we follow:
  * We NEVER invent or fill in missing business data.
  * We NEVER delete rows silently. Rows with ERRORS can be separated out,
    and the report says exactly how many were excluded and why.
  * Duplicates and other WARNINGS are reported but the rows are kept; a person decides.

Severity levels:
  ERROR   - the row cannot be used in calculations.
  WARNING - the row is usable, but the result may be misleading. Review it.

Run from the project root to see a report for any file:
    python src/data_quality.py data/sales_dirty.csv
"""
from dataclasses import dataclass
import sys
import numpy as np
import pandas as pd

REQUIRED_COLUMNS = ["order_id", "order_date", "product_id", "product_name",
                    "category", "quantity", "list_price", "discount_rate", "unit_cost"]

# Missing values in these columns make a row unusable (ERROR).
# Missing product_name / category only affect labels (WARNING).
ERROR_IF_MISSING = ["order_id", "order_date", "product_id",
                    "quantity", "list_price", "discount_rate", "unit_cost"]
WARNING_IF_MISSING = ["product_name", "category"]

IMPACT = {
    "Missing required columns":
        "The analysis cannot run. Add the missing columns to the file.",
    "Missing value":
        "A missing number means the row cannot be used in revenue or profit. "
        "We do not guess it. Totals will be understated if these rows are excluded.",
    "Missing label":
        "The row still counts in totals, but it will appear under a blank name or "
        "category in product and category reports.",
    "Quantity not a whole number above 0":
        "Zero, negative, or non-numeric quantities distort units, revenue and profit. "
        "(A negative quantity may be a return, which this model does not support.)",
    "List price not above 0":
        "A zero or negative price gives zero or negative revenue and ruins margins.",
    "Discount rate outside 0 to 1":
        "A discount above 100% creates negative revenue. Discounts may have been "
        "entered as 10 instead of 0.10.",
    "Unit cost not a number of 0 or more":
        "Wrong costs change profit and margin directly.",
    "Invalid date":
        "Rows with unreadable dates cannot be placed in a month, so trends are incomplete.",
    "Duplicate rows":
        "If these are true duplicates, revenue and units are double counted. "
        "They may also be genuine repeat lines (e.g. the same item added twice), "
        "so review before removing.",
    "Unit cost above list price":
        "Either the cost is wrong, or the product is sold at a loss even before "
        "discounts. Margins for this product would look very negative.",
    "Product ID with several names or categories":
        "Product reports may split one product into several, or mix categories.",
    "Order ID with several dates":
        "One order should have one date. Trends by date may be unreliable.",
}


@dataclass
class QualityReport:
    n_rows: int
    missing_columns: list
    issues: pd.DataFrame          # one row per check that found something
    error_mask: pd.Series         # True for rows that cannot be used
    ok_to_proceed: bool

    @property
    def n_error_rows(self):
        return int(self.error_mask.sum())


def _issue(check, severity, count, examples):
    return {"check": check, "severity": severity, "rows_affected": int(count),
            "example_row_numbers": ", ".join(str(i + 2) for i in list(examples)[:5]),
            "impact": IMPACT.get(check.split(":")[0], "")}


def check_data_quality(df):
    """Run all checks. Returns a QualityReport. Does not change df."""
    missing_cols = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    empty_mask = pd.Series(False, index=df.index)
    if missing_cols:
        issues = pd.DataFrame([{
            "check": "Missing required columns", "severity": "ERROR",
            "rows_affected": len(df), "example_row_numbers": "",
            "impact": IMPACT["Missing required columns"] + " Missing: " + ", ".join(missing_cols)}])
        return QualityReport(len(df), missing_cols, issues, empty_mask, False)

    rows = []
    error_mask = pd.Series(False, index=df.index)

    def record(check, severity, mask):
        nonlocal error_mask
        if mask.sum() > 0:
            rows.append(_issue(check, severity, mask.sum(), df.index[mask]))
            if severity == "ERROR":
                error_mask = error_mask | mask

    # 1. Missing values (one line per column so the user sees where)
    for col in ERROR_IF_MISSING:
        record(f"Missing value: {col}", "ERROR", df[col].isna() | (df[col].astype(str).str.strip() == ""))
    for col in WARNING_IF_MISSING:
        record(f"Missing label: {col}", "WARNING", df[col].isna() | (df[col].astype(str).str.strip() == ""))

    # 2. Invalid values. Non-numbers become NaN here ONLY for checking; df is untouched.
    qty = pd.to_numeric(df["quantity"], errors="coerce")
    price = pd.to_numeric(df["list_price"], errors="coerce")
    disc = pd.to_numeric(df["discount_rate"], errors="coerce")
    cost = pd.to_numeric(df["unit_cost"], errors="coerce")
    dates = pd.to_datetime(df["order_date"], errors="coerce", format="%Y-%m-%d")

    # Invalid = a value is present but wrong (missing values are reported above)
    record("Quantity not a whole number above 0", "ERROR",
           df["quantity"].notna() & ~((qty > 0) & (qty == np.floor(qty))))
    record("List price not above 0", "ERROR", df["list_price"].notna() & ~(price > 0))
    record("Discount rate outside 0 to 1", "ERROR",
           df["discount_rate"].notna() & ~((disc >= 0) & (disc <= 1)))
    record("Unit cost not a number of 0 or more", "ERROR", df["unit_cost"].notna() & ~(cost >= 0))
    record("Invalid date", "ERROR", df["order_date"].notna() & dates.isna())

    # 3. Warnings: rows are usable but may mislead
    record("Duplicate rows", "WARNING", df.duplicated(keep="first"))
    record("Unit cost above list price", "WARNING", (price > 0) & (cost > price) & cost.notna())

    names_per_id = df.groupby("product_id")[["product_name", "category"]].nunique()
    bad_ids = names_per_id[(names_per_id > 1).any(axis=1)].index
    record("Product ID with several names or categories", "WARNING", df["product_id"].isin(bad_ids))

    dates_per_order = df.assign(_d=dates).groupby("order_id")["_d"].nunique()
    bad_orders = dates_per_order[dates_per_order > 1].index
    record("Order ID with several dates", "WARNING", df["order_id"].isin(bad_orders))

    issues = pd.DataFrame(rows, columns=["check", "severity", "rows_affected",
                                         "example_row_numbers", "impact"])
    return QualityReport(len(df), [], issues, error_mask, True)


def split_valid_rows(df, report):
    """Separate rows with ERRORS. Returns (valid_df, excluded_df).

    valid_df has proper data types. Nothing is filled in or changed except the
    type conversion. excluded_df keeps the original rows so nothing is lost.
    Warning rows (e.g. duplicates) stay in valid_df.
    """
    if not report.ok_to_proceed:
        raise ValueError("Required columns are missing; cannot split rows.")
    excluded = df[report.error_mask].copy()
    valid = df[~report.error_mask].copy()
    valid["quantity"] = pd.to_numeric(valid["quantity"]).astype(int)
    for c in ["list_price", "discount_rate", "unit_cost"]:
        valid[c] = pd.to_numeric(valid[c])
    valid["order_date"] = pd.to_datetime(valid["order_date"], format="%Y-%m-%d")
    return valid.reset_index(drop=True), excluded


def format_report(report):
    """Plain-text version of the report (also used in the terminal)."""
    lines = ["DATA QUALITY REPORT", "=" * 60, f"Rows in file: {report.n_rows}"]
    if report.missing_columns:
        lines.append("STOP: missing columns: " + ", ".join(report.missing_columns))
        return "\n".join(lines)
    lines.append(f"Rows with ERRORS (cannot be used): {report.n_error_rows}")
    lines.append(f"Rows usable: {report.n_rows - report.n_error_rows}")
    if report.issues.empty:
        lines.append("No problems found.")
    for _, r in report.issues.iterrows():
        lines += ["", f"[{r['severity']}] {r['check']}: {r['rows_affected']} rows",
                  f"   Example line numbers in the CSV file (header = line 1): {r['example_row_numbers']}",
                  f"   Why it matters: {r['impact']}"]
    return "\n".join(lines)


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/sales.csv"
    print(format_report(check_data_quality(pd.read_csv(path))))

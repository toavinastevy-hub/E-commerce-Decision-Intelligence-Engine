"""
sql_check.py
Loads data/sales.csv into a SQLite database (data/edie.db), runs the SQL in
sql/01_totals_check.sql, and compares the result with reference numbers.
Run from the project root:   python src/sql_check.py
"""
import sqlite3
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "edie.db"

# Reference numbers calculated earlier with a separate pandas calculation
EXPECTED = {
    "order_lines": 13589, "orders": 9132, "units_sold": 22716,
    "gross_sales": 949197.00, "discount_amount": 97189.05,
    "net_revenue": 852007.95, "cogs": 527086.48, "gross_profit": 324921.47,
}

def main():
    sales = pd.read_csv(ROOT / "data" / "sales.csv")
    con = sqlite3.connect(DB)
    sales.to_sql("sales", con, if_exists="replace", index=False)
    query = (ROOT / "sql" / "01_totals_check.sql").read_text()
    result = pd.read_sql_query(query, con).iloc[0]
    con.close()

    print("Check of SQL results against reference numbers")
    print("-" * 62)
    all_ok = True
    for name, expected in EXPECTED.items():
        actual = float(result[name])
        ok = abs(actual - expected) < 0.02      # allow 2 cents rounding
        all_ok &= ok
        print(f"{name:<16} SQL: {actual:>14,.2f}   expected: {expected:>14,.2f}   {'OK' if ok else 'MISMATCH'}")
    print("-" * 62)
    print("ALL CHECKS PASSED" if all_ok else "SOME CHECKS FAILED")

if __name__ == "__main__":
    main()

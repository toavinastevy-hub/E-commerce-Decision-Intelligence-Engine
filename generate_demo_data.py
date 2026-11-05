"""
generate_demo_data.py
Creates SIMULATED demo data for the E-commerce Decision Intelligence Engine.
Run from the project root:   python src/generate_demo_data.py
Output (in the data/ folder):
    sales.csv            clean sales data (SIMULATED)
    inventory.csv        stock and lead times (SIMULATED)
    sales_dirty.csv      same data with deliberate errors, for testing Module A
"""
from pathlib import Path
import numpy as np
import pandas as pd

SEED = 42                      # fixed seed -> identical data every run
START = pd.Timestamp("2025-01-01")
N_MONTHS = 18                  # Jan 2025 - Jun 2026

# Each product: id, name, category, list_price, cost_ratio (cost / list price),
# base monthly units, monthly trend, discount response, story
# discount response = extra volume per 100% discount (0.5 = a 20% discount adds 10% volume... see below)
PRODUCTS = [
    # --- Electronics Accessories ---
    ("P001", "Wireless Earbuds Pro",     "Electronics Accessories", 80.0, 0.45, 60,  0.01, 2.5, "Star"),
    ("P002", "USB-C Fast Charger",       "Electronics Accessories", 25.0, 0.50, 90,  0.00, 2.0, "Normal"),
    ("P003", "Phone Case Premium",       "Electronics Accessories", 18.0, 0.40, 70,  0.00, 1.5, "Normal"),
    ("P004", "Bluetooth Speaker Mini",   "Electronics Accessories", 45.0, 0.88, 85,  0.00, 0.3, "BusyThin"),
    ("P005", "Laptop Stand Aluminium",   "Electronics Accessories", 40.0, 0.55, 40, -0.04, 1.0, "Declining"),
    ("P006", "Cable Organizer Set",      "Electronics Accessories", 12.0, 0.60, 15,  0.00, 1.0, "LowPerformer"),
    # --- Home & Kitchen ---
    ("P007", "Air Fryer 4L",             "Home & Kitchen",         110.0, 0.50, 35,  0.01, 2.0, "Star"),
    ("P008", "Non-stick Pan Set",        "Home & Kitchen",          65.0, 0.58, 40,  0.00, 3.5, "DiscountWorks"),
    ("P009", "Electric Kettle",          "Home & Kitchen",          35.0, 0.55, 55,  0.00, 1.5, "Normal"),
    ("P010", "Vacuum Food Container",    "Home & Kitchen",          22.0, 0.60, 45,  0.00, 1.0, "Normal"),
    ("P011", "Coffee Grinder Manual",    "Home & Kitchen",          30.0, 0.62, 30,  0.00, 1.0, "ExcessStock"),
    ("P012", "Kitchen Knife Block",      "Home & Kitchen",          75.0, 0.90, 40,  0.00, 0.3, "BusyThin"),
    # --- Fitness ---
    ("P013", "Yoga Mat Eco",             "Fitness",                 28.0, 0.45, 80,  0.00, 2.0, "Star"),
    ("P014", "Resistance Bands Set",     "Fitness",                 20.0, 0.50, 75,  0.00, 1.5, "StockoutRisk"),
    ("P015", "Adjustable Dumbbells",     "Fitness",                150.0, 0.62, 20,  0.00, 3.0, "DiscountWorks"),
    ("P016", "Jump Rope Speed",          "Fitness",                 10.0, 0.55, 50,  0.00, 1.0, "Normal"),
    ("P017", "Foam Roller",              "Fitness",                 24.0, 0.52, 45, -0.04, 1.0, "Declining"),
    ("P018", "Fitness Tracker Band",     "Fitness",                 55.0, 0.60, 12,  0.00, 1.0, "LowPerformer"),
    # --- Beauty & Care ---
    ("P019", "Vitamin C Serum",          "Beauty & Care",           32.0, 0.35, 70,  0.01, 2.0, "Star"),
    ("P020", "Hair Dryer Ionic",         "Beauty & Care",           60.0, 0.58, 30,  0.00, 0.3, "DiscountFails"),
    ("P021", "Face Moisturizer",         "Beauty & Care",           26.0, 0.40, 65,  0.00, 1.5, "StockoutRisk"),
    ("P022", "Electric Toothbrush",      "Beauty & Care",           48.0, 0.55, 35,  0.00, 1.0, "Normal"),
    ("P023", "Bath Salt Gift Set",       "Beauty & Care",           20.0, 0.60, 25,  0.00, 0.3, "DiscountFails"),
    ("P024", "Nail Care Kit",            "Beauty & Care",           15.0, 0.62, 10, -0.02, 1.0, "LowPerformer"),
]

DISCOUNT_LEVELS = [0.0, 0.05, 0.10, 0.20, 0.30]
DISCOUNT_PROBS  = [0.55, 0.12, 0.15, 0.12, 0.06]

# Seasonality by calendar month (1.0 = normal). November/December are busier.
SEASON = {1: 0.9, 2: 0.9, 3: 0.95, 4: 1.0, 5: 1.0, 6: 1.0,
          7: 0.95, 8: 0.95, 9: 1.0, 10: 1.05, 11: 1.3, 12: 1.25}


def build_sales(rng):
    rows = []
    for pid, name, cat, price, cost_ratio, base, trend, resp, story in PRODUCTS:
        for m in range(N_MONTHS):
            month_start = START + pd.DateOffset(months=m)
            days = month_start.days_in_month
            disc = rng.choice(DISCOUNT_LEVELS, p=DISCOUNT_PROBS)
            # Expected units: base x trend x season x discount lift
            lift = 1 + resp * disc * 2          # e.g. resp 3, 20% off -> +120%
            units = base * ((1 + trend) ** m) * SEASON[month_start.month] * lift
            n_lines = rng.poisson(max(units / 1.8, 0.1))
            for _ in range(n_lines):
                day = int(rng.integers(0, days))
                qty = int(rng.choice([1, 2, 3, 4], p=[0.55, 0.28, 0.12, 0.05]))
                # unit cost varies slightly (+/- 3%) to look realistic
                cost = round(price * cost_ratio * rng.uniform(0.97, 1.03), 2)
                rows.append((month_start + pd.Timedelta(days=day), pid, name, cat,
                             qty, price, float(disc), cost))
    df = pd.DataFrame(rows, columns=["order_date", "product_id", "product_name",
                                     "category", "quantity", "list_price",
                                     "discount_rate", "unit_cost"])
    df = df.sort_values("order_date").reset_index(drop=True)
    # Group lines into orders: within each date, chunks of 1-3 lines
    order_ids, counter = [], 0
    for _, grp in df.groupby("order_date", sort=True):
        i, n = 0, len(grp)
        while i < n:
            size = int(rng.choice([1, 2, 3], p=[0.6, 0.3, 0.1]))
            counter += 1
            order_ids.extend([f"O{counter:06d}"] * min(size, n - i))
            i += size
    df.insert(0, "order_id", order_ids)
    df["order_date"] = df["order_date"].dt.strftime("%Y-%m-%d")
    return df


def build_inventory(sales):
    """Stock levels set so the stories appear. Uses average monthly units in the last 3 months."""
    s = sales.copy()
    s["order_date"] = pd.to_datetime(s["order_date"])
    recent = s[s["order_date"] >= "2026-04-01"]
    monthly = recent.groupby("product_id")["quantity"].sum() / 3
    story = {p[0]: p[8] for p in PRODUCTS}
    rows = []
    for pid in monthly.index:
        daily = monthly[pid] / 30
        if story[pid] == "StockoutRisk":
            days_cover, lead = 5, 21
        elif story[pid] == "ExcessStock":
            days_cover, lead = 400, 14
        elif story[pid] == "LowPerformer":
            days_cover, lead = 150, 14
        else:
            days_cover, lead = 45, 10
        rows.append((pid, int(round(daily * days_cover)), lead))
    return pd.DataFrame(rows, columns=["product_id", "current_stock", "lead_time_days"])


def build_dirty(sales, rng):
    d = sales.copy()
    d["order_date"] = d["order_date"].astype(object)
    idx = rng.choice(d.index, size=60, replace=False)
    d.loc[idx[:10], "unit_cost"] = np.nan                 # missing cost
    d.loc[idx[10:18], "product_name"] = np.nan            # missing name
    d.loc[idx[18:26], "quantity"] = -2                    # negative quantity
    d.loc[idx[26:30], "quantity"] = 0                     # zero quantity
    d.loc[idx[30:34], "discount_rate"] = 1.5              # 150% discount
    d.loc[idx[34:38], "list_price"] = 0                   # zero price
    d.loc[idx[38:42], "order_date"] = "2025-13-45"        # impossible date
    d.loc[idx[42:46], "unit_cost"] = d.loc[idx[42:46], "list_price"] * 1.8  # cost far above price
    dupes = d.loc[idx[46:56]]                             # exact duplicate rows
    d = pd.concat([d, dupes], ignore_index=True)
    return d


def main():
    rng = np.random.default_rng(SEED)
    out = Path(__file__).resolve().parent.parent / "data"
    out.mkdir(exist_ok=True)
    sales = build_sales(rng)
    inv = build_inventory(sales)
    dirty = build_dirty(sales, np.random.default_rng(SEED + 1))
    sales.to_csv(out / "sales.csv", index=False)
    inv.to_csv(out / "inventory.csv", index=False)
    dirty.to_csv(out / "sales_dirty.csv", index=False)
    print("SIMULATED DATA created in:", out)
    print("sales.csv rows:", len(sales), "| inventory.csv rows:", len(inv),
          "| sales_dirty.csv rows:", len(dirty))


if __name__ == "__main__":
    main()

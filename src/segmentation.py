"""
segmentation.py  -  Module C: Product performance and segmentation

Every product gets ONE main segment (from revenue and margin) plus up to three
FLAGS (decline, promotion candidate, price/cost review). Every label comes with
the rule and the actual numbers behind it, so nothing is a black box.

DEFINITIONS (thresholds can be changed by the user)
    High revenue     : product net revenue >= the MEDIAN product net revenue
    Portfolio margin : total gross profit / total net revenue (all products)
    Healthy margin   : product gross margin >= portfolio margin
    Low margin       : product gross margin < low_margin_floor (default 20%)

MAIN SEGMENTS (first matching rule wins)
    1. Star              : high revenue AND healthy margin
    2. Busy but thin     : high revenue AND low margin
    3. Core volume       : high revenue AND margin between the two limits
    4. Niche             : NOT high revenue AND healthy margin
    5. Low performer     : NOT high revenue AND margin below portfolio margin

FLAGS (a product can have several)
    Declining sales      : units in the latest 6 months are at least 15% below the
                           same 6 months one year earlier (year on year, so normal
                           seasonality is not mistaken for decline).
                           Needs 12+ months of data; otherwise trend is "n/a".
    Promotion candidate  : NOT high revenue AND healthy margin AND NOT declining.
                           It earns well per unit but sells little, so there is
                           room to grow it. Check the discount analysis before
                           using discounts. Declining products are excluded on
                           purpose: find out WHY sales fall before spending on promotion.
    Price/cost review    : margin below the low-margin floor. Either the price is
                           too low or the cost is too high.

LIMITATIONS
    * Rules use relative thresholds (median, portfolio margin), so segments
      always compare products with each other, not with an outside benchmark.
    * Gross margin ignores fixed costs, shipping, marketing and tax.
    * A short history means trends are unreliable.
    * Trend compares units, so a recent discount campaign can make a product look
      like it is growing. Read the trend together with the discount analysis.
"""
import numpy as np
import pandas as pd
from src.kpis import kpis_by, safe_divide, summary_kpis

STAR = "Star"
THIN = "Busy but thin"
CORE = "Core volume"
NICHE = "Niche"
LOW = "Low performer"


def product_trends(df, window_months=6):
    """Units in the latest window vs the same window one year earlier.

    Returns a table with product_id, units_recent, units_prior_year, trend_pct.
    trend_pct is NaN when the data does not reach back far enough or the earlier units are 0.
    """
    d = df.copy()
    d["order_date"] = pd.to_datetime(d["order_date"])
    end = d["order_date"].max()
    recent_start = end.to_period("M").to_timestamp() - pd.DateOffset(months=window_months - 1)
    prior_end = end - pd.DateOffset(years=1)
    prior_start = recent_start - pd.DateOffset(years=1)
    have_history = d["order_date"].min() <= prior_start

    recent = d[(d["order_date"] >= recent_start) & (d["order_date"] <= end)]
    prior = d[(d["order_date"] >= prior_start) & (d["order_date"] <= prior_end)]
    out = pd.DataFrame({"product_id": d["product_id"].unique()}).set_index("product_id")
    out["units_recent"] = recent.groupby("product_id")["quantity"].sum()
    out["units_prior_year"] = prior.groupby("product_id")["quantity"].sum()
    out = out.fillna(0)
    if have_history:
        out["trend_pct"] = [safe_divide(r - p, p) for r, p in zip(out["units_recent"], out["units_prior_year"])]
    else:
        out["trend_pct"] = np.nan
    return out.reset_index()


def segment_products(df, low_margin_floor=0.20, decline_threshold=-0.15):
    """One row per product with segment, flags and the reasons behind them."""
    prod = kpis_by(df, ["product_id", "product_name", "category"])
    portfolio_margin = summary_kpis(df)["gross_margin_pct"]
    median_rev = prod["net_revenue"].median()
    prod = prod.merge(product_trends(df), on="product_id", how="left")

    segs, rules, flags_list, flag_reasons = [], [], [], []
    for _, r in prod.iterrows():
        m = r["gross_margin_pct"]
        high_rev = r["net_revenue"] >= median_rev
        healthy = pd.notna(m) and m >= portfolio_margin
        low_m = pd.notna(m) and m < low_margin_floor
        rev_txt = f"revenue ${r['net_revenue']:,.0f} vs median ${median_rev:,.0f}"
        mar_txt = "margin n/a" if pd.isna(m) else f"margin {m:.1%} vs portfolio {portfolio_margin:.1%}"

        if high_rev and healthy:
            seg, why = STAR, f"High revenue ({rev_txt}) and healthy margin ({mar_txt})."
        elif high_rev and low_m:
            seg, why = THIN, f"High revenue ({rev_txt}) but margin below the {low_margin_floor:.0%} floor ({mar_txt})."
        elif high_rev:
            seg, why = CORE, f"High revenue ({rev_txt}); margin is moderate ({mar_txt})."
        elif healthy:
            seg, why = NICHE, f"Revenue below median ({rev_txt}) but healthy margin ({mar_txt})."
        else:
            seg, why = LOW, f"Revenue below median ({rev_txt}) and margin below portfolio ({mar_txt})."

        flags, reasons = [], []
        t = r["trend_pct"]
        if pd.notna(t) and t <= decline_threshold:
            flags.append("Declining sales")
            reasons.append(f"Units latest 6 months {t:+.0%} vs same months last year ({int(r['units_recent'])} vs {int(r['units_prior_year'])}).")
        is_declining = "Declining sales" in flags
        if (not high_rev) and healthy and not is_declining:
            flags.append("Promotion candidate")
            reasons.append("Healthy margin but below-median revenue: room to grow volume.")
        if low_m:
            flags.append("Price/cost review")
            reasons.append(f"Margin {m:.1%} is below the {low_margin_floor:.0%} floor.")
        segs.append(seg); rules.append(why)
        flags_list.append(", ".join(flags)); flag_reasons.append(" ".join(reasons))

    prod["segment"], prod["segment_rule"] = segs, rules
    prod["flags"], prod["flag_reasons"] = flags_list, flag_reasons
    return prod.sort_values("net_revenue", ascending=False).reset_index(drop=True)

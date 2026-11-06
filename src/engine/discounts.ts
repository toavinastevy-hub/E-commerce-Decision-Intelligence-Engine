import { SalesRow, DiscountProductResult } from '../types';
import { addCalculatedColumns } from './kpis';
import { safeDivide } from './helpers';

export function breakevenVolumeLift(discountRate: number, unitMarginPctOfList: number): number {
  if (discountRate <= 0) return 0.0;
  if (unitMarginPctOfList <= discountRate) return Infinity;
  return discountRate / (unitMarginPctOfList - discountRate);
}

export function calculateSeasonalIndex(rows: SalesRow[]): Map<string, number> {
  const monthTotals = new Map<string, number>();
  for (const r of rows) {
    const month = r.order_date.substring(0, 7);
    monthTotals.set(month, (monthTotals.get(month) || 0) + r.quantity);
  }

  let totalAll = 0;
  for (const val of monthTotals.values()) {
    totalAll += val;
  }
  const mean = monthTotals.size > 0 ? totalAll / monthTotals.size : 1;

  const result = new Map<string, number>();
  for (const [month, val] of monthTotals.entries()) {
    result.set(month, mean > 0 ? val / mean : 1);
  }
  return result;
}

export function discountEffectiveness(
  rows: SalesRow[],
  adjustSeasonality = true,
  minMonths = 3,
  fullPriceBelow = 0.05,
  discountedFrom = 0.10,
  verdictThreshold = 0.05
): DiscountProductResult[] {
  const withCalc = rows.length > 0 && rows[0].gross_profit !== undefined ? rows : addCalculatedColumns(rows);
  const seasonalIdx = calculateSeasonalIndex(withCalc);

  // Group by product_id and month
  const pmMap = new Map<string, Map<string, {
    units: number;
    gross_sales: number;
    discount_amount: number;
    cogs: number;
    gross_profit: number;
  }>>();

  const productNames = new Map<string, string>();

  for (const r of withCalc) {
    const pid = r.product_id;
    const month = r.order_date.substring(0, 7);
    if (!productNames.has(pid)) {
      productNames.set(pid, r.product_name);
    }
    if (!pmMap.has(pid)) {
      pmMap.set(pid, new Map());
    }
    const monthMap = pmMap.get(pid)!;
    if (!monthMap.has(month)) {
      monthMap.set(month, {
        units: 0,
        gross_sales: 0,
        discount_amount: 0,
        cogs: 0,
        gross_profit: 0
      });
    }
    const cur = monthMap.get(month)!;
    cur.units += r.quantity;
    cur.gross_sales += r.gross_sales || 0;
    cur.discount_amount += r.discount_amount || 0;
    cur.cogs += r.cogs || 0;
    cur.gross_profit += r.gross_profit || 0;
  }

  const results: DiscountProductResult[] = [];

  for (const [pid, monthMap] of pmMap.entries()) {
    let totalGs = 0;
    let totalCogs = 0;

    const fullMonths: { unitsAdj: number; gpAdj: number }[] = [];
    const discMonths: { unitsAdj: number; gpAdj: number; discAmt: number; gs: number }[] = [];

    for (const [month, data] of monthMap.entries()) {
      totalGs += data.gross_sales;
      totalCogs += data.cogs;

      const effDiscount = data.gross_sales > 0 ? data.discount_amount / data.gross_sales : 0;
      const idx = adjustSeasonality ? (seasonalIdx.get(month) || 1) : 1;
      const unitsAdj = data.units / idx;
      const gpAdj = data.gross_profit / idx;

      if (effDiscount < fullPriceBelow) {
        fullMonths.push({ unitsAdj, gpAdj });
      } else if (effDiscount >= discountedFrom) {
        discMonths.push({
          unitsAdj,
          gpAdj,
          discAmt: data.discount_amount,
          gs: data.gross_sales
        });
      }
    }

    const unitMargin = 1 - safeDivide(totalCogs, totalGs);
    const sumDiscGs = discMonths.reduce((acc, m) => acc + m.gs, 0);
    const sumDiscAmt = discMonths.reduce((acc, m) => acc + m.discAmt, 0);
    const avgDisc = discMonths.length > 0 ? safeDivide(sumDiscAmt, sumDiscGs) : null;

    const enough = fullMonths.length >= minMonths && discMonths.length >= minMonths;

    let verdict: DiscountProductResult['verdict'] = 'Not enough data';
    let verdict_reason = `Need at least ${minMonths} full-price and ${minMonths} discounted months; found ${fullMonths.length} and ${discMonths.length}.`;
    let u_full: number | undefined;
    let u_disc: number | undefined;
    let lift: number | null = null;
    let p_full: number | undefined;
    let p_disc: number | undefined;
    let gp_change: number | null = null;
    let need: number | null = null;

    if (enough) {
      u_full = fullMonths.reduce((acc, m) => acc + m.unitsAdj, 0) / fullMonths.length;
      u_disc = discMonths.reduce((acc, m) => acc + m.unitsAdj, 0) / discMonths.length;
      p_full = fullMonths.reduce((acc, m) => acc + m.gpAdj, 0) / fullMonths.length;
      p_disc = discMonths.reduce((acc, m) => acc + m.gpAdj, 0) / discMonths.length;

      lift = u_full > 0 ? safeDivide(u_disc - u_full, u_full) : 0;
      gp_change = p_full !== 0 ? safeDivide(p_disc - p_full, p_full) : 0;
      need = avgDisc !== null ? breakevenVolumeLift(avgDisc, unitMargin) : null;

      if (p_full === 0 || isNaN(gp_change)) {
        verdict = 'Not enough data';
        verdict_reason = 'Full-price profit is zero or missing.';
      } else if (gp_change > verdictThreshold) {
        verdict = 'Discounts pay off';
      } else if (gp_change < -verdictThreshold) {
        verdict = 'Discounts reduce profit';
      } else {
        verdict = 'No clear gain from discounts';
      }

      if (verdict !== 'Not enough data' && need !== null) {
        const needTxt = !isFinite(need) ? 'never (discount >= unit margin)' : `${(need * 100).toFixed(0)}%`;
        const liftSign = (lift || 0) > 0 ? '+' : '';
        const gpSign = (gp_change || 0) > 0 ? '+' : '';
        verdict_reason = `Volume changed ${liftSign}${((lift || 0) * 100).toFixed(0)}% in discounted months (needed ${needTxt} to break even); gross profit per month changed ${gpSign}${((gp_change || 0) * 100).toFixed(0)}%.`;
      }
    }

    results.push({
      product_id: pid,
      product_name: productNames.get(pid) || pid,
      months_full_price: fullMonths.length,
      months_discounted: discMonths.length,
      avg_discount_when_discounted: avgDisc,
      unit_margin_at_list_price: unitMargin,
      avg_units_full_price: u_full,
      avg_units_discounted: u_disc,
      volume_lift_pct: lift,
      avg_gross_profit_full_price: p_full,
      avg_gross_profit_discounted: p_disc,
      gross_profit_change_pct: gp_change,
      breakeven_lift_pct: need,
      verdict,
      verdict_reason
    });
  }

  return results.sort((a, b) => a.product_name.localeCompare(b.product_name));
}

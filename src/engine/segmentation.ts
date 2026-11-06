import { SalesRow, SegmentedProduct, ProductTrend } from '../types';
import { kpisByProduct, summaryKpis } from './kpis';
import { safeDivide } from './helpers';

export const STAR = 'Star';
export const THIN = 'Busy but thin';
export const CORE = 'Core volume';
export const NICHE = 'Niche';
export const LOW = 'Low performer';

export function calculateProductTrends(rows: SalesRow[], windowMonths = 6): Map<string, ProductTrend> {
  if (rows.length === 0) return new Map();

  let minDate = rows[0].order_date;
  let maxDate = rows[0].order_date;
  for (const r of rows) {
    if (r.order_date < minDate) minDate = r.order_date;
    if (r.order_date > maxDate) maxDate = r.order_date;
  }

  const [maxYear, maxMonth] = maxDate.split('-').map(Number);
  const endPeriodYear = maxYear;
  const endPeriodMonth = maxMonth; // 1-12

  // Recent start is (windowMonths - 1) months back from endPeriod
  // E.g. end is 2026-06, 6 months window -> 2026-01 to 2026-06
  let recentStartMonth = endPeriodMonth - (windowMonths - 1);
  let recentStartYear = endPeriodYear;
  while (recentStartMonth <= 0) {
    recentStartMonth += 12;
    recentStartYear -= 1;
  }
  const recentStartStr = `${recentStartYear}-${String(recentStartMonth).padStart(2, '0')}-01`;

  // Prior window is 1 year before recent window
  const priorStartYear = recentStartYear - 1;
  const priorStartStr = `${priorStartYear}-${String(recentStartMonth).padStart(2, '0')}-01`;
  const priorEndYear = endPeriodYear - 1;
  const priorEndDay = maxDate.substring(8, 10);
  const priorEndStr = `${priorEndYear}-${String(endPeriodMonth).padStart(2, '0')}-${priorEndDay}`;

  const haveHistory = minDate <= priorStartStr;

  const recentUnits = new Map<string, number>();
  const priorUnits = new Map<string, number>();

  for (const r of rows) {
    const d = r.order_date;
    const pid = r.product_id;
    if (d >= recentStartStr && d <= maxDate) {
      recentUnits.set(pid, (recentUnits.get(pid) || 0) + r.quantity);
    }
    if (d >= priorStartStr && d <= priorEndStr) {
      priorUnits.set(pid, (priorUnits.get(pid) || 0) + r.quantity);
    }
  }

  const out = new Map<string, ProductTrend>();
  const allProductIds = new Set(rows.map(r => r.product_id));

  for (const pid of allProductIds) {
    const rUnit = recentUnits.get(pid) || 0;
    const pUnit = priorUnits.get(pid) || 0;
    let trend_pct: number | null = null;
    if (haveHistory && pUnit > 0) {
      trend_pct = (rUnit - pUnit) / pUnit;
    }
    out.set(pid, {
      product_id: pid,
      units_recent: rUnit,
      units_prior_year: pUnit,
      trend_pct
    });
  }

  return out;
}

export function segmentProducts(
  rows: SalesRow[],
  lowMarginFloor = 0.20,
  declineThreshold = -0.15
): SegmentedProduct[] {
  const prod = kpisByProduct(rows);
  if (prod.length === 0) return [];

  const summary = summaryKpis(rows);
  const portfolioMargin = summary.gross_margin_pct;

  // Calculate median net revenue
  const revs = prod.map(p => p.net_revenue).sort((a, b) => a - b);
  const mid = Math.floor(revs.length / 2);
  const medianRev = revs.length % 2 !== 0 ? revs[mid] : (revs[mid - 1] + revs[mid]) / 2;

  const trends = calculateProductTrends(rows);

  const result: SegmentedProduct[] = prod.map(p => {
    const pid = p.product_id!;
    const m = p.gross_margin_pct;
    const highRev = p.net_revenue >= medianRev;
    const healthy = m >= portfolioMargin;
    const lowM = m < lowMarginFloor;

    const revTxt = `revenue $${Math.round(p.net_revenue).toLocaleString('en-US')} vs median $${Math.round(medianRev).toLocaleString('en-US')}`;
    const marTxt = `margin ${(m * 100).toFixed(1)}% vs portfolio ${(portfolioMargin * 100).toFixed(1)}%`;

    let segment: SegmentedProduct['segment'];
    let segment_rule: string;

    if (highRev && healthy) {
      segment = STAR;
      segment_rule = `High revenue (${revTxt}) and healthy margin (${marTxt}).`;
    } else if (highRev && lowM) {
      segment = THIN;
      segment_rule = `High revenue (${revTxt}) but margin below the ${(lowMarginFloor * 100).toFixed(0)}% floor (${marTxt}).`;
    } else if (highRev) {
      segment = CORE;
      segment_rule = `High revenue (${revTxt}); margin is moderate (${marTxt}).`;
    } else if (healthy) {
      segment = NICHE;
      segment_rule = `Revenue below median (${revTxt}) but healthy margin (${marTxt}).`;
    } else {
      segment = LOW;
      segment_rule = `Revenue below median (${revTxt}) and margin below portfolio (${marTxt}).`;
    }

    const flags: string[] = [];
    const reasons: string[] = [];

    const trend = trends.get(pid);
    const t = trend?.trend_pct ?? null;
    if (t !== null && t <= declineThreshold) {
      flags.push('Declining sales');
      const sign = t > 0 ? '+' : '';
      reasons.push(
        `Units latest 6 months ${sign}${(t * 100).toFixed(0)}% vs same months last year (${trend?.units_recent ?? 0} vs ${trend?.units_prior_year ?? 0}).`
      );
    }

    const isDeclining = flags.includes('Declining sales');
    if (!highRev && healthy && !isDeclining) {
      flags.push('Promotion candidate');
      reasons.push('Healthy margin but below-median revenue: room to grow volume.');
    }

    if (lowM) {
      flags.push('Price/cost review');
      reasons.push(`Margin ${(m * 100).toFixed(1)}% is below the ${(lowMarginFloor * 100).toFixed(0)}% floor.`);
    }

    const unit_gp = safeDivide(p.gross_profit, p.units_sold);

    return {
      ...p,
      units_recent: trend?.units_recent ?? 0,
      units_prior_year: trend?.units_prior_year ?? 0,
      trend_pct: t,
      segment,
      segment_rule,
      flags: flags.join(', '),
      flag_reasons: reasons.join(' '),
      unit_gp
    };
  });

  return result.sort((a, b) => b.net_revenue - a.net_revenue);
}

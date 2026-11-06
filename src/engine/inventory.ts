import { SalesRow, InventoryRow, InventoryAnalysisResult, InventoryAnalysisRow, QualityIssue } from '../types';
import { addCalculatedColumns } from './kpis';
import { safeDivide } from './helpers';

export const STOCKOUT = 'Stockout risk';
export const REORDER = 'Reorder now';
export const EXCESS = 'Excess stock';
export const OK = 'OK';
export const NO_SALES = 'No recent sales';
export const NO_INV = 'No inventory data';

// Inverse standard normal CDF (quantile function) using Beasley-Springer-Moro algorithm
export function normalInvCdf(p: number): number {
  if (p <= 0 || p >= 1) {
    throw new RangeError('Probability must be between 0 and 1 exclusive.');
  }

  // Rational approximation for central region
  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.383577518672690e2,
    -3.066479806614716e1,
    2.506628277459239e0
  ];
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1
  ];
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838e0,
    -2.549732539343734e0,
    4.374664141464968e0,
    2.938163982698783e0
  ];
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996e0,
    3.754408661907416e0
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number, r: number;

  if (p < pLow) {
    // Rational approximation for lower region
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    // Rational approximation for central region
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    // Rational approximation for upper region
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

export function validateInventory(
  rows: any[],
  salesProductIds: string[]
): { good: InventoryRow[]; issues: QualityIssue[]; missing: string[] } {
  const req = ['product_id', 'current_stock', 'lead_time_days'];
  if (rows.length === 0) {
    return { good: [], issues: [], missing: req };
  }
  const firstRow = rows[0];
  const missing = req.filter(c => !(c in firstRow));
  if (missing.length > 0) {
    return { good: [], issues: [], missing };
  }

  const known = new Set(salesProductIds);
  const seenPid = new Set<string>();
  const good: InventoryRow[] = [];
  const issues: QualityIssue[] = [];

  const badIndices = new Set<number>();
  const checks: {
    check: string;
    severity: 'ERROR' | 'WARNING';
    affected: number[];
  }[] = [
    { check: 'Missing product_id', severity: 'ERROR', affected: [] },
    { check: 'Duplicate product_id (first row kept)', severity: 'ERROR', affected: [] },
    { check: 'current_stock missing, not a number or negative', severity: 'ERROR', affected: [] },
    { check: 'lead_time_days missing, not a number or not above 0', severity: 'ERROR', affected: [] },
    { check: 'Product not found in the sales data (ignored)', severity: 'WARNING', affected: [] }
  ];

  rows.forEach((r, i) => {
    const rawPid = r.product_id;
    const pid = rawPid !== undefined && rawPid !== null ? String(rawPid).trim() : '';
    const stock = Number(r.current_stock);
    const lead = Number(r.lead_time_days);

    let isError = false;

    if (!pid) {
      checks[0].affected.push(i + 2);
      isError = true;
    } else if (seenPid.has(pid)) {
      checks[1].affected.push(i + 2);
      isError = true;
    } else {
      seenPid.add(pid);
    }

    if (isNaN(stock) || stock < 0 || r.current_stock === '' || r.current_stock === null) {
      checks[2].affected.push(i + 2);
      isError = true;
    }

    if (isNaN(lead) || lead <= 0 || r.lead_time_days === '' || r.lead_time_days === null) {
      checks[3].affected.push(i + 2);
      isError = true;
    }

    if (pid && !known.has(pid)) {
      checks[4].affected.push(i + 2);
      // Warning only, not error
    }

    if (isError) {
      badIndices.add(i);
    } else {
      good.push({
        product_id: pid,
        current_stock: stock,
        lead_time_days: lead
      });
    }
  });

  for (const c of checks) {
    if (c.affected.length > 0) {
      issues.push({
        check: c.check,
        severity: c.severity,
        rows_affected: c.affected.length,
        example_row_numbers: c.affected.slice(0, 5).join(', '),
        impact: c.severity === 'ERROR' ? 'Row excluded from inventory calculations.' : 'Product not present in sales history.'
      });
    }
  }

  return { good, issues, missing: [] };
}

export function demandStats(rows: SalesRow[], windowDays = 90): {
  stats: Map<string, { avg_daily_demand: number; std_daily_demand: number }>;
  days_used: number;
  as_of: string;
} {
  if (rows.length === 0) {
    return { stats: new Map(), days_used: 0, as_of: '' };
  }

  let minDate = rows[0].order_date;
  let maxDate = rows[0].order_date;
  for (const r of rows) {
    if (r.order_date < minDate) minDate = r.order_date;
    if (r.order_date > maxDate) maxDate = r.order_date;
  }

  const maxDt = new Date(maxDate);
  const windowStartDt = new Date(maxDt);
  windowStartDt.setDate(windowStartDt.getDate() - (windowDays - 1));

  const minDt = new Date(minDate);
  const startDt = windowStartDt > minDt ? windowStartDt : minDt;
  const startStr = startDt.toISOString().substring(0, 10);

  // Generate calendar days
  const calendarDays: string[] = [];
  const curr = new Date(startDt);
  while (curr <= maxDt) {
    calendarDays.push(curr.toISOString().substring(0, 10));
    curr.setDate(curr.getDate() + 1);
  }

  const daysCount = calendarDays.length;

  // Daily demand map: pid -> date -> units
  const dailyMap = new Map<string, Map<string, number>>();
  const allPids = new Set(rows.map(r => r.product_id));

  for (const pid of allPids) {
    dailyMap.set(pid, new Map());
  }

  for (const r of rows) {
    if (r.order_date >= startStr && r.order_date <= maxDate) {
      const pMap = dailyMap.get(r.product_id);
      if (pMap) {
        pMap.set(r.order_date, (pMap.get(r.order_date) || 0) + r.quantity);
      }
    }
  }

  const stats = new Map<string, { avg_daily_demand: number; std_daily_demand: number }>();

  for (const pid of allPids) {
    const pMap = dailyMap.get(pid)!;
    let sum = 0;
    const values: number[] = new Array(daysCount);

    for (let i = 0; i < daysCount; i++) {
      const v = pMap.get(calendarDays[i]) || 0;
      values[i] = v;
      sum += v;
    }

    const mean = sum / daysCount;

    let variance = 0;
    if (daysCount > 1) {
      let sumSq = 0;
      for (let i = 0; i < daysCount; i++) {
        const diff = values[i] - mean;
        sumSq += diff * diff;
      }
      variance = sumSq / (daysCount - 1); // ddof = 1
    }

    stats.set(pid, {
      avg_daily_demand: mean,
      std_daily_demand: Math.sqrt(variance)
    });
  }

  return {
    stats,
    days_used: daysCount,
    as_of: maxDate
  };
}

export function analyzeInventory(
  salesRows: SalesRow[],
  invRows: InventoryRow[],
  serviceLevel = 0.95,
  windowDays = 90,
  coverDays = 30,
  excessDays = 90
): InventoryAnalysisResult {
  const z = normalInvCdf(serviceLevel);
  const { stats, days_used, as_of } = demandStats(salesRows, windowDays);

  const withCalc = salesRows.length > 0 && salesRows[0].gross_profit !== undefined ? salesRows : addCalculatedColumns(salesRows);

  // Group sales by product
  const prodSales = new Map<string, { product_name: string; category: string; units: number; cogs: number }>();
  for (const r of withCalc) {
    const pid = r.product_id;
    if (!prodSales.has(pid)) {
      prodSales.set(pid, {
        product_name: r.product_name,
        category: r.category,
        units: 0,
        cogs: 0
      });
    }
    const ps = prodSales.get(pid)!;
    ps.units += r.quantity;
    ps.cogs += r.cogs || 0;
  }

  const invMap = new Map<string, InventoryRow>();
  for (const inv of invRows) {
    invMap.set(inv.product_id, inv);
  }

  const rows: InventoryAnalysisRow[] = [];

  for (const [pid, ps] of prodSales.entries()) {
    const avgUnitCost = ps.units > 0 ? ps.cogs / ps.units : 0;
    const inv = invMap.get(pid);

    if (!inv) {
      rows.push({
        product_id: pid,
        product_name: ps.product_name,
        category: ps.category,
        status: NO_INV,
        reason: 'No usable inventory row for this product.'
      });
      continue;
    }

    const stock = inv.current_stock;
    const L = inv.lead_time_days;
    const stat = stats.get(pid) || { avg_daily_demand: 0, std_daily_demand: 0 };
    const d = stat.avg_daily_demand;
    const s = stat.std_daily_demand;
    const ss = z * s * Math.sqrt(L);
    const rop = d * L + ss;
    const up_to = d * (L + coverDays) + ss;
    const daysStock = d > 0 ? stock / d : Infinity;
    const shortfall = Math.max(0, d * L - stock);

    let status: InventoryAnalysisRow['status'];
    let reason: string;
    let suggested_order_qty = 0;
    let excess_units = 0;
    let excess_value = 0;

    if (d === 0) {
      status = NO_SALES;
      reason = `No units sold in the last ${days_used} days; ${Math.round(stock).toLocaleString('en-US')} units in stock.`;
    } else if (daysStock < L) {
      status = STOCKOUT;
      suggested_order_qty = Math.ceil(up_to - stock);
      reason = `Stock lasts ${daysStock.toFixed(1)} days but the lead time is ${Math.round(L)} days: expected shortfall about ${Math.round(shortfall).toLocaleString('en-US')} units even if ordered today.`;
    } else if (stock <= rop) {
      status = REORDER;
      suggested_order_qty = Math.ceil(up_to - stock);
      reason = `Stock ${Math.round(stock).toLocaleString('en-US')} is at or below the reorder point ${Math.round(rop).toLocaleString('en-US')} (demand in lead time ${Math.round(d * L).toLocaleString('en-US')} + safety stock ${Math.round(ss).toLocaleString('en-US')}).`;
    } else if (daysStock > excessDays) {
      status = EXCESS;
      excess_units = stock - d * excessDays;
      excess_value = excess_units * avgUnitCost;
      reason = `Stock covers ${Math.round(daysStock)} days of demand, above the ${excessDays}-day threshold; about ${Math.round(excess_units).toLocaleString('en-US')} units above that level.`;
    } else {
      status = OK;
      reason = `Stock covers ${Math.round(daysStock)} days; above the reorder point ${Math.round(rop).toLocaleString('en-US')}.`;
    }

    rows.push({
      product_id: pid,
      product_name: ps.product_name,
      category: ps.category,
      current_stock: stock,
      lead_time_days: L,
      avg_daily_demand: d,
      std_daily_demand: s,
      days_of_stock: daysStock,
      demand_during_lead_time: d * L,
      safety_stock: ss,
      reorder_point: rop,
      order_up_to_level: up_to,
      suggested_order_qty,
      shortfall_during_lead_time: shortfall,
      excess_units,
      excess_value,
      status,
      reason
    });
  }

  return {
    rows,
    z,
    days_used,
    as_of
  };
}

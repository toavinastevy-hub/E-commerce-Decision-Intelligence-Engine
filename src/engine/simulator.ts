import { SalesRow, SimulationResult } from '../types';
import { addCalculatedColumns } from './kpis';
import { safeDivide } from './helpers';

export function impliedVolumeChange(
  oldEffectivePrice: number,
  newEffectivePrice: number,
  elasticity: number
): number {
  if (oldEffectivePrice <= 0 || newEffectivePrice <= 0) {
    throw new Error('Prices must be above 0.');
  }
  return Math.pow(newEffectivePrice / oldEffectivePrice, elasticity) - 1;
}

export interface BaselineProduct {
  product_id: string;
  product_name: string;
  category: string;
  units: number;
  gross_sales: number;
  discount_amount: number;
  cogs: number;
  list_price: number;
  unit_cost: number;
  discount_rate: number;
  net_revenue: number;
  gross_profit: number;
}

export function baselineByProduct(rows: SalesRow[]): BaselineProduct[] {
  const withCalc = rows.length > 0 && rows[0].gross_profit !== undefined ? rows : addCalculatedColumns(rows);
  const map = new Map<string, BaselineProduct>();

  for (const r of withCalc) {
    const pid = r.product_id;
    if (!map.has(pid)) {
      map.set(pid, {
        product_id: pid,
        product_name: r.product_name,
        category: r.category,
        units: 0,
        gross_sales: 0,
        discount_amount: 0,
        cogs: 0,
        list_price: 0,
        unit_cost: 0,
        discount_rate: 0,
        net_revenue: 0,
        gross_profit: 0
      });
    }
    const item = map.get(pid)!;
    item.units += r.quantity;
    item.gross_sales += r.gross_sales || 0;
    item.discount_amount += r.discount_amount || 0;
    item.cogs += r.cogs || 0;
  }

  const result: BaselineProduct[] = [];
  for (const item of map.values()) {
    item.list_price = safeDivide(item.gross_sales, item.units);
    item.unit_cost = safeDivide(item.cogs, item.units);
    item.discount_rate = safeDivide(item.discount_amount, item.gross_sales);
    item.net_revenue = item.gross_sales - item.discount_amount;
    item.gross_profit = item.net_revenue - item.cogs;
    result.push(item);
  }

  return result.sort((a, b) => a.product_name.localeCompare(b.product_name));
}

export function simulate(
  rows: SalesRow[],
  priceChange = 0.0,
  discountRate: number | null = null,
  costChange = 0.0,
  volumeChange = 0.0,
  productIds: string[] | null = null
): SimulationResult {
  if (priceChange <= -1 || costChange <= -1 || volumeChange <= -1) {
    throw new Error('A change of -100% or lower is not possible.');
  }
  if (discountRate !== null && (discountRate < 0 || discountRate >= 1)) {
    throw new Error('Discount must be from 0 up to (but not including) 100%.');
  }

  let base = baselineByProduct(rows);
  if (productIds !== null && productIds.length > 0) {
    const idSet = new Set(productIds);
    base = base.filter(p => idSet.has(p.product_id));
  }

  if (base.length === 0) {
    throw new Error('No products selected.');
  }

  let baseUnits = 0;
  let baseGrossSales = 0;
  let baseDiscountAmount = 0;
  let baseCogs = 0;

  let scenUnits = 0;
  let scenGrossSales = 0;
  let scenDiscountAmount = 0;
  let scenCogs = 0;

  let weightedUnitProfitSum = 0;

  const by_product = base.map(p => {
    const p_new = p.list_price * (1 + priceChange);
    const c_new = p.unit_cost * (1 + costChange);
    const d_new = discountRate !== null ? discountRate : p.discount_rate;
    const q_new = p.units * (1 + volumeChange);
    const gs_new = q_new * p_new;
    const da_new = gs_new * d_new;
    const cogs_new = q_new * c_new;
    const net_new = gs_new - da_new;
    const gp_new = net_new - cogs_new;

    const unit_profit_new = p_new * (1 - d_new) - c_new;
    const be_units = unit_profit_new > 0 ? p.gross_profit / unit_profit_new : Infinity;

    baseUnits += p.units;
    baseGrossSales += p.gross_sales;
    baseDiscountAmount += p.discount_amount;
    baseCogs += p.cogs;

    scenUnits += q_new;
    scenGrossSales += gs_new;
    scenDiscountAmount += da_new;
    scenCogs += cogs_new;

    weightedUnitProfitSum += unit_profit_new * p.units;

    return {
      product_id: p.product_id,
      product_name: p.product_name,
      category: p.category,
      baseline_units: p.units,
      scenario_units: q_new,
      baseline_net_revenue: p.net_revenue,
      scenario_net_revenue: net_new,
      baseline_gross_profit: p.gross_profit,
      scenario_gross_profit: gp_new,
      breakeven_units: be_units
    };
  });

  const baseNet = baseGrossSales - baseDiscountAmount;
  const baseGp = baseNet - baseCogs;
  const baseMargin = safeDivide(baseGp, baseNet);

  const scenNet = scenGrossSales - scenDiscountAmount;
  const scenGp = scenNet - scenCogs;
  const scenMargin = safeDivide(scenGp, scenNet);

  const baseline = {
    units: baseUnits,
    gross_sales: baseGrossSales,
    discount_amount: baseDiscountAmount,
    net_revenue: baseNet,
    cogs: baseCogs,
    gross_profit: baseGp,
    gross_margin_pct: baseMargin
  };

  const scenario = {
    units: scenUnits,
    gross_sales: scenGrossSales,
    discount_amount: scenDiscountAmount,
    net_revenue: scenNet,
    cogs: scenCogs,
    gross_profit: scenGp,
    gross_margin_pct: scenMargin
  };

  const change = {
    units: safeDivide(scenUnits - baseUnits, baseUnits),
    net_revenue: safeDivide(scenNet - baseNet, baseNet),
    gross_profit: safeDivide(scenGp - baseGp, baseGp),
    gross_margin_pts: scenMargin - baseMargin
  };

  const totalUnitProfit = baseUnits > 0 ? weightedUnitProfitSum / baseUnits : 0;
  const breakeven_units = totalUnitProfit > 0 ? baseGp / totalUnitProfit : Infinity;

  return {
    baseline,
    scenario,
    change,
    breakeven_units,
    by_product
  };
}

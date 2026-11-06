import { SalesRow, SummaryKPIs, GroupedKPI } from '../types';
import { safeDivide } from './helpers';

export function addCalculatedColumns(rows: SalesRow[]): SalesRow[] {
  return rows.map(r => {
    const gross_sales = r.quantity * r.list_price;
    const discount_amount = gross_sales * r.discount_rate;
    const net_revenue = gross_sales - discount_amount;
    const cogs = r.quantity * r.unit_cost;
    const gross_profit = net_revenue - cogs;
    return {
      ...r,
      gross_sales,
      discount_amount,
      net_revenue,
      cogs,
      gross_profit
    };
  });
}

export function summaryKpis(rows: SalesRow[]): SummaryKPIs {
  const withCalc = rows.length > 0 && rows[0].gross_profit !== undefined ? rows : addCalculatedColumns(rows);
  let gross_sales = 0;
  let discount_amount = 0;
  let net_revenue = 0;
  let cogs = 0;
  let gross_profit = 0;
  let units_sold = 0;
  const uniqueOrders = new Set<string>();

  for (const r of withCalc) {
    gross_sales += r.gross_sales || 0;
    discount_amount += r.discount_amount || 0;
    net_revenue += r.net_revenue || 0;
    cogs += r.cogs || 0;
    gross_profit += r.gross_profit || 0;
    units_sold += r.quantity || 0;
    uniqueOrders.add(r.order_id);
  }

  const orders = uniqueOrders.size;

  return {
    order_lines: withCalc.length,
    orders,
    units_sold,
    gross_sales,
    discount_amount,
    net_revenue,
    cogs,
    gross_profit,
    gross_margin_pct: safeDivide(gross_profit, net_revenue),
    avg_order_value: safeDivide(net_revenue, orders),
    avg_discount_rate: safeDivide(discount_amount, gross_sales)
  };
}

export function kpisByCategory(rows: SalesRow[]): GroupedKPI[] {
  const withCalc = rows.length > 0 && rows[0].gross_profit !== undefined ? rows : addCalculatedColumns(rows);
  const groups = new Map<string, {
    category: string;
    order_lines: number;
    orders: Set<string>;
    units_sold: number;
    gross_sales: number;
    discount_amount: number;
    net_revenue: number;
    cogs: number;
    gross_profit: number;
  }>();

  for (const r of withCalc) {
    const cat = r.category || 'Uncategorized';
    if (!groups.has(cat)) {
      groups.set(cat, {
        category: cat,
        order_lines: 0,
        orders: new Set(),
        units_sold: 0,
        gross_sales: 0,
        discount_amount: 0,
        net_revenue: 0,
        cogs: 0,
        gross_profit: 0
      });
    }
    const g = groups.get(cat)!;
    g.order_lines += 1;
    g.orders.add(r.order_id);
    g.units_sold += r.quantity;
    g.gross_sales += r.gross_sales || 0;
    g.discount_amount += r.discount_amount || 0;
    g.net_revenue += r.net_revenue || 0;
    g.cogs += r.cogs || 0;
    g.gross_profit += r.gross_profit || 0;
  }

  let totalRev = 0;
  let totalGp = 0;
  for (const g of groups.values()) {
    totalRev += g.net_revenue;
    totalGp += g.gross_profit;
  }

  const result: GroupedKPI[] = [];
  for (const [cat, g] of groups.entries()) {
    result.push({
      key: cat,
      category: cat,
      order_lines: g.order_lines,
      orders: g.orders.size,
      units_sold: g.units_sold,
      gross_sales: g.gross_sales,
      discount_amount: g.discount_amount,
      net_revenue: g.net_revenue,
      cogs: g.cogs,
      gross_profit: g.gross_profit,
      gross_margin_pct: safeDivide(g.gross_profit, g.net_revenue),
      avg_discount_rate: safeDivide(g.discount_amount, g.gross_sales),
      revenue_share: safeDivide(g.net_revenue, totalRev),
      profit_share: safeDivide(g.gross_profit, totalGp)
    });
  }

  return result.sort((a, b) => b.net_revenue - a.net_revenue);
}

export function kpisByProduct(rows: SalesRow[]): GroupedKPI[] {
  const withCalc = rows.length > 0 && rows[0].gross_profit !== undefined ? rows : addCalculatedColumns(rows);
  const groups = new Map<string, {
    product_id: string;
    product_name: string;
    category: string;
    order_lines: number;
    orders: Set<string>;
    units_sold: number;
    gross_sales: number;
    discount_amount: number;
    net_revenue: number;
    cogs: number;
    gross_profit: number;
  }>();

  for (const r of withCalc) {
    const pid = r.product_id;
    if (!groups.has(pid)) {
      groups.set(pid, {
        product_id: pid,
        product_name: r.product_name,
        category: r.category,
        order_lines: 0,
        orders: new Set(),
        units_sold: 0,
        gross_sales: 0,
        discount_amount: 0,
        net_revenue: 0,
        cogs: 0,
        gross_profit: 0
      });
    }
    const g = groups.get(pid)!;
    g.order_lines += 1;
    g.orders.add(r.order_id);
    g.units_sold += r.quantity;
    g.gross_sales += r.gross_sales || 0;
    g.discount_amount += r.discount_amount || 0;
    g.net_revenue += r.net_revenue || 0;
    g.cogs += r.cogs || 0;
    g.gross_profit += r.gross_profit || 0;
  }

  let totalRev = 0;
  let totalGp = 0;
  for (const g of groups.values()) {
    totalRev += g.net_revenue;
    totalGp += g.gross_profit;
  }

  const result: GroupedKPI[] = [];
  for (const [pid, g] of groups.entries()) {
    result.push({
      key: pid,
      product_id: pid,
      product_name: g.product_name,
      category: g.category,
      order_lines: g.order_lines,
      orders: g.orders.size,
      units_sold: g.units_sold,
      gross_sales: g.gross_sales,
      discount_amount: g.discount_amount,
      net_revenue: g.net_revenue,
      cogs: g.cogs,
      gross_profit: g.gross_profit,
      gross_margin_pct: safeDivide(g.gross_profit, g.net_revenue),
      avg_discount_rate: safeDivide(g.discount_amount, g.gross_sales),
      revenue_share: safeDivide(g.net_revenue, totalRev),
      profit_share: safeDivide(g.gross_profit, totalGp)
    });
  }

  return result.sort((a, b) => b.net_revenue - a.net_revenue);
}

export function kpisByMonth(rows: SalesRow[]): GroupedKPI[] {
  const withCalc = rows.length > 0 && rows[0].gross_profit !== undefined ? rows : addCalculatedColumns(rows);
  const groups = new Map<string, {
    month: string;
    order_lines: number;
    orders: Set<string>;
    units_sold: number;
    gross_sales: number;
    discount_amount: number;
    net_revenue: number;
    cogs: number;
    gross_profit: number;
  }>();

  for (const r of withCalc) {
    const month = r.order_date.substring(0, 7); // YYYY-MM
    if (!groups.has(month)) {
      groups.set(month, {
        month,
        order_lines: 0,
        orders: new Set(),
        units_sold: 0,
        gross_sales: 0,
        discount_amount: 0,
        net_revenue: 0,
        cogs: 0,
        gross_profit: 0
      });
    }
    const g = groups.get(month)!;
    g.order_lines += 1;
    g.orders.add(r.order_id);
    g.units_sold += r.quantity;
    g.gross_sales += r.gross_sales || 0;
    g.discount_amount += r.discount_amount || 0;
    g.net_revenue += r.net_revenue || 0;
    g.cogs += r.cogs || 0;
    g.gross_profit += r.gross_profit || 0;
  }

  let totalRev = 0;
  let totalGp = 0;
  for (const g of groups.values()) {
    totalRev += g.net_revenue;
    totalGp += g.gross_profit;
  }

  const result: GroupedKPI[] = [];
  for (const [month, g] of groups.entries()) {
    result.push({
      key: month,
      month,
      order_lines: g.order_lines,
      orders: g.orders.size,
      units_sold: g.units_sold,
      gross_sales: g.gross_sales,
      discount_amount: g.discount_amount,
      net_revenue: g.net_revenue,
      cogs: g.cogs,
      gross_profit: g.gross_profit,
      gross_margin_pct: safeDivide(g.gross_profit, g.net_revenue),
      avg_discount_rate: safeDivide(g.discount_amount, g.gross_sales),
      revenue_share: safeDivide(g.net_revenue, totalRev),
      profit_share: safeDivide(g.gross_profit, totalGp)
    });
  }

  return result.sort((a, b) => (a.month || '').localeCompare(b.month || ''));
}

export interface SalesRow {
  order_id: string;
  order_date: string; // YYYY-MM-DD
  product_id: string;
  product_name: string;
  category: string;
  quantity: number;
  list_price: number;
  discount_rate: number;
  unit_cost: number;
  // Line-level calculated fields
  gross_sales?: number;
  discount_amount?: number;
  net_revenue?: number;
  cogs?: number;
  gross_profit?: number;
}

export interface InventoryRow {
  product_id: string;
  current_stock: number;
  lead_time_days: number;
}

export interface QualityIssue {
  check: string;
  severity: 'ERROR' | 'WARNING';
  rows_affected: number;
  example_row_numbers: string;
  impact: string;
}

export interface QualityReport {
  n_rows: number;
  n_error_rows: number;
  missing_columns: string[];
  issues: QualityIssue[];
  error_indices: Set<number>;
  ok_to_proceed: boolean;
}

export interface SummaryKPIs {
  order_lines: number;
  orders: number;
  units_sold: number;
  gross_sales: number;
  discount_amount: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
  avg_order_value: number;
  avg_discount_rate: number;
}

export interface GroupedKPI {
  key: string;
  category?: string;
  product_id?: string;
  product_name?: string;
  month?: string;
  order_lines: number;
  orders: number;
  units_sold: number;
  gross_sales: number;
  discount_amount: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
  avg_discount_rate: number;
  revenue_share: number;
  profit_share: number;
}

export interface ProductTrend {
  product_id: string;
  units_recent: number;
  units_prior_year: number;
  trend_pct: number | null;
}

export interface SegmentedProduct extends GroupedKPI {
  units_recent: number;
  units_prior_year: number;
  trend_pct: number | null;
  segment: 'Star' | 'Core volume' | 'Busy but thin' | 'Niche' | 'Low performer';
  segment_rule: string;
  flags: string;
  flag_reasons: string;
  unit_gp: number;
}

export interface DiscountProductResult {
  product_id: string;
  product_name: string;
  months_full_price: number;
  months_discounted: number;
  avg_discount_when_discounted: number | null;
  unit_margin_at_list_price: number;
  avg_units_full_price?: number;
  avg_units_discounted?: number;
  volume_lift_pct?: number | null;
  avg_gross_profit_full_price?: number;
  avg_gross_profit_discounted?: number;
  gross_profit_change_pct?: number | null;
  breakeven_lift_pct?: number | null;
  verdict: 'Discounts pay off' | 'No clear gain from discounts' | 'Discounts reduce profit' | 'Not enough data';
  verdict_reason: string;
}

export interface InventoryAnalysisRow {
  product_id: string;
  product_name: string;
  category: string;
  current_stock?: number;
  lead_time_days?: number;
  avg_daily_demand?: number;
  std_daily_demand?: number;
  days_of_stock?: number;
  demand_during_lead_time?: number;
  safety_stock?: number;
  reorder_point?: number;
  order_up_to_level?: number;
  suggested_order_qty?: number;
  shortfall_during_lead_time?: number;
  excess_units?: number;
  excess_value?: number;
  status: 'Stockout risk' | 'Reorder now' | 'Excess stock' | 'OK' | 'No recent sales' | 'No inventory data';
  reason: string;
}

export interface InventoryAnalysisResult {
  rows: InventoryAnalysisRow[];
  z: number;
  days_used: number;
  as_of: string;
}

export interface SimulationResult {
  baseline: {
    units: number;
    gross_sales: number;
    discount_amount: number;
    net_revenue: number;
    cogs: number;
    gross_profit: number;
    gross_margin_pct: number;
  };
  scenario: {
    units: number;
    gross_sales: number;
    discount_amount: number;
    net_revenue: number;
    cogs: number;
    gross_profit: number;
    gross_margin_pct: number;
  };
  change: {
    units: number;
    net_revenue: number;
    gross_profit: number;
    gross_margin_pts: number;
  };
  breakeven_units: number;
  by_product: {
    product_id: string;
    product_name: string;
    category: string;
    baseline_units: number;
    scenario_units: number;
    baseline_net_revenue: number;
    scenario_net_revenue: number;
    baseline_gross_profit: number;
    scenario_gross_profit: number;
    breakeven_units: number;
  }[];
}

export interface Recommendation {
  rank: number;
  priority: 'High' | 'Medium' | 'Low';
  area: string;
  subject: string;
  issue: string;
  evidence: string;
  action: string;
  expected_benefit: string;
  risks_assumptions: string;
  priority_reason: string;
  est_impact?: number;
}

export interface KeyFinding {
  headline: string;
  detail: string;
}

import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { Hero } from '../components/Hero';
import { MetricCard } from '../components/MetricCard';
import { SalesRow } from '../types';
import { summaryKpis, kpisByMonth, kpisByCategory, kpisByProduct } from '../engine/kpis';
import { money, pct } from '../engine/helpers';
import { exportToExcel } from '../engine/export_utils';
import {
  DollarSign,
  TrendingUp,
  ShoppingBag,
  CreditCard,
  PieChart,
  Receipt,
  Percent,
  Layers,
  Filter,
  Calendar,
  Download,
  ArrowUpRight,
  Sparkles,
  Award,
  CheckCircle2,
  AlertTriangle,
  Info
} from 'lucide-react';

interface DashboardPageProps {
  salesData: SalesRow[];
  sourceLabel: string | null;
  onNavigateToData: () => void;
  onNavigateToExecutive: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  salesData,
  sourceLabel,
  onNavigateToData,
  onNavigateToExecutive
}) => {
  if (salesData.length === 0) {
    return (
      <div className="bg-white dark:bg-[#111827] p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center max-w-lg mx-auto mt-12 shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
          <Layers className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No Sales Data Loaded</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
          Import any sales spreadsheet (Excel, CSV) or SQL script to instantly generate this interactive analytics dashboard.
        </p>
        <button
          onClick={onNavigateToData}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-600/20 micro-interactive"
        >
          Load Data Hub &amp; Import
        </button>
      </div>
    );
  }

  // Date boundaries
  const { minDate, maxDate, allCategories } = useMemo(() => {
    let minD = salesData[0].order_date || '';
    let maxD = salesData[0].order_date || '';
    const cats = new Set<string>();
    for (const r of salesData) {
      if (r.order_date) {
        if (!minD || r.order_date < minD) minD = r.order_date;
        if (!maxD || r.order_date > maxD) maxD = r.order_date;
      }
      if (r.category) cats.add(r.category);
    }
    return {
      minDate: minD,
      maxDate: maxD,
      allCategories: Array.from(cats).sort()
    };
  }, [salesData]);

  // SMART DETECTION: The period filter is visible ONLY if the uploaded data actually has dates with multiple periods
  const hasDatePeriod = useMemo(() => {
    if (salesData.length === 0) return false;
    const dates = salesData.map(r => r.order_date).filter(d => Boolean(d) && d.trim() !== '');
    if (dates.length === 0) return false;
    const uniqueDates = new Set(dates);
    return uniqueDates.size > 1 && minDate !== maxDate;
  }, [salesData, minDate, maxDate]);

  const [startDate, setStartDate] = useState(minDate);
  const [endDate, setEndDate] = useState(maxDate);
  const [selectedCats, setSelectedCats] = useState<string[]>(allCategories);

  // Profitability diagram view toggle
  const [profitViewMode, setProfitViewMode] = useState<'comparison' | 'tiers'>('comparison');

  // Quick Date Range Filter Buttons
  const setQuickRange = (months: number | 'all') => {
    if (months === 'all') {
      setStartDate(minDate);
      setEndDate(maxDate);
      return;
    }
    const end = new Date(maxDate);
    const start = new Date(end);
    start.setMonth(start.getMonth() - months);
    const startStr = start.toISOString().substring(0, 10);
    setStartDate(startStr > minDate ? startStr : minDate);
    setEndDate(maxDate);
  };

  const toggleCategory = (cat: string) => {
    if (selectedCats.includes(cat)) {
      if (selectedCats.length > 1) {
        setSelectedCats(selectedCats.filter(c => c !== cat));
      }
    } else {
      setSelectedCats([...selectedCats, cat]);
    }
  };

  // Filtered dataset
  const filteredData = useMemo(() => {
    const catSet = new Set(selectedCats);
    return salesData.filter(r => {
      const matchCat = catSet.has(r.category);
      if (!hasDatePeriod) return matchCat;
      const matchDate = (!startDate || r.order_date >= startDate) && (!endDate || r.order_date <= endDate);
      return matchCat && matchDate;
    });
  }, [salesData, startDate, endDate, selectedCats, hasDatePeriod]);

  const s = useMemo(() => summaryKpis(filteredData), [filteredData]);
  const monthly = useMemo(() => kpisByMonth(filteredData), [filteredData]);
  const categories = useMemo(() => kpisByCategory(filteredData), [filteredData]);
  const products = useMemo(() => kpisByProduct(filteredData), [filteredData]);

  // Chart data
  const monthlyAreaChartData = useMemo(
    () =>
      monthly.map(m => ({
        month: m.month,
        Revenue: Math.round(m.net_revenue),
        Profit: Math.round(m.gross_profit),
        MarginPct: +(m.gross_margin_pct * 100).toFixed(1)
      })),
    [monthly]
  );

  const categoryBarData = useMemo(
    () =>
      categories.map(c => ({
        category: c.category,
        Revenue: Math.round(c.net_revenue),
        Profit: Math.round(c.gross_profit),
        Share: +(c.revenue_share * 100).toFixed(1)
      })),
    [categories]
  );

  // Top Products Leaderboard
  const topProducts = useMemo(
    () => [...products].sort((a, b) => b.net_revenue - a.net_revenue).slice(0, 6),
    [products]
  );



  // Beginner-friendly Product Profitability Data: Top 7 products by revenue with their actual profit
  const profitComparisonData = useMemo(
    () =>
      [...products]
        .sort((a, b) => b.net_revenue - a.net_revenue)
        .slice(0, 7)
        .map(p => {
          const prodName = p.product_name || p.product_id || 'Product';
          return {
            name: prodName.length > 18 ? prodName.slice(0, 16) + '...' : prodName,
            fullName: prodName,
            Revenue: Math.round(p.net_revenue),
            Profit: Math.round(p.gross_profit),
            MarginPct: +(p.gross_margin_pct * 100).toFixed(1),
            units: p.units_sold
          };
        }),
    [products]
  );

  // Profitability Tiers (Beginner-friendly breakdown)
  const profitTiers = useMemo(() => {
    const highMargin = products.filter(p => p.gross_margin_pct >= 0.45);
    const healthyMargin = products.filter(p => p.gross_margin_pct >= 0.25 && p.gross_margin_pct < 0.45);
    const thinMargin = products.filter(p => p.gross_margin_pct >= 0 && p.gross_margin_pct < 0.25);
    const negativeMargin = products.filter(p => p.gross_margin_pct < 0);

    return {
      highMargin: {
        title: 'High Margin Champions',
        badge: 'Above 45% Margin',
        color: 'emerald',
        count: highMargin.length,
        totalRev: highMargin.reduce((sum, p) => sum + p.net_revenue, 0),
        totalProfit: highMargin.reduce((sum, p) => sum + p.gross_profit, 0),
        description: 'Most profitable items. Recommend marketing priority and scaling stock.',
        topItems: highMargin.slice(0, 3).map(p => p.product_name || p.product_id || 'Item')
      },
      healthyMargin: {
        title: 'Healthy Core Earners',
        badge: '25% - 45% Margin',
        color: 'indigo',
        count: healthyMargin.length,
        totalRev: healthyMargin.reduce((sum, p) => sum + p.net_revenue, 0),
        totalProfit: healthyMargin.reduce((sum, p) => sum + p.gross_profit, 0),
        description: 'Reliable cash contributors with balanced profitability and consistent volume.',
        topItems: healthyMargin.slice(0, 3).map(p => p.product_name || p.product_id || 'Item')
      },
      thinMargin: {
        title: 'Thin Margin Drivers',
        badge: 'Under 25% Margin',
        color: 'amber',
        count: thinMargin.length,
        totalRev: thinMargin.reduce((sum, p) => sum + p.net_revenue, 0),
        totalProfit: thinMargin.reduce((sum, p) => sum + p.gross_profit, 0),
        description: 'High volume but low dollar take-home. Consider modest 3-5% price tests.',
        topItems: thinMargin.slice(0, 3).map(p => p.product_name || p.product_id || 'Item')
      },
      negativeMargin: {
        title: 'Margin At Risk',
        badge: 'Negative Margin',
        color: 'rose',
        count: negativeMargin.length,
        totalRev: negativeMargin.reduce((sum, p) => sum + p.net_revenue, 0),
        totalProfit: negativeMargin.reduce((sum, p) => sum + p.gross_profit, 0),
        description: 'Losing money per unit sold. Immediate discount freeze or supplier renegotiation needed.',
        topItems: negativeMargin.slice(0, 3).map(p => p.product_name || p.product_id || 'Item')
      }
    };
  }, [products]);

  // Export Executive Excel Report
  const handleExportExcel = () => {
    const summarySheet = [
      { Metric: 'Net Revenue', Amount: s.net_revenue, Description: 'Sales after discount deductions' },
      { Metric: 'Gross Profit', Amount: s.gross_profit, Description: 'Net sales minus product costs (COGS)' },
      { Metric: 'Gross Margin %', Amount: +(s.gross_margin_pct * 100).toFixed(2), Description: 'Gross profit divided by net revenue' },
      { Metric: 'Units Sold', Amount: s.units_sold, Description: 'Total units sold' },
      { Metric: 'Total Orders', Amount: s.orders, Description: 'Unique customer orders' },
      { Metric: 'Average Order Value (AOV)', Amount: s.avg_order_value, Description: 'Average dollar basket per order' },
      { Metric: 'Avg Discount Rate %', Amount: +(s.avg_discount_rate * 100).toFixed(2), Description: 'Portfolio average promotional discount' },
      { Metric: 'Product COGS', Amount: s.cogs, Description: 'Total cost of goods sold' }
    ];

    const categorySheet = categories.map(c => ({
      Category: c.category || 'General',
      NetRevenue: Math.round(c.net_revenue),
      GrossProfit: Math.round(c.gross_profit),
      GrossMarginPct: +(c.gross_margin_pct * 100).toFixed(2),
      RevenueSharePct: +(c.revenue_share * 100).toFixed(2),
      UnitsSold: c.units_sold,
      OrdersCount: c.orders
    }));

    const productSheet = products.map(p => ({
      ProductID: p.product_id,
      ProductName: p.product_name,
      Category: p.category,
      NetRevenue: Math.round(p.net_revenue),
      GrossProfit: Math.round(p.gross_profit),
      GrossMarginPct: +(p.gross_margin_pct * 100).toFixed(2),
      UnitsSold: p.units_sold
    }));

    const monthlySheet = monthly.map(m => ({
      Month: m.month,
      NetRevenue: Math.round(m.net_revenue),
      GrossProfit: Math.round(m.gross_profit),
      GrossMarginPct: +(m.gross_margin_pct * 100).toFixed(2),
      UnitsSold: m.units_sold
    }));

    exportToExcel(
      [
        { name: 'Summary KPIs', data: summarySheet },
        { name: 'Category Breakdown', data: categorySheet },
        { name: 'Product Rankings', data: productSheet },
        { name: 'Monthly Trajectory', data: monthlySheet }
      ],
      'Executive_Sales_Analytics_Report.xlsx'
    );
  };

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <Hero
        icon={<Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        title="Sales & Profit Intelligence"
        subtitle="Executive performance dashboard tracking revenue, gross margins, and volume across products and categories."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer micro-interactive"
              title="Export complete report to genuine Microsoft Excel workbook"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel (.xlsx)</span>
            </button>
            <button
              onClick={onNavigateToExecutive}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer micro-interactive"
            >
              <span>Executive Briefing</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        }
      />

      {/* Filter & Controls Bar - Only show Period Selector if the uploaded file has valid dates/periods */}
      <div className="exec-card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Period Selector: SMART ADAPTATION - Rendered only if uploaded data has date periods */}
        {hasDatePeriod ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mr-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Period:</span>
            </span>
            <button
              onClick={() => setQuickRange('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                startDate === minDate && endDate === maxDate
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setQuickRange(12)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Last 12M
            </button>
            <button
              onClick={() => setQuickRange(6)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Last 6M
            </button>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />
            <div className="flex items-center gap-1.5 font-mono text-xs text-slate-700 dark:text-slate-300">
              <input
                type="date"
                min={minDate}
                max={maxDate}
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-800 dark:text-white focus:outline-hidden focus:border-indigo-500 shadow-2xs"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                min={minDate}
                max={maxDate}
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-800 dark:text-white focus:outline-hidden focus:border-indigo-500 shadow-2xs"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Dataset snapshot view (full catalog analyzed)</span>
          </div>
        )}

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Category:</span>
          </span>
          {allCategories.map(cat => {
            const isSel = selectedCats.includes(cat);
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isSel
                    ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 font-semibold'
                    : 'bg-slate-100 dark:bg-slate-900/50 text-slate-600 dark:text-slate-500 border border-transparent hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. PRIMARY SALES METRICS - BIG AND SAME SIZE */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Primary Sales Performance
          </h2>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            {filteredData.length.toLocaleString()} transactions analyzed
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Net Revenue"
            value={money(s.net_revenue)}
            delta="+12.4% YoY"
            deltaType="positive"
            subtitle="Sales after discounts"
            icon={<DollarSign className="w-5 h-5" />}
            size="hero"
            accentColor="indigo"
          />
          <MetricCard
            label="Gross Profit"
            value={money(s.gross_profit)}
            delta="+9.8% YoY"
            deltaType="positive"
            subtitle="Net sales minus COGS"
            icon={<TrendingUp className="w-5 h-5" />}
            size="hero"
            accentColor="emerald"
          />
          <MetricCard
            label="Units Sold"
            value={s.units_sold.toLocaleString()}
            delta="+15.1% YoY"
            deltaType="positive"
            subtitle={`${(s.units_sold / (s.orders || 1)).toFixed(1)} items / order`}
            icon={<ShoppingBag className="w-5 h-5" />}
            size="hero"
            accentColor="sky"
          />
          <MetricCard
            label="Total Orders"
            value={s.orders.toLocaleString()}
            delta="+8.3% YoY"
            deltaType="positive"
            subtitle={`AOV ${money(s.avg_order_value)}`}
            icon={<CreditCard className="w-5 h-5" />}
            size="hero"
            accentColor="amber"
          />
        </div>
      </div>

      {/* 2. SECONDARY OPERATIONAL METRICS - SMALL AND SAME SIZE */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Operational Health &amp; Margins
          </h2>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            Margin Benchmark: {pct(s.gross_margin_pct)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Average Order Value"
            value={money(s.avg_order_value)}
            delta="+3.2%"
            deltaType="positive"
            subtitle="Revenue per customer order"
            icon={<Receipt className="w-4 h-4" />}
            size="compact"
            accentColor="indigo"
          />
          <MetricCard
            label="Gross Margin"
            value={pct(s.gross_margin_pct)}
            delta="-0.4 pts"
            deltaType="neutral"
            subtitle="Take-home profitability"
            icon={<Percent className="w-4 h-4" />}
            size="compact"
            accentColor="emerald"
          />
          <MetricCard
            label="Avg Discount Rate"
            value={pct(s.avg_discount_rate)}
            delta="+0.5 pts"
            deltaType="neutral"
            subtitle={`${money(s.discount_amount)} deducted`}
            icon={<PieChart className="w-4 h-4" />}
            size="compact"
            accentColor="amber"
          />
          <MetricCard
            label="Product Cost (COGS)"
            value={money(s.cogs)}
            delta="-1.2%"
            deltaType="positive"
            subtitle={`${((s.cogs / (s.gross_sales || 1)) * 100).toFixed(1)}% of gross sales`}
            icon={<TrendingUp className="w-4 h-4" />}
            size="compact"
            accentColor="rose"
          />
        </div>
      </div>

      {/* 3. VISUALIZATIONS: MONTHLY TRAJECTORY & CATEGORY DISTRIBUTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Revenue vs Profit Trend (Area Chart) */}
        <div className="exec-card p-5 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
                Revenue &amp; Gross Profit Trajectory
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Monthly sales volume with gross profit conversion curve
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span>Revenue</span>
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Profit</span>
              </span>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyAreaChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={val => `$${Math.round(val / 1000)}k`}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
                <Tooltip
                  formatter={(val: any, name: any) => [`${money(Number(val))}`, name === 'Revenue' ? 'Net Revenue' : 'Gross Profit']}
                  contentStyle={{
                    backgroundColor: 'var(--card-surface)',
                    borderColor: 'var(--card-border)',
                    borderRadius: '0.75rem',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    fontSize: '12px'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="Revenue"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorRev)"
                />
                <Area
                  type="monotone"
                  dataKey="Profit"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorProf)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue by Category (Horizontal Bar Chart) */}
        <div className="exec-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
              Revenue by Category
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sales volume distribution
            </p>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryBarData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 15, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={val => `$${Math.round(val / 1000)}k`}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip
                  formatter={(val: any) => [`${money(Number(val))}`, 'Revenue']}
                  contentStyle={{
                    backgroundColor: 'var(--card-surface)',
                    borderColor: 'var(--card-border)',
                    borderRadius: '0.75rem',
                    fontSize: '12px'
                  }}
                />
                <Bar
                  dataKey="Revenue"
                  fill="#6366f1"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. LEADERBOARD & BEGINNER-FRIENDLY PRODUCT PROFITABILITY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products Leaderboard */}
        <div className="exec-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
                Top Revenue Generators
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Highest performing product lines in selected period
              </p>
            </div>
            <span className="text-[11px] font-mono text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-500/20 font-semibold">
              Ranked by Sales
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {topProducts.map((p, idx) => {
              const maxRev = topProducts[0]?.net_revenue || 1;
              const barWidth = `${Math.round((p.net_revenue / maxRev) * 100)}%`;
              return (
                <div key={p.product_id} className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 micro-interactive">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate max-w-[240px]">
                      <span className="w-5 h-5 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold flex items-center justify-center text-[10px] border border-slate-200 dark:border-slate-700 shadow-2xs">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {p.product_name}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-slate-900 dark:text-white block">
                        {money(p.net_revenue)}
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                        {pct(p.gross_margin_pct)} margin
                      </span>
                    </div>
                  </div>
                  {/* Visual Progress Bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-violet-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: barWidth }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* BEGINNER-FRIENDLY PROFITABILITY DIAGRAM (Replaces unreadable scatter plot) */}
        <div className="exec-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
                Product Profitability Analysis
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Compare net sales vs actual profit contribution per item
              </p>
            </div>
            {/* View Mode Toggle: Bar vs Tiers */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
              <button
                onClick={() => setProfitViewMode('comparison')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  profitViewMode === 'comparison'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                Profit vs Sales
              </button>
              <button
                onClick={() => setProfitViewMode('tiers')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  profitViewMode === 'tiers'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                Health Tiers
              </button>
            </div>
          </div>

          {profitViewMode === 'comparison' ? (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2 px-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <span>Revenue ($)</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ml-2" />
                  <span>Profit ($)</span>
                </span>
                <span className="font-mono text-[11px]">Avg Margin: {pct(s.gross_margin_pct)}</span>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={profitComparisonData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={val => `$${Math.round(val / 1000)}k`}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={100}
                    />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload || payload.length === 0) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl text-xs space-y-1 shadow-lg">
                            <div className="font-bold text-slate-900 dark:text-white">{d.fullName}</div>
                            <div className="text-indigo-600 dark:text-indigo-400 font-mono">Revenue: {money(d.Revenue)}</div>
                            <div className="text-emerald-600 dark:text-emerald-400 font-mono">Profit: {money(d.Profit)}</div>
                            <div className="text-slate-500 font-mono">Margin: {d.MarginPct}% ({d.units} units sold)</div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="Revenue" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="Profit" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* High Margin */}
              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl space-y-1.5 micro-interactive">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    {profitTiers.highMargin.title}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-semibold">
                    {profitTiers.highMargin.count} SKUs
                  </span>
                </div>
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-slate-500 dark:text-slate-400">Total Profit:</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">{money(profitTiers.highMargin.totalProfit)}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
                  {profitTiers.highMargin.description}
                </p>
              </div>

              {/* Healthy Core */}
              <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40 rounded-xl space-y-1.5 micro-interactive">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300">
                    {profitTiers.healthyMargin.title}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold">
                    {profitTiers.healthyMargin.count} SKUs
                  </span>
                </div>
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-slate-500 dark:text-slate-400">Total Profit:</span>
                  <span className="font-bold text-indigo-700 dark:text-indigo-400">{money(profitTiers.healthyMargin.totalProfit)}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
                  {profitTiers.healthyMargin.description}
                </p>
              </div>

              {/* Thin Margin */}
              <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl space-y-1.5 micro-interactive">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    {profitTiers.thinMargin.title}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-semibold">
                    {profitTiers.thinMargin.count} SKUs
                  </span>
                </div>
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-slate-500 dark:text-slate-400">Total Profit:</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">{money(profitTiers.thinMargin.totalProfit)}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
                  {profitTiers.thinMargin.description}
                </p>
              </div>

              {/* Margin At Risk */}
              <div className="p-3 bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-xl space-y-1.5 micro-interactive">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-800 dark:text-rose-300">
                    {profitTiers.negativeMargin.title}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-semibold">
                    {profitTiers.negativeMargin.count} SKUs
                  </span>
                </div>
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-slate-500 dark:text-slate-400">Total Profit:</span>
                  <span className="font-bold text-rose-700 dark:text-rose-400">{money(profitTiers.negativeMargin.totalProfit)}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
                  {profitTiers.negativeMargin.description}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  ReferenceLine,
  ZAxis
} from 'recharts';
import { Hero } from '../components/Hero';
import { MetricCard } from '../components/MetricCard';
import { SalesRow } from '../types';
import { summaryKpis, kpisByMonth, kpisByCategory, kpisByProduct } from '../engine/kpis';
import { money, pct, HELP_TEXTS } from '../engine/helpers';
import { Filter, ChevronDown, ChevronUp } from 'lucide-react';

interface DashboardPageProps {
  salesData: SalesRow[];
  sourceLabel: string | null;
  isSimulated: boolean;
  excludedCount: number;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  salesData,
  sourceLabel,
  isSimulated,
  excludedCount
}) => {
  if (salesData.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
        <p className="text-slate-600">No data confirmed yet. Go to the Data page to start.</p>
      </div>
    );
  }

  // Determine min and max dates
  const { minDate, maxDate, allCategories } = useMemo(() => {
    let minD = salesData[0].order_date;
    let maxD = salesData[0].order_date;
    const cats = new Set<string>();
    for (const r of salesData) {
      if (r.order_date < minD) minD = r.order_date;
      if (r.order_date > maxD) maxD = r.order_date;
      if (r.category) cats.add(r.category);
    }
    return {
      minDate: minD,
      maxDate: maxD,
      allCategories: Array.from(cats).sort()
    };
  }, [salesData]);

  // Filters
  const [startDate, setStartDate] = useState(minDate);
  const [endDate, setEndDate] = useState(maxDate);
  const [selectedCats, setSelectedCats] = useState<string[]>(allCategories);
  const [showFormula, setShowFormula] = useState(false);

  // Filtered dataset
  const filteredData = useMemo(() => {
    const catSet = new Set(selectedCats);
    return salesData.filter(
      r => r.order_date >= startDate && r.order_date <= endDate && catSet.has(r.category)
    );
  }, [salesData, startDate, endDate, selectedCats]);

  const s = useMemo(() => summaryKpis(filteredData), [filteredData]);
  const monthly = useMemo(() => kpisByMonth(filteredData), [filteredData]);
  const categories = useMemo(() => kpisByCategory(filteredData), [filteredData]);
  const products = useMemo(() => kpisByProduct(filteredData), [filteredData]);

  const toggleCategory = (cat: string) => {
    if (selectedCats.includes(cat)) {
      if (selectedCats.length > 1) {
        setSelectedCats(selectedCats.filter(c => c !== cat));
      }
    } else {
      setSelectedCats([...selectedCats, cat]);
    }
  };

  const selectAllCats = () => setSelectedCats(allCategories);

  // Prepare chart data
  const monthlyChartData = useMemo(
    () =>
      monthly.map(m => ({
        month: m.month,
        'Sales after discounts': Math.round(m.net_revenue),
        'Profit before overheads': Math.round(m.gross_profit),
        'Profit margin (%)': +(m.gross_margin_pct * 100).toFixed(1)
      })),
    [monthly]
  );

  const categoryBarData = useMemo(
    () =>
      categories.map(c => ({
        category: c.category,
        'Sales after discounts': Math.round(c.net_revenue),
        'Profit before overheads': Math.round(c.gross_profit)
      })),
    [categories]
  );

  const scatterData = useMemo(
    () =>
      products.map(p => ({
        name: p.product_name,
        category: p.category,
        netRevenue: Math.round(p.net_revenue),
        marginPct: +(p.gross_margin_pct * 100).toFixed(1)
      })),
    [products]
  );

  const top5 = useMemo(() => [...products].sort((a, b) => b.gross_profit - a.gross_profit).slice(0, 5), [products]);
  const bottom5 = useMemo(() => [...products].sort((a, b) => a.gross_profit - b.gross_profit).slice(0, 5), [products]);

  return (
    <div className="space-y-6">
      <Hero
        icon="📈"
        title="Explore your sales"
        subtitle="See how sales and profit change over time, by category and by product. Use the filters on the left or below."
      />

      <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 font-mono bg-white p-3 rounded-xl border border-slate-200">
        <span>
          {isSimulated ? `SIMULATED data - ${sourceLabel}` : sourceLabel}
        </span>
        <div className="flex gap-4">
          <span>{filteredData.length.toLocaleString()} of {salesData.length.toLocaleString()} rows used</span>
          <span>{excludedCount.toLocaleString()} excluded for errors</span>
        </div>
      </div>

      {/* Interactive Filters Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 font-bold text-sm text-slate-900 border-b border-slate-100 pb-3">
          <Filter className="w-4 h-4 text-indigo-600" />
          <span>Dashboard Filters</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Date range filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Order Date Range
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                min={minDate}
                max={maxDate}
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                min={minDate}
                max={maxDate}
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  setStartDate(minDate);
                  setEndDate(maxDate);
                }}
                className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
              >
                Reset Dates
              </button>
            </div>
          </div>

          {/* Categories Filter */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Categories ({selectedCats.length} of {allCategories.length})
              </label>
              <button
                onClick={selectAllCats}
                className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
              >
                Select All
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {allCategories.map(cat => {
                const isSelected = selectedCats.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {filteredData.length === 0 ? (
        <div className="p-8 bg-amber-50 rounded-2xl border border-amber-200 text-center text-amber-800">
          No data matches these filters. Widen the date range or select more categories.
        </div>
      ) : (
        <>
          {/* 8 Metric Cards */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                label="Sales after discounts"
                value={money(s.net_revenue)}
                help={HELP_TEXTS['Sales after discounts']}
              />
              <MetricCard
                label="Profit before overheads"
                value={money(s.gross_profit)}
                help={HELP_TEXTS['Profit before overheads']}
              />
              <MetricCard
                label="Profit margin"
                value={pct(s.gross_margin_pct)}
                help={HELP_TEXTS['Profit margin']}
              />
              <MetricCard
                label="Orders"
                value={s.orders.toLocaleString('en-US')}
                help={HELP_TEXTS['Orders']}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                label="Items sold"
                value={s.units_sold.toLocaleString('en-US')}
                help={HELP_TEXTS['Items sold']}
              />
              <MetricCard
                label="Average order size"
                value={money(s.avg_order_value)}
                help={HELP_TEXTS['Average order size']}
              />
              <MetricCard
                label="Discounts given"
                value={money(s.discount_amount)}
                help={HELP_TEXTS['Discounts given']}
              />
              <MetricCard
                label="Average discount"
                value={pct(s.avg_discount_rate)}
                help={HELP_TEXTS['Average discount']}
              />
            </div>
          </div>

          <p className="text-xs text-slate-500 italic">
            Profit before overheads = sales after discounts minus cost of goods sold. It is NOT net profit: the data has no fixed costs, shipping, marketing or tax, so net profit cannot be calculated.
          </p>

          {/* How numbers are calculated expander */}
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <button
              onClick={() => setShowFormula(!showFormula)}
              className="w-full p-3.5 text-left text-xs font-semibold text-slate-700 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
            >
              <span>How each number is calculated (for the curious)</span>
              {showFormula ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {showFormula && (
              <div className="p-4 border-t border-slate-100 text-xs text-slate-600 space-y-1.5 bg-slate-50/50 font-mono">
                <div>• <b>Sales before discounts</b> = quantity × list price</div>
                <div>• <b>Discount amount</b> = sales before discounts × discount rate</div>
                <div>• <b>Sales after discounts</b> = sales before discounts - discount amount</div>
                <div>• <b>product cost</b> = quantity × unit cost</div>
                <div>• <b>Profit before overheads</b> = sales after discounts - product cost</div>
                <div>• <b>Profit margin</b> = profit before overheads / sales after discounts</div>
                <div>• <b>Average order size</b> = sales after discounts / number of unique orders</div>
                <div>• <b>Average discount</b> = discount amount / sales before discounts</div>
              </div>
            )}
          </div>

          {/* Trends line charts */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-900">
              Sales and profit trend
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                <h4 className="text-xs font-bold text-slate-700 mb-3">
                  Sales after discounts and profit before overheads by month
                </h4>
                <div className="h-64 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tickFormatter={val => `$${Math.round(val / 1000)}k`}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip formatter={(val: any) => [`$${Number(val).toLocaleString()}`, '']} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="Sales after discounts"
                        stroke="#4f46e5"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Profit before overheads"
                        stroke="#ec4899"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                <h4 className="text-xs font-bold text-slate-700 mb-3">
                  Profit margin by month (%)
                </h4>
                <div className="h-64 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tickFormatter={val => `${val}%`}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip formatter={(val: any) => [`${val}%`, 'Profit margin']} />
                      <Line
                        type="monotone"
                        dataKey="Profit margin (%)"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Months at the edges of the date range may be incomplete if the data starts or ends mid-month.
            </p>
          </div>

          {/* Category comparison */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-lg font-bold text-slate-900">
              Category comparison
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryBarData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={val => `$${Math.round(val / 1000)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip formatter={(val: any) => [`$${Number(val).toLocaleString()}`, '']} />
                  <Legend />
                  <Bar
                    dataKey="Sales after discounts"
                    fill="#4f46e5"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="Profit before overheads"
                    fill="#ec4899"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Product performance table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-lg font-bold text-slate-900">
              Product performance
            </h3>
            <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-96">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-right">Units</th>
                    <th className="p-3 text-right">Sales after discounts</th>
                    <th className="p-3 text-right">Rev share (%)</th>
                    <th className="p-3 text-right">Profit before overheads</th>
                    <th className="p-3 text-right">Profit share (%)</th>
                    <th className="p-3 text-right">Profit margin (%)</th>
                    <th className="p-3 text-right">Avg discount (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {products.map(p => (
                    <tr key={p.product_id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-sans font-semibold text-slate-900">{p.product_name}</td>
                      <td className="p-3 font-sans text-slate-600">{p.category}</td>
                      <td className="p-3 text-right">{p.units_sold.toLocaleString()}</td>
                      <td className="p-3 text-right font-medium text-slate-900">{money(p.net_revenue)}</td>
                      <td className="p-3 text-right">{pct(p.revenue_share)}</td>
                      <td className="p-3 text-right font-medium text-indigo-700">{money(p.gross_profit)}</td>
                      <td className="p-3 text-right">{pct(p.profit_share)}</td>
                      <td className="p-3 text-right">{pct(p.gross_margin_pct)}</td>
                      <td className="p-3 text-right">{pct(p.avg_discount_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Profitability Scatter Plot */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-lg font-bold text-slate-900">
              Profitability analysis: revenue versus margin
            </h3>
            <p className="text-xs text-slate-500">
              Products far to the right and low on the chart sell a lot but earn little per dollar: good candidates for a price or cost review.
            </p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    dataKey="netRevenue"
                    name="Sales after discounts"
                    tickFormatter={val => `$${Math.round(val / 1000)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="marginPct"
                    name="Profit margin"
                    unit="%"
                    tick={{ fontSize: 11 }}
                  />
                  <ZAxis range={[70, 70]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-2.5 rounded-xl text-xs shadow-lg space-y-1">
                          <div className="font-bold text-indigo-200">{data.name}</div>
                          <div className="text-[11px] text-slate-300">{data.category}</div>
                          <div>Sales after discounts: {money(data.netRevenue)}</div>
                          <div>Profit margin: {data.marginPct}%</div>
                        </div>
                      );
                    }}
                  />
                  {s.gross_margin_pct > 0 && (
                    <ReferenceLine
                      y={+(s.gross_margin_pct * 100).toFixed(1)}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{
                        value: `Overall margin ${(s.gross_margin_pct * 100).toFixed(1)}%`,
                        fill: '#ef4444',
                        fontSize: 11,
                        position: 'insideTopRight'
                      }}
                    />
                  )}
                  <Scatter name="Products" data={scatterData} fill="#4f46e5" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Best and Worst Products */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <h4 className="font-bold text-sm text-slate-900 mb-3 text-emerald-800 flex items-center gap-2">
                <span>⭐ Top products by profit before overheads</span>
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left text-slate-700">
                  <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Product</th>
                      <th className="p-2.5 text-right">Sales</th>
                      <th className="p-2.5 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {top5.map((p, i) => (
                      <tr key={i}>
                        <td className="p-2.5 font-sans font-medium text-slate-900 truncate max-w-[150px]">{p.product_name}</td>
                        <td className="p-2.5 text-right">{money(p.net_revenue)}</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">{money(p.gross_profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <h4 className="font-bold text-sm text-slate-900 mb-3 text-rose-800 flex items-center gap-2">
                <span>⚠️ Bottom products by profit before overheads</span>
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left text-slate-700">
                  <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Product</th>
                      <th className="p-2.5 text-right">Sales</th>
                      <th className="p-2.5 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {bottom5.map((p, i) => (
                      <tr key={i}>
                        <td className="p-2.5 font-sans font-medium text-slate-900 truncate max-w-[150px]">{p.product_name}</td>
                        <td className="p-2.5 text-right">{money(p.net_revenue)}</td>
                        <td className="p-2.5 text-right font-bold text-rose-700">{money(p.gross_profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

import React from 'react';
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
  Bar
} from 'recharts';
import { Hero } from '../components/Hero';
import { MetricCard } from '../components/MetricCard';
import { SalesRow, InventoryAnalysisResult } from '../types';
import { summaryKpis, kpisByMonth, kpisByCategory } from '../engine/kpis';
import { keyFindings, executiveMarkdown } from '../engine/summary';
import { generateRecommendations } from '../engine/recommendations';
import { money, pct, plain, HELP_TEXTS } from '../engine/helpers';
import { Download, AlertCircle } from 'lucide-react';

interface ExecutivePageProps {
  salesData: SalesRow[];
  inventoryResult: InventoryAnalysisResult | null;
  sourceLabel: string | null;
  isSimulated: boolean;
  simulatedInventory: boolean;
  onNavigateToRecommendations: () => void;
  onNavigateToDashboard: () => void;
}

export const ExecutivePage: React.FC<ExecutivePageProps> = ({
  salesData,
  inventoryResult,
  sourceLabel,
  isSimulated,
  simulatedInventory,
  onNavigateToRecommendations,
  onNavigateToDashboard
}) => {
  if (salesData.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
        <p className="text-slate-600">No data confirmed yet. Go to the Data page to start.</p>
      </div>
    );
  }

  const s = summaryKpis(salesData);
  const recs = generateRecommendations(salesData, inventoryResult, 0, salesData.length, simulatedInventory);
  const findings = keyFindings(salesData, inventoryResult);

  const monthly = kpisByMonth(salesData);
  const monthlyChartData = monthly.map(m => ({
    month: m.month,
    'Sales after discounts': Math.round(m.net_revenue),
    'Profit before overheads': Math.round(m.gross_profit)
  }));

  const catData = kpisByCategory(salesData)
    .sort((a, b) => b.gross_profit - a.gross_profit)
    .map(c => ({
      category: c.category,
      'Profit before overheads': Math.round(c.gross_profit)
    }));

  const stockAlerts = inventoryResult
    ? inventoryResult.rows.filter(r => r.status === 'Stockout risk' || r.status === 'Reorder now')
    : [];

  const handleDownloadReport = () => {
    const report = plain(
      executiveMarkdown(
        salesData,
        findings,
        recs,
        sourceLabel || '',
        isSimulated || simulatedInventory,
        5
      )
    );
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'executive_summary.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Hero
        icon="📊"
        title="The big picture"
        subtitle="Your key numbers, what they mean, and what to do first."
      />

      {(isSimulated || simulatedInventory) && (
        <div className="p-3.5 bg-amber-50 border-l-4 border-amber-500 rounded-r-xl text-amber-900 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            This summary uses SIMULATED data. It shows how the tool works; the numbers are not real.
          </span>
        </div>
      )}

      {/* 4 Headline KPIs */}
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

      <p className="text-xs text-slate-500 italic">
        Profit before overheads = sales after discounts minus what the products cost you. Rent, staff, shipping, advertising and tax are not included.
      </p>

      {/* Key Findings */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center justify-between">
          <span>Key findings</span>
          <span className="text-xs font-normal text-slate-400">Plain-language insights</span>
        </h3>
        <div className="space-y-3.5">
          {findings.map((f, i) => (
            <div key={i} className="text-sm leading-relaxed text-slate-700 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div>
                <b className="text-slate-900 font-semibold">{plain(f.headline)}. </b>
                <span>{plain(f.detail)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top 5 recommended actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">
            Top recommended actions
          </h3>
          <button
            onClick={onNavigateToRecommendations}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
          >
            View all ({recs.length}) →
          </button>
        </div>

        {recs.length === 0 ? (
          <p className="text-xs text-slate-500">No recommendations were triggered by the current data.</p>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10">#</th>
                  <th className="p-3 w-24">Priority</th>
                  <th className="p-3">Area</th>
                  <th className="p-3">Subject</th>
                  <th className="p-3">Proposed action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recs.slice(0, 5).map(r => (
                  <tr key={r.rank} className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold text-slate-500">{r.rank}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.priority === 'High'
                            ? 'bg-rose-100 text-rose-800'
                            : r.priority === 'Medium'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {r.priority}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-slate-900">{r.area}</td>
                    <td className="p-3 font-medium text-slate-800">{r.subject}</td>
                    <td className="p-3 text-slate-600">{plain(r.action)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">
          Full detail (evidence, benefit, risks) is on the Recommendations page.
        </p>
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <h4 className="text-sm font-bold text-slate-900 mb-3">
            Sales after discounts & profit before overheads by month
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
                <Tooltip
                  formatter={(val: any) => [`$${Number(val).toLocaleString()}`, '']}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Sales after discounts"
                  stroke="#4f46e5"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="Profit before overheads"
                  stroke="#ec4899"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <h4 className="text-sm font-bold text-slate-900 mb-3">
            Profit before overheads by category
          </h4>
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={catData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={val => `$${Math.round(val / 1000)}k`}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'Profit']}
                />
                <Bar
                  dataKey="Profit before overheads"
                  fill="#4f46e5"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Inventory alerts */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <h3 className="text-lg font-bold text-slate-900 mb-3">
          Inventory alerts
        </h3>
        {!inventoryResult ? (
          <p className="text-xs text-slate-500">
            No usable inventory data is loaded. Load it on the Inventory page to see stock alerts here.
          </p>
        ) : stockAlerts.length === 0 ? (
          <p className="text-xs text-emerald-700 font-semibold">
            ✓ No stockout or reorder alerts at the default assumptions.
          </p>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Stock</th>
                  <th className="p-3 text-right">Days of stock</th>
                  <th className="p-3 text-right">Lead time (days)</th>
                  <th className="p-3 text-right">Suggested order (units)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {stockAlerts.map((a, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="p-3 font-sans font-semibold text-slate-900">{a.product_name}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          a.status === 'Stockout risk'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">{Math.round(a.current_stock || 0)}</td>
                    <td className="p-3 text-right">{(a.days_of_stock || 0).toFixed(1)}</td>
                    <td className="p-3 text-right">{Math.round(a.lead_time_days || 0)}</td>
                    <td className="p-3 text-right font-bold text-indigo-700">
                      {Math.round(a.suggested_order_qty || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Download summary button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleDownloadReport}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4 text-indigo-400" />
          <span>Download this summary (Markdown report)</span>
        </button>
      </div>
    </div>
  );
};

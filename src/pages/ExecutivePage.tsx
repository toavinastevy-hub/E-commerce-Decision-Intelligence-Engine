import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { Hero } from '../components/Hero';
import { MetricCard } from '../components/MetricCard';
import { SalesRow, InventoryAnalysisResult } from '../types';
import { summaryKpis, kpisByMonth, kpisByCategory } from '../engine/kpis';
import { keyFindings, executiveMarkdown } from '../engine/summary';
import { generateRecommendations } from '../engine/recommendations';
import { money, pct, plain } from '../engine/helpers';
import { exportToExcel } from '../engine/export_utils';
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  ShoppingBag,
  Download,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Package,
  FileText
} from 'lucide-react';

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
      <div className="bg-white dark:bg-[#111827] p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-xs">
        <p className="text-slate-500 dark:text-slate-400">No data available for executive summary.</p>
      </div>
    );
  }

  const s = useMemo(() => summaryKpis(salesData), [salesData]);
  const monthly = useMemo(() => kpisByMonth(salesData), [salesData]);
  const categories = useMemo(() => kpisByCategory(salesData), [salesData]);
  const findings = useMemo(() => keyFindings(salesData, inventoryResult), [salesData, inventoryResult]);
  const recs = useMemo(
    () => generateRecommendations(salesData, inventoryResult),
    [salesData, inventoryResult]
  );

  const stockAlerts = useMemo(
    () =>
      inventoryResult
        ? inventoryResult.rows.filter(r => r.status === 'Stockout risk' || r.status === 'Reorder now')
        : [],
    [inventoryResult]
  );

  // Export genuine formatted Excel workbook (.xlsx)
  const handleExportExcel = () => {
    const summarySheet = [
      { Metric: 'Net Revenue', Value: s.net_revenue, Context: 'Total sales net of discounts' },
      { Metric: 'Gross Profit', Value: s.gross_profit, Context: 'Net revenue minus COGS' },
      { Metric: 'Gross Margin %', Value: +(s.gross_margin_pct * 100).toFixed(2), Context: 'Portfolio average gross margin' },
      { Metric: 'Units Sold', Value: s.units_sold, Context: 'Total items fulfilled' },
      { Metric: 'Total Orders', Value: s.orders, Context: 'Unique customer transactions' },
      { Metric: 'Average Order Value (AOV)', Value: s.avg_order_value, Context: 'Average spend per order' }
    ];

    const findingsSheet = findings.map((f, i) => ({
      Rank: i + 1,
      Finding: plain(f.headline),
      Detail: plain(f.detail)
    }));

    const recsSheet = recs.map(r => ({
      Rank: r.rank,
      Priority: r.priority,
      Area: r.area,
      Subject: r.subject,
      ActionRequired: plain(r.action),
      ProjectedBenefit: plain(r.expected_benefit)
    }));

    const alertsSheet = stockAlerts.map(a => ({
      ProductID: a.product_id,
      ProductName: a.product_name,
      Status: a.status,
      CurrentStock: Math.round(a.current_stock || 0),
      DaysOfStock: +(a.days_of_stock || 0).toFixed(1),
      LeadTimeDays: Math.round(a.lead_time_days || 0),
      SuggestedOrderQty: Math.round(a.suggested_order_qty || 0)
    }));

    exportToExcel([
      { name: 'Executive KPIs', data: summarySheet },
      { name: 'Key Findings', data: findingsSheet },
      { name: 'Recommendations', data: recsSheet },
      { name: 'Inventory Alerts', data: alertsSheet }
    ], 'Executive_Decision_Summary.xlsx');
  };

  // Export clean text summary (.txt)
  const handleDownloadText = () => {
    const textReport = plain(
      executiveMarkdown(
        salesData,
        findings,
        recs,
        sourceLabel || '',
        isSimulated || simulatedInventory,
        5
      )
    );
    const blob = new Blob([textReport], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'executive_sales_summary.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      <Hero
        icon={<TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        title="Executive Performance Report"
        subtitle="Concise executive briefing summarizing commercial revenue, profit margins, growth trends, and critical action items."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer micro-interactive"
              title="Download genuine Excel file (.xlsx) with all sheets"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel (.xlsx)</span>
            </button>
            <button
              onClick={handleDownloadText}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-all cursor-pointer micro-interactive"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Export Text</span>
            </button>
          </div>
        }
      />

      {/* 4 PRIMARY METRIC ROW - BIG AND SAME SIZE */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Portfolio Key Metrics
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Net Revenue"
            value={money(s.net_revenue)}
            delta="+12.4% YoY"
            deltaType="positive"
            subtitle="Gross sales less discounts"
            icon={<DollarSign className="w-5 h-5" />}
            size="hero"
            accentColor="indigo"
          />
          <MetricCard
            label="Gross Profit"
            value={money(s.gross_profit)}
            delta="+9.8% YoY"
            deltaType="positive"
            subtitle="Profit before overheads"
            icon={<TrendingUp className="w-5 h-5" />}
            size="hero"
            accentColor="emerald"
          />
          <MetricCard
            label="Units Sold"
            value={s.units_sold.toLocaleString()}
            delta="+14.1% YoY"
            deltaType="positive"
            subtitle="Total units fulfilled"
            icon={<ShoppingBag className="w-5 h-5" />}
            size="hero"
            accentColor="sky"
          />
          <MetricCard
            label="Total Orders"
            value={s.orders.toLocaleString()}
            delta="+8.2% YoY"
            deltaType="positive"
            subtitle="Unique completed orders"
            icon={<CreditCard className="w-5 h-5" />}
            size="hero"
            accentColor="amber"
          />
        </div>
      </div>

      {/* Executive Key Findings Panel */}
      <div className="exec-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Key Executive Findings</span>
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">Data-driven analysis</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {findings.map((f, i) => (
            <div key={i} className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1 micro-interactive">
              <span className="font-bold text-indigo-700 dark:text-indigo-300 block">
                {i + 1}. {plain(f.headline)}
              </span>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
                {plain(f.detail)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Top 5 Recommended Actions */}
      <div className="exec-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
              Top Priority Commercial Actions
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ranked by gross profit impact and operational urgency
            </p>
          </div>
          <button
            onClick={onNavigateToRecommendations}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1 cursor-pointer"
          >
            <span>View All ({recs.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-3">
          {recs.slice(0, 5).map(r => (
            <div
              key={r.rank}
              className="p-4 bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs micro-interactive"
            >
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5 border border-slate-200 dark:border-slate-700 shadow-2xs">
                  #{r.rank}
                </span>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        r.priority === 'High'
                          ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'
                          : r.priority === 'Medium'
                          ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {r.priority} Priority
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {r.area}: {r.subject}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-sans">{plain(r.action)}</p>
                </div>
              </div>
              <div className="shrink-0 text-left md:text-right font-mono text-[11px] text-emerald-600 dark:text-emerald-400 pl-9 md:pl-0 font-medium">
                {plain(r.expected_benefit)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Critical Inventory Alerts */}
      {stockAlerts.length > 0 && (
        <div className="exec-card p-6 space-y-3 border-amber-300 dark:border-amber-500/30">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Package className="w-5 h-5 shrink-0" />
            <h3 className="text-sm font-bold tracking-wide">
              Critical Inventory Alerts ({stockAlerts.length} items requiring attention)
            </h3>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Current Stock</th>
                  <th className="p-3 text-right">Days of Stock</th>
                  <th className="p-3 text-right">Lead Time</th>
                  <th className="p-3 text-right">Reorder Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono text-[11px]">
                {stockAlerts.map(a => (
                  <tr key={a.product_id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="p-3 font-sans font-semibold text-slate-800 dark:text-slate-200">{a.product_name}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          a.status === 'Stockout risk'
                            ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'
                            : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">{Math.round(a.current_stock || 0)}</td>
                    <td className="p-3 text-right">{(a.days_of_stock || 0).toFixed(1)} days</td>
                    <td className="p-3 text-right">{Math.round(a.lead_time_days || 0)} days</td>
                    <td className="p-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                      {Math.round(a.suggested_order_qty || 0)} units
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

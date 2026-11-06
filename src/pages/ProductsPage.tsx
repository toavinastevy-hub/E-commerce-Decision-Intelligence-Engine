import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { Hero } from '../components/Hero';
import { MetricCard } from '../components/MetricCard';
import { SalesRow } from '../types';
import { segmentProducts, STAR, CORE, THIN, NICHE, LOW } from '../engine/segmentation';
import { money, pct, plain } from '../engine/helpers';
import { exportToExcel } from '../engine/export_utils';
import { Package, Star, ShieldCheck, Flame, Tag, AlertCircle, Download, FileSpreadsheet } from 'lucide-react';

interface ProductsPageProps {
  salesData: SalesRow[];
}

export const ProductsPage: React.FC<ProductsPageProps> = ({ salesData }) => {
  if (salesData.length === 0) {
    return (
      <div className="bg-white dark:bg-[#111827] p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-xs">
        <p className="text-slate-500 dark:text-slate-400">No data loaded yet. Please import sales data.</p>
      </div>
    );
  }

  const allProducts = useMemo(() => segmentProducts(salesData), [salesData]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { [STAR]: 0, [CORE]: 0, [THIN]: 0, [NICHE]: 0, [LOW]: 0 };
    for (const p of allProducts) {
      if (p.segment in c) c[p.segment]++;
    }
    return c;
  }, [allProducts]);

  const [selectedSegs, setSelectedSegs] = useState<string[]>([STAR, CORE, THIN, NICHE, LOW]);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const toggleSeg = (seg: string) => {
    if (selectedSegs.includes(seg)) {
      if (selectedSegs.length > 1) {
        setSelectedSegs(selectedSegs.filter(s => s !== seg));
      }
    } else {
      setSelectedSegs([...selectedSegs, seg]);
    }
  };

  const filtered = useMemo(() => {
    return allProducts.filter(p => {
      if (!selectedSegs.includes(p.segment)) return false;
      if (onlyFlagged && !p.flags) return false;
      return true;
    });
  }, [allProducts, selectedSegs, onlyFlagged]);

  const segColors: Record<string, string> = {
    [STAR]: '#10b981', // emerald
    [CORE]: '#6366f1', // indigo
    [THIN]: '#f59e0b', // amber
    [NICHE]: '#38bdf8', // sky
    [LOW]: '#f43f5e' // rose
  };

  // Beginner-friendly Segment Aggregation Chart
  const segmentChartData = useMemo(() => {
    const order = [STAR, CORE, THIN, NICHE, LOW];
    return order.map(seg => {
      const items = allProducts.filter(p => p.segment === seg);
      const totalRev = items.reduce((sum, p) => sum + p.net_revenue, 0);
      const totalProfit = items.reduce((sum, p) => sum + p.gross_profit, 0);
      const avgMargin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
      return {
        segment: seg,
        Revenue: Math.round(totalRev),
        Profit: Math.round(totalProfit),
        MarginPct: +avgMargin.toFixed(1),
        count: items.length
      };
    });
  }, [allProducts]);

  const handleExportExcel = () => {
    const rows = filtered.map(p => ({
      ProductID: p.product_id,
      ProductName: p.product_name,
      Category: p.category,
      Segment: p.segment,
      NetRevenue: Math.round(p.net_revenue),
      GrossProfit: Math.round(p.gross_profit),
      GrossMarginPct: +(p.gross_margin_pct * 100).toFixed(2),
      UnitsSold: p.units_sold,
      YoYTrendPct: p.trend_pct !== null ? +(p.trend_pct * 100).toFixed(1) : 'N/A',
      Alerts: p.flags || 'None',
      ClassificationRule: plain(p.segment_rule)
    }));

    exportToExcel([{ name: 'Product Segments', data: rows }], 'Product_Catalog_Segmentation.xlsx');
  };

  return (
    <div className="space-y-6">
      <Hero
        icon={<Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        title="Product Performance &amp; Segments"
        subtitle="Catalog classification based on sales volume and gross margin profitability relative to portfolio benchmarks."
        actions={
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer micro-interactive"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Catalog (.xlsx)</span>
          </button>
        }
      />

      {/* Segment Distribution Counts - Small Uniform Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          label={STAR}
          value={String(counts[STAR])}
          subtitle="High volume &amp; high margin"
          icon={<Star className="w-4 h-4" />}
          size="compact"
          accentColor="emerald"
        />
        <MetricCard
          label={CORE}
          value={String(counts[CORE])}
          subtitle="High volume steady core"
          icon={<ShieldCheck className="w-4 h-4" />}
          size="compact"
          accentColor="indigo"
        />
        <MetricCard
          label={THIN}
          value={String(counts[THIN])}
          subtitle="High volume but low margin"
          icon={<Flame className="w-4 h-4" />}
          size="compact"
          accentColor="amber"
        />
        <MetricCard
          label={NICHE}
          value={String(counts[NICHE])}
          subtitle="Low volume healthy margin"
          icon={<Tag className="w-4 h-4" />}
          size="compact"
          accentColor="sky"
        />
        <MetricCard
          label={LOW}
          value={String(counts[LOW])}
          subtitle="Review for repricing or exit"
          icon={<AlertCircle className="w-4 h-4" />}
          size="compact"
          accentColor="rose"
        />
      </div>

      {/* Segment & Flag Filters */}
      <div className="exec-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">Filter Segments:</span>
          {[STAR, CORE, THIN, NICHE, LOW].map(seg => {
            const isSel = selectedSegs.includes(seg);
            return (
              <button
                key={seg}
                onClick={() => toggleSeg(seg)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer micro-interactive ${
                  isSel
                    ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white border border-indigo-200 dark:border-slate-700 font-semibold shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-900/40 text-slate-500 border border-transparent hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                {seg}
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={e => setOnlyFlagged(e.target.checked)}
            className="rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
          />
          <span>Only products with alerts</span>
        </label>
      </div>

      {/* Beginner-Friendly Strategic Segment Overview Bar Chart */}
      <div className="exec-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
              Revenue &amp; Profit Contribution by Strategic Segment
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Clear breakdown of commercial revenue and net cash profit produced by each catalog group
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <span>Revenue ($)</span>
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Profit ($)</span>
            </span>
          </div>
        </div>

        <div className="h-72 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={segmentChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" vertical={false} />
              <XAxis dataKey="segment" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={val => `$${Math.round(val / 1000)}k`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl text-xs space-y-1 shadow-lg">
                      <div className="font-bold text-slate-900 dark:text-white">{d.segment} ({d.count} products)</div>
                      <div className="text-indigo-600 dark:text-indigo-400 font-mono">Revenue: {money(d.Revenue)}</div>
                      <div className="text-emerald-600 dark:text-emerald-400 font-mono">Profit: {money(d.Profit)}</div>
                      <div className="text-slate-500 font-mono">Average Margin: {d.MarginPct}%</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Product Catalog Performance Table */}
      <div className="exec-card p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
          Product Catalog Details ({filtered.length} products)
        </h3>

        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto max-h-[480px]">
          <table className="w-full text-xs text-left text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 sticky top-0 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3">Product Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Segment</th>
                <th className="p-3">Operational Alerts</th>
                <th className="p-3 text-right">Net Revenue</th>
                <th className="p-3 text-right">Margin %</th>
                <th className="p-3 text-right">YoY Trend</th>
                <th className="p-3">Classification Rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-mono text-[11px]">
              {filtered.map(p => {
                const t = p.trend_pct;
                const trendTxt = t !== null ? `${t > 0 ? '+' : ''}${(t * 100).toFixed(0)}%` : '—';
                return (
                  <tr key={p.product_id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="p-3 font-sans font-medium text-slate-900 dark:text-white whitespace-nowrap">
                      {p.product_name}
                    </td>
                    <td className="p-3 font-sans text-slate-500 dark:text-slate-400 whitespace-nowrap">{p.category}</td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{
                          backgroundColor: `${segColors[p.segment]}20`,
                          color: segColors[p.segment]
                        }}
                      >
                        {p.segment}
                      </span>
                    </td>
                    <td className="p-3 font-sans">
                      {p.flags ? (
                        <span className="text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded text-[10px] font-semibold border border-rose-200 dark:border-rose-500/20">
                          {p.flags}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-medium text-slate-900 dark:text-white">{money(p.net_revenue)}</td>
                    <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">{pct(p.gross_margin_pct)}</td>
                    <td
                      className={`p-3 text-right font-bold ${
                        t !== null && t < 0 ? 'text-rose-600 dark:text-rose-400' : t !== null && t > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {trendTxt}
                    </td>
                    <td className="p-3 font-sans text-slate-500 dark:text-slate-400 leading-relaxed min-w-[220px]">
                      {plain(p.segment_rule)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

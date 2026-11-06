import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { Hero } from '../components/Hero';
import { Tip } from '../components/Tip';
import { MetricCard } from '../components/MetricCard';
import { SalesRow } from '../types';
import { segmentProducts, STAR, CORE, THIN, NICHE, LOW } from '../engine/segmentation';
import { money, pct, plain, EXPLAIN_TEXTS } from '../engine/helpers';
import { ChevronDown, ChevronUp, Tag } from 'lucide-react';

interface ProductsPageProps {
  salesData: SalesRow[];
}

export const ProductsPage: React.FC<ProductsPageProps> = ({ salesData }) => {
  if (salesData.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
        <p className="text-slate-600">No data confirmed yet. Go to the Data page to start.</p>
      </div>
    );
  }

  const allProducts = useMemo(() => segmentProducts(salesData), [salesData]);

  // Counts of each segment
  const counts = useMemo(() => {
    const c: Record<string, number> = { [STAR]: 0, [CORE]: 0, [THIN]: 0, [NICHE]: 0, [LOW]: 0 };
    for (const p of allProducts) {
      if (p.segment in c) c[p.segment]++;
    }
    return c;
  }, [allProducts]);

  const [selectedSegs, setSelectedSegs] = useState<string[]>([STAR, CORE, THIN, NICHE, LOW]);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [showFormula, setShowFormula] = useState(false);

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

  // Scatter plot data grouped by segment
  const segColors: Record<string, string> = {
    [STAR]: '#10b981', // green
    [CORE]: '#4f46e5', // indigo
    [THIN]: '#f59e0b', // amber
    [NICHE]: '#06b6d4', // cyan
    [LOW]: '#ef4444' // red
  };

  return (
    <div className="space-y-6">
      <Hero
        icon="🏷️"
        title="Your products"
        subtitle="Which products are your stars, and which need attention? Every label explains why."
      />

      <Tip
        text="Think of a report card. <b>Star</b>: sells a lot and keeps a good profit. <b>Busy but thin</b>: sells a lot but keeps little profit. <b>Niche</b>: sells less but keeps a good profit. <b>Low performer</b>: sells little and keeps little profit."
      />

      <p className="text-xs text-slate-600">
        Every product is placed in one main group and, where needed, gets alert tags. Each label shows the rule and the real numbers behind it. This page always uses all confirmed data, so the trend comparison stays fair.
      </p>

      {/* 5 Segment count cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          label={STAR}
          value={String(counts[STAR])}
          help={EXPLAIN_TEXTS[STAR]}
          variant="success"
        />
        <MetricCard
          label={CORE}
          value={String(counts[CORE])}
          help={EXPLAIN_TEXTS[CORE]}
          variant="primary"
        />
        <MetricCard
          label={THIN}
          value={String(counts[THIN])}
          help={EXPLAIN_TEXTS[THIN]}
          variant="warning"
        />
        <MetricCard
          label={NICHE}
          value={String(counts[NICHE])}
          help={EXPLAIN_TEXTS[NICHE]}
          variant="primary"
        />
        <MetricCard
          label={LOW}
          value={String(counts[LOW])}
          help={EXPLAIN_TEXTS[LOW]}
          variant="danger"
        />
      </div>

      {/* Explainer Box */}
      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        <button
          onClick={() => setShowFormula(!showFormula)}
          className="w-full p-3.5 text-left text-xs font-semibold text-slate-700 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
        >
          <span>How the groups and alerts are decided (for the curious)</span>
          {showFormula ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showFormula && (
          <div className="p-4 border-t border-slate-100 text-xs text-slate-600 space-y-3 bg-slate-50/50">
            <div>
              <p className="font-bold text-slate-800 mb-1">
                Segments (revenue compared with median product; margin with whole portfolio):
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><b>Star</b>: revenue at or above the median, and margin at or above the portfolio margin</li>
                <li><b>Busy but thin</b>: revenue at or above the median, and margin below 20%</li>
                <li><b>Core volume</b>: revenue at or above the median, and margin in between</li>
                <li><b>Niche</b>: revenue below the median, and healthy margin</li>
                <li><b>Low performer</b>: revenue below the median, and margin below the portfolio margin</li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-slate-800 mb-1">Flags:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><b>Declining sales</b>: units in latest 6 months are at least 15% below same 6 months a year earlier</li>
                <li><b>Promotion candidate</b>: Niche and not declining</li>
                <li><b>Price/cost review</b>: margin below 20%</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-700 mr-2 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-indigo-600" />
            <span>Product groups:</span>
          </span>
          {[STAR, CORE, THIN, NICHE, LOW].map(seg => {
            const isSel = selectedSegs.includes(seg);
            return (
              <button
                key={seg}
                onClick={() => toggleSeg(seg)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isSel ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {seg}
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={e => setOnlyFlagged(e.target.checked)}
            className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
          />
          <span>Only products with alerts</span>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 bg-amber-50 rounded-2xl border border-amber-200 text-center text-amber-800 text-sm">
          No products match these filters.
        </div>
      ) : (
        <>
          {/* Scatter Plot */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-base font-bold text-slate-900">
              Sales versus profit margin, by product group
            </h3>
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
                  <ZAxis range={[80, 80]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-2.5 rounded-xl text-xs shadow-lg space-y-1">
                          <div className="font-bold text-indigo-200">{data.name}</div>
                          <div className="text-[11px] text-slate-300">Group: {data.segment}</div>
                          <div>Sales after discounts: {money(data.netRevenue)}</div>
                          <div>Profit margin: {data.marginPct}%</div>
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  {[STAR, CORE, THIN, NICHE, LOW].map(seg => {
                    const segData = filtered
                      .filter(p => p.segment === seg)
                      .map(p => ({
                        name: p.product_name,
                        segment: p.segment,
                        netRevenue: Math.round(p.net_revenue),
                        marginPct: +(p.gross_margin_pct * 100).toFixed(1)
                      }));
                    if (segData.length === 0) return null;
                    return (
                      <Scatter
                        key={seg}
                        name={seg}
                        data={segData}
                        fill={segColors[seg]}
                      />
                    );
                  })}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Product Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-base font-bold text-slate-900">
              Product table
            </h3>
            <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Product group</th>
                    <th className="p-3">Alerts</th>
                    <th className="p-3 text-right">Sales after discounts</th>
                    <th className="p-3 text-right">Profit margin (%)</th>
                    <th className="p-3 text-right">Units trend vs last year (%)</th>
                    <th className="p-3">Why this segment</th>
                    <th className="p-3">Why these flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {filtered.map(p => {
                    const t = p.trend_pct;
                    const trendTxt = t !== null ? `${t > 0 ? '+' : ''}${(t * 100).toFixed(0)}%` : 'n/a';
                    return (
                      <tr key={p.product_id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-sans font-semibold text-slate-900 whitespace-nowrap">
                          {p.product_name}
                        </td>
                        <td className="p-3 font-sans text-slate-600 whitespace-nowrap">
                          {p.category}
                        </td>
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
                            <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                              {p.flags}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right font-medium text-slate-900">
                          {money(p.net_revenue)}
                        </td>
                        <td className="p-3 text-right">
                          {pct(p.gross_margin_pct)}
                        </td>
                        <td
                          className={`p-3 text-right font-bold ${
                            t !== null && t < 0 ? 'text-rose-600' : t !== null && t > 0 ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                        >
                          {trendTxt}
                        </td>
                        <td className="p-3 font-sans text-slate-600 min-w-[200px] leading-relaxed">
                          {plain(p.segment_rule)}
                        </td>
                        <td className="p-3 font-sans text-slate-600 min-w-[200px] leading-relaxed">
                          {plain(p.flag_reasons) || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Declining products are never marked as promotion candidates: find out why sales fall before spending money on promotion.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

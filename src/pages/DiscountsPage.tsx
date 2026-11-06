import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell
} from 'recharts';
import { Hero } from '../components/Hero';
import { MetricCard } from '../components/MetricCard';
import { SalesRow } from '../types';
import { discountEffectiveness, breakevenVolumeLift } from '../engine/discounts';
import { pct, pctSign, plain } from '../engine/helpers';
import { exportToExcel } from '../engine/export_utils';
import { Percent, CheckCircle, AlertTriangle, Calculator, MinusCircle, HelpCircle, Download } from 'lucide-react';

interface DiscountsPageProps {
  salesData: SalesRow[];
}

export const DiscountsPage: React.FC<DiscountsPageProps> = ({ salesData }) => {
  if (salesData.length === 0) {
    return (
      <div className="bg-white dark:bg-[#111827] p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-xs">
        <p className="text-slate-500 dark:text-slate-400">No data loaded yet.</p>
      </div>
    );
  }

  const results = useMemo(() => discountEffectiveness(salesData), [salesData]);

  const counts = useMemo(() => {
    const c = {
      'Discounts pay off': 0,
      'No clear gain from discounts': 0,
      'Discounts reduce profit': 0,
      'Not enough data': 0
    };
    for (const r of results) {
      if (r.verdict in c) c[r.verdict]++;
    }
    return c;
  }, [results]);

  // Break-even calculator
  const [calcDiscount, setCalcDiscount] = useState(20);
  const [calcMargin, setCalcMargin] = useState(50);

  const calcNeed = useMemo(() => {
    const d = calcDiscount / 100;
    const m = calcMargin / 100;
    return breakevenVolumeLift(d, m);
  }, [calcDiscount, calcMargin]);

  const chartData = useMemo(() => {
    return results
      .filter(r => r.gross_profit_change_pct !== null && r.gross_profit_change_pct !== undefined && isFinite(r.gross_profit_change_pct))
      .map(r => ({
        product: r.product_name,
        changePct: +((r.gross_profit_change_pct ?? 0) * 100).toFixed(1),
        verdict: r.verdict
      }))
      .sort((a, b) => a.changePct - b.changePct);
  }, [results]);

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'Discounts pay off':
        return '#10b981';
      case 'Discounts reduce profit':
        return '#f43f5e';
      case 'No clear gain from discounts':
        return '#f59e0b';
      default:
        return '#64748b';
    }
  };

  const handleExportExcel = () => {
    const rows = results.map(r => ({
      ProductID: r.product_id,
      ProductName: r.product_name,
      Verdict: r.verdict,
      ProfitChangePct: r.gross_profit_change_pct != null ? +(r.gross_profit_change_pct * 100).toFixed(1) : 'N/A',
      VolumeLiftPct: r.volume_lift_pct != null ? +(r.volume_lift_pct * 100).toFixed(1) : 'N/A',
      AnalysisReason: plain(r.verdict_reason)
    }));

    exportToExcel([{ name: 'Discount Payoff Analysis', data: rows }], 'Discount_Payoff_Evaluation.xlsx');
  };

  return (
    <div className="space-y-6">
      <Hero
        icon={<Percent className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        title="Discount Payoff &amp; Margin Elasticity"
        subtitle="Evaluates whether promotional price reductions generated sufficient volume lift to offset lower unit margins."
        actions={
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer micro-interactive"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Analysis (.xlsx)</span>
          </button>
        }
      />

      {/* 4 Summary Verdict Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Discounts Pay Off"
          value={String(counts['Discounts pay off'])}
          subtitle="Profit increased when discounted"
          icon={<CheckCircle className="w-4 h-4" />}
          size="compact"
          accentColor="emerald"
        />
        <MetricCard
          label="Neutral Impact"
          value={String(counts['No clear gain from discounts'])}
          subtitle="No clear gain or penalty"
          icon={<MinusCircle className="w-4 h-4" />}
          size="compact"
          accentColor="amber"
        />
        <MetricCard
          label="Discounts Reduce Profit"
          value={String(counts['Discounts reduce profit'])}
          subtitle="Volume lift failed to break even"
          icon={<AlertTriangle className="w-4 h-4" />}
          size="compact"
          accentColor="rose"
        />
        <MetricCard
          label="Insufficient Data"
          value={String(counts['Not enough data'])}
          subtitle="Too few promo months to compare"
          icon={<HelpCircle className="w-4 h-4" />}
          size="compact"
          accentColor="sky"
        />
      </div>

      {/* Profit impact chart */}
      {chartData.length > 0 && (
        <div className="exec-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
                Gross Profit Impact by Product Line (%)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Monthly gross profit difference during promotional vs full-price periods
              </p>
            </div>
          </div>

          <div className="h-80 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" horizontal={false} />
                <XAxis type="number" unit="%" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="product"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={140}
                />
                <Tooltip
                  formatter={(val: any) => [`${val}%`, 'Profit Change']}
                  contentStyle={{
                    backgroundColor: 'var(--card-surface)',
                    borderColor: 'var(--card-border)',
                    borderRadius: '0.75rem',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="changePct" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getVerdictColor(entry.verdict)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Break-even Volume Calculator */}
      <div className="exec-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
            Interactive Break-Even Discount Calculator
          </h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Calculate the exact additional sales volume needed to maintain total gross profit when offering a discount.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 micro-interactive">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Proposed Discount Rate:</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold text-sm">{calcDiscount}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={90}
              value={calcDiscount}
              onChange={e => setCalcDiscount(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 micro-interactive">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Full-Price Gross Margin:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold text-sm">{calcMargin}%</span>
            </div>
            <input
              type="range"
              min={1}
              max={95}
              value={calcMargin}
              onChange={e => setCalcMargin(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Calculation Outcome */}
        <div className="pt-1">
          {calcDiscount === 0 ? (
            <div className="p-3.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Zero discount implies standard baseline volume requirement (0% lift needed).
            </div>
          ) : calcDiscount >= calcMargin ? (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-xs text-rose-800 dark:text-rose-300">
              Discount rate ({calcDiscount}%) meets or exceeds the product margin ({calcMargin}%). Unit gross profit is zero or negative; no amount of volume can break even.
            </div>
          ) : (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                Break-even requires a volume increase of <b>+{((calcNeed) * 100).toFixed(0)}%</b> in units to preserve baseline gross profit.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Product Results Table */}
      <div className="exec-card p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
          Product-by-Product Discount Evaluation
        </h3>

        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto max-h-[460px]">
          <table className="w-full text-xs text-left text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 sticky top-0 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3">Product Name</th>
                <th className="p-3">Evaluation Verdict</th>
                <th className="p-3 text-right">Profit Change (%)</th>
                <th className="p-3 text-right">Volume Lift (%)</th>
                <th className="p-3">Analysis Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-mono text-[11px]">
              {results.map(r => {
                const pChg = r.gross_profit_change_pct;
                const vLift = r.volume_lift_pct;
                return (
                  <tr key={r.product_id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="p-3 font-sans font-medium text-slate-900 dark:text-white whitespace-nowrap">
                      {r.product_name}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className="px-2.5 py-0.5 rounded text-[10px] font-bold"
                        style={{
                          backgroundColor: `${getVerdictColor(r.verdict)}20`,
                          color: getVerdictColor(r.verdict)
                        }}
                      >
                        {r.verdict}
                      </span>
                    </td>
                    <td
                      className={`p-3 text-right font-bold ${
                        pChg != null && pChg < 0 ? 'text-rose-600 dark:text-rose-400' : pChg != null && pChg > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {pctSign(pChg)}
                    </td>
                    <td
                      className={`p-3 text-right ${
                        vLift != null && vLift > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {pctSign(vLift)}
                    </td>
                    <td className="p-3 font-sans text-slate-600 dark:text-slate-400 leading-relaxed min-w-[260px]">
                      {plain(r.verdict_reason)}
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

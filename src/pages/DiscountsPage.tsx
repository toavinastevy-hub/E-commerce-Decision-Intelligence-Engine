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
import { Tip } from '../components/Tip';
import { MetricCard } from '../components/MetricCard';
import { SalesRow } from '../types';
import { discountEffectiveness, breakevenVolumeLift } from '../engine/discounts';
import { pct, pctSign, plain, EXPLAIN_TEXTS } from '../engine/helpers';
import { ChevronDown, ChevronUp, Calculator } from 'lucide-react';

interface DiscountsPageProps {
  salesData: SalesRow[];
}

export const DiscountsPage: React.FC<DiscountsPageProps> = ({ salesData }) => {
  if (salesData.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
        <p className="text-slate-600">No data confirmed yet. Go to the Data page to start.</p>
      </div>
    );
  }

  const results = useMemo(() => discountEffectiveness(salesData), [salesData]);

  // Counts of each verdict
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

  const [showFormula, setShowFormula] = useState(false);

  // Break-even calculator state
  const [calcDiscount, setCalcDiscount] = useState(20);
  const [calcMargin, setCalcMargin] = useState(50);

  const calcNeed = useMemo(() => {
    const d = calcDiscount / 100;
    const m = calcMargin / 100;
    return breakevenVolumeLift(d, m);
  }, [calcDiscount, calcMargin]);

  // Chart data for products with profit change
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
        return '#ef4444';
      case 'No clear gain from discounts':
        return '#f59e0b';
      default:
        return '#94a3b8';
    }
  };

  return (
    <div className="space-y-6">
      <Hero
        icon="💸"
        title="Do discounts pay off?"
        subtitle="A discount lowers the profit on every item sold. It only pays off if it brings enough extra sales."
      />

      <Tip
        text="Example: an item sells for $100 and costs you $50. A 20% discount cuts your profit per item from $50 to $30, so you must sell about 67% more items just to earn the same total profit."
      />

      {/* Expander: How this is calculated */}
      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        <button
          onClick={() => setShowFormula(!showFormula)}
          className="w-full p-3.5 text-left text-xs font-semibold text-slate-700 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
        >
          <span>How this is calculated (for the curious)</span>
          {showFormula ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showFormula && (
          <div className="p-4 border-t border-slate-100 text-xs text-slate-600 space-y-2 bg-slate-50/50">
            <p>1. For each product and month, the real discount rate = discount amount / sales before discounts.</p>
            <p>2. <b>Full-price months</b> have a discount below 5%. <b>Discounted months</b> have 10% or more. Months in between are left out so the two groups are clearly different.</p>
            <p>3. We compare average monthly units and profit before overheads in the two groups, adjusted for seasonality (a busy month such as November is not credited to a discount).</p>
            <p>4. <b>Break-even volume lift = d / (m - d)</b>, where d is the discount and m the margin at list price.</p>
            <p className="text-[11px] text-amber-800 italic mt-2">
              Limitation: this compares past months. It shows a link, not proof that discounts caused the change.
            </p>
          </div>
        )}
      </div>

      {/* 4 Verdict Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Discounts pay off"
          value={String(counts['Discounts pay off'])}
          help={EXPLAIN_TEXTS['Discounts pay off']}
          variant="success"
        />
        <MetricCard
          label="No clear gain from discounts"
          value={String(counts['No clear gain from discounts'])}
          help={EXPLAIN_TEXTS['No clear gain from discounts']}
          variant="warning"
        />
        <MetricCard
          label="Discounts reduce profit"
          value={String(counts['Discounts reduce profit'])}
          help={EXPLAIN_TEXTS['Discounts reduce profit']}
          variant="danger"
        />
        <MetricCard
          label="Not enough data"
          value={String(counts['Not enough data'])}
          help={EXPLAIN_TEXTS['Not enough data']}
          variant="primary"
        />
      </div>

      {/* Results by product table */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
        <h3 className="text-base font-bold text-slate-900">
          Results by product
        </h3>
        <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-[460px]">
          <table className="w-full text-xs text-left text-slate-700">
            <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200 sticky top-0">
              <tr>
                <th className="p-3">Product</th>
                <th className="p-3">Verdict</th>
                <th className="p-3 text-right">Avg discount (%)</th>
                <th className="p-3 text-right">Volume change (%)</th>
                <th className="p-3 text-right">Breakeven needed (%)</th>
                <th className="p-3 text-right">Profit change (%)</th>
                <th className="p-3 text-right">Full price mos</th>
                <th className="p-3 text-right">Discounted mos</th>
                <th className="p-3">Explanation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {results.map(r => {
                const need = r.breakeven_lift_pct;
                const needTxt = need === null || need === undefined ? '—' : !isFinite(need) ? 'never' : `${(need * 100).toFixed(0)}%`;
                return (
                  <tr key={r.product_id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-sans font-semibold text-slate-900 whitespace-nowrap">
                      {r.product_name}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{
                          backgroundColor: `${getVerdictColor(r.verdict)}20`,
                          color: getVerdictColor(r.verdict)
                        }}
                      >
                        {r.verdict}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {pct(r.avg_discount_when_discounted)}
                    </td>
                    <td
                      className={`p-3 text-right font-bold ${
                        r.volume_lift_pct !== null && r.volume_lift_pct !== undefined && r.volume_lift_pct > 0
                          ? 'text-emerald-600'
                          : 'text-slate-600'
                      }`}
                    >
                      {pctSign(r.volume_lift_pct)}
                    </td>
                    <td className="p-3 text-right font-medium text-slate-700">
                      {needTxt}
                    </td>
                    <td
                      className={`p-3 text-right font-bold ${
                        r.gross_profit_change_pct !== null && r.gross_profit_change_pct !== undefined && r.gross_profit_change_pct > 0
                          ? 'text-emerald-600'
                          : r.gross_profit_change_pct !== null && r.gross_profit_change_pct !== undefined && r.gross_profit_change_pct < 0
                          ? 'text-rose-600'
                          : 'text-slate-600'
                      }`}
                    >
                      {pctSign(r.gross_profit_change_pct)}
                    </td>
                    <td className="p-3 text-right">{r.months_full_price}</td>
                    <td className="p-3 text-right">{r.months_discounted}</td>
                    <td className="p-3 font-sans text-slate-600 min-w-[260px] leading-relaxed">
                      {plain(r.verdict_reason)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400">
          A blank or &quot;never&quot; break-even value means the discount is as big as the margin, so no number of extra sales can pay for it.
        </p>
      </div>

      {/* Horizontal Bar Chart */}
      {chartData.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
          <h3 className="text-base font-bold text-slate-900">
            Profit before overheads change in discounted months (%)
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="product"
                  tick={{ fontSize: 10 }}
                  width={120}
                />
                <Tooltip
                  formatter={(val: any) => [`${val}%`, 'Profit Change']}
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

      {/* Interactive Break-even Calculator */}
      <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-indigo-600" />
          <h3 className="text-base font-bold text-slate-900">
            Break-even calculator
          </h3>
        </div>
        <p className="text-xs text-slate-600">
          Try a discount on a product of your choice (an assumption, not an observed result).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-2">
              <span>Discount you offer (%)</span>
              <span className="font-mono text-indigo-600 font-bold text-sm">{calcDiscount}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={90}
              value={calcDiscount}
              onChange={e => setCalcDiscount(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-1">How much you take off the normal price.</p>
          </div>

          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-2">
              <span>Profit you keep per item at full price (%)</span>
              <span className="font-mono text-indigo-600 font-bold text-sm">{calcMargin}%</span>
            </div>
            <input
              type="range"
              min={1}
              max={95}
              value={calcMargin}
              onChange={e => setCalcMargin(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-1">Share of the normal price that is profit, before overheads.</p>
          </div>
        </div>

        {/* Calculation Result Banner */}
        <div className="pt-2">
          {calcDiscount === 0 ? (
            <div className="p-4 bg-white border border-indigo-200 rounded-xl text-xs text-indigo-900 font-medium">
              ℹ️ With no discount, no extra volume is needed.
            </div>
          ) : calcDiscount >= calcMargin ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 font-medium">
              ⚠️ The discount ({calcDiscount}%) is as big as the margin ({calcMargin}%) or bigger. No amount of extra volume can pay for it.
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-semibold flex items-center gap-2">
              <span>✅</span>
              <span>
                You must sell <b>{((calcNeed) * 100).toFixed(0)}% more units</b> just to earn the same profit before overheads as at full price.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

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
import { baselineByProduct, simulate, impliedVolumeChange } from '../engine/simulator';
import { money, pct, pctSign, HELP_TEXTS } from '../engine/helpers';
import { Info, AlertCircle, CheckCircle, Sliders } from 'lucide-react';

interface SimulatorPageProps {
  salesData: SalesRow[];
}

export const SimulatorPage: React.FC<SimulatorPageProps> = ({ salesData }) => {
  if (salesData.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
        <p className="text-slate-600">No data confirmed yet. Go to the Data page to start.</p>
      </div>
    );
  }

  const baselineProducts = useMemo(() => baselineByProduct(salesData), [salesData]);
  const allProductIds = useMemo(() => baselineProducts.map(p => p.product_id), [baselineProducts]);

  // Settings
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(allProductIds);
  const [priceChg, setPriceChg] = useState(0); // -30 to 30 %
  const [costChg, setCostChg] = useState(0); // -30 to 30 %
  const [setDiscActive, setSetDiscActive] = useState(false);
  const [newDisc, setNewDisc] = useState(10); // 0 to 80 %

  const [mode, setMode] = useState<'manual' | 'elasticity'>('manual');
  const [manualVolChg, setManualVolChg] = useState(0); // -60 to 200 %
  const [elasticity, setElasticity] = useState(-1.5); // -4.0 to 0.0

  const toggleProduct = (pid: string) => {
    if (selectedProductIds.includes(pid)) {
      if (selectedProductIds.length > 1) {
        setSelectedProductIds(selectedProductIds.filter(id => id !== pid));
      }
    } else {
      setSelectedProductIds([...selectedProductIds, pid]);
    }
  };

  const selectAllProducts = () => setSelectedProductIds(allProductIds);

  // Compute effective volume change
  const computedVolChg = useMemo(() => {
    if (mode === 'manual') {
      return manualVolChg / 100;
    }
    // Compute implied volume change from price change & discount change
    // Using baseline for selected products
    const pChange = priceChg / 100;
    const cChange = costChg / 100;
    const dRate = setDiscActive ? newDisc / 100 : null;

    try {
      const flat = simulate(salesData, pChange, dRate, cChange, 0.0, selectedProductIds);
      const oldP = flat.baseline.net_revenue / flat.baseline.units;
      const newP = flat.scenario.net_revenue / flat.scenario.units;
      if (newP <= 0) return 0;
      return impliedVolumeChange(oldP, newP, elasticity);
    } catch {
      return 0;
    }
  }, [mode, manualVolChg, priceChg, costChg, setDiscActive, newDisc, salesData, selectedProductIds, elasticity]);

  // Run simulation
  const simResult = useMemo(() => {
    try {
      const pChange = priceChg / 100;
      const cChange = costChg / 100;
      const dRate = setDiscActive ? newDisc / 100 : null;
      return simulate(salesData, pChange, dRate, cChange, computedVolChg, selectedProductIds);
    } catch {
      return null;
    }
  }, [salesData, priceChg, costChg, setDiscActive, newDisc, computedVolChg, selectedProductIds]);

  if (!simResult) {
    return <div className="p-4 text-rose-600">Error computing simulation.</div>;
  }

  const { baseline: b, scenario: s, change: ch, breakeven_units: be, by_product: bp } = simResult;

  const comparisonChartData = [
    {
      Measure: 'Sales after discounts',
      'Now (from data)': Math.round(b.net_revenue),
      'After change (assumption)': Math.round(s.net_revenue)
    },
    {
      Measure: 'Product cost',
      'Now (from data)': Math.round(b.cogs),
      'After change (assumption)': Math.round(s.cogs)
    },
    {
      Measure: 'Profit before overheads',
      'Now (from data)': Math.round(b.gross_profit),
      'After change (assumption)': Math.round(s.gross_profit)
    }
  ];

  return (
    <div className="space-y-6">
      <Hero
        icon="🧪"
        title="Try a price change"
        subtitle="Ask &quot;what if?&quot; Change the price, discount or cost and see the effect on sales and profit. Your real data is never changed."
      />

      <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 leading-relaxed flex items-start gap-2.5">
        <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <b>Observed</b> = from your data (today&apos;s numbers). <b>Assumed</b> = the settings you choose below. The data cannot tell us how customers will react to a new price, so sales volume is always YOUR assumption. Results are scenarios, not forecasts.
        </div>
      </div>

      {/* Product selector chips */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800">
            Products to include ({selectedProductIds.length} of {allProductIds.length})
          </label>
          <button
            onClick={selectAllProducts}
            className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer"
          >
            Select All
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
          {baselineProducts.map(p => {
            const isSel = selectedProductIds.includes(p.product_id);
            return (
              <button
                key={p.product_id}
                onClick={() => toggleProduct(p.product_id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer truncate max-w-xs ${
                  isSel
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.product_name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Simulator Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Sliders className="w-4 h-4 text-indigo-600" />
          <h3 className="text-base font-bold text-slate-900">
            Your &quot;what if&quot; settings
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Price Change */}
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1.5">
              <span>Change selling price by (%)</span>
              <span className={`font-mono font-bold ${priceChg > 0 ? 'text-emerald-600' : priceChg < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {priceChg > 0 ? `+${priceChg}%` : `${priceChg}%`}
              </span>
            </div>
            <input
              type="range"
              min={-30}
              max={30}
              value={priceChg}
              onChange={e => setPriceChg(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400 mt-1">+10 means every price goes up by 10%.</p>
          </div>

          {/* Cost Change */}
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1.5">
              <span>Change supplier cost by (%)</span>
              <span className={`font-mono font-bold ${costChg > 0 ? 'text-rose-600' : costChg < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                {costChg > 0 ? `+${costChg}%` : `${costChg}%`}
              </span>
            </div>
            <input
              type="range"
              min={-30}
              max={30}
              value={costChg}
              onChange={e => setCostChg(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400 mt-1">+10 means suppliers charge 10% more.</p>
          </div>

          {/* New Discount */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={setDiscActive}
                  onChange={e => setSetDiscActive(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                <span>Set fixed discount (%)</span>
              </label>
              {setDiscActive && (
                <span className="font-mono font-bold text-indigo-600 text-xs">{newDisc}%</span>
              )}
            </div>
            <input
              type="range"
              min={0}
              max={80}
              value={newDisc}
              disabled={!setDiscActive}
              onChange={e => setNewDisc(Number(e.target.value))}
              className={`w-full accent-indigo-600 ${!setDiscActive ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            />
            <p className="text-[11px] text-slate-400 mt-1">
              {setDiscActive ? 'New discount applied to all selected' : 'Otherwise keeps each product&apos;s observed discount'}
            </p>
          </div>
        </div>

        {/* Sales Volume Mode */}
        <div className="border-t border-slate-100 pt-5">
          <label className="block text-xs font-bold text-slate-800 mb-3">
            How many items will you sell after the change?
          </label>
          <div className="flex flex-wrap gap-4 mb-4">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="simMode"
                checked={mode === 'manual'}
                onChange={() => setMode('manual')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span>I choose how many more or fewer items sell</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="simMode"
                checked={mode === 'elasticity'}
                onChange={() => setMode('elasticity')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span>Estimate it from how strongly customers react to price (elasticity)</span>
            </label>
          </div>

          {mode === 'manual' ? (
            <div className="max-w-md">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1.5">
                <span>Change in items sold (%)</span>
                <span className="font-mono font-bold text-indigo-600">
                  {manualVolChg > 0 ? `+${manualVolChg}%` : `${manualVolChg}%`}
                </span>
              </div>
              <input
                type="range"
                min={-60}
                max={200}
                value={manualVolChg}
                onChange={e => setManualVolChg(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                This is YOUR guess. Your data cannot tell how customers will react.
              </p>
            </div>
          ) : (
            <div className="max-w-md space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1.5">
                <span>Price elasticity (reaction)</span>
                <span className="font-mono font-bold text-indigo-600">{elasticity.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={-4.0}
                max={0.0}
                step={0.1}
                value={elasticity}
                onChange={e => setElasticity(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                -1.5 means: a 10% lower price brings about 15% more sales. Implied volume change is <b>{pctSign(computedVolChg)}</b>.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Results Header and Metrics */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900">
          Results: today versus after your change
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Sales after discounts"
            value={money(s.net_revenue)}
            delta={pctSign(ch.net_revenue)}
            deltaType={ch.net_revenue >= 0 ? 'positive' : 'negative'}
            help={HELP_TEXTS['Sales after discounts']}
          />
          <MetricCard
            label="Profit before overheads"
            value={money(s.gross_profit)}
            delta={pctSign(ch.gross_profit)}
            deltaType={ch.gross_profit >= 0 ? 'positive' : 'negative'}
            help={HELP_TEXTS['Profit before overheads']}
          />
          <MetricCard
            label="Profit margin"
            value={pct(s.gross_margin_pct)}
            delta={`${ch.gross_margin_pts >= 0 ? '+' : ''}${(ch.gross_margin_pts * 100).toFixed(1)} pts`}
            deltaType={ch.gross_margin_pts >= 0 ? 'positive' : 'negative'}
            help={HELP_TEXTS['Profit margin']}
          />
          <MetricCard
            label="Items sold"
            value={Math.round(s.units).toLocaleString()}
            delta={pctSign(ch.units)}
            deltaType={ch.units >= 0 ? 'positive' : 'negative'}
            help={HELP_TEXTS['Items sold']}
          />
        </div>

        {/* Break-even point card */}
        <div className="p-4 rounded-xl border bg-white shadow-xs">
          {!isFinite(be) ? (
            <div className="flex items-center gap-2 text-rose-700 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Break-even point: none. At the new price, discount and cost, each item earns nothing or loses money, so no number of extra sales can match your current profit before overheads.
              </span>
            </div>
          ) : (
            <div className="text-xs text-slate-700 leading-relaxed flex items-start gap-2.5">
              {s.units >= be ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <b>Break-even point: </b>
                <span>{Math.round(be).toLocaleString()} items must be sold to match your current profit before overheads of {money(b.gross_profit)} (now: {Math.round(b.units).toLocaleString()} items; your change assumes {Math.round(s.units).toLocaleString()}). </span>
                <span className={s.units >= be ? 'text-emerald-700 font-bold' : 'text-amber-800 font-bold'}>
                  {s.units >= be ? 'Your assumed volume reaches it.' : 'Your assumed volume does NOT reach it.'}
                </span>
              </div>
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-2">
            Break-even here means matching your current profit before overheads. The data has no fixed costs, shipping, marketing or tax, so a fixed-cost break-even cannot be calculated.
          </p>
        </div>

        {/* Comparison Table and Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h4 className="text-sm font-bold text-slate-900">
              Scenario comparison
            </h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Measure</th>
                    <th className="p-3 text-right">Now (from data)</th>
                    <th className="p-3 text-right">After change (assumption)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  <tr>
                    <td className="p-3 font-sans font-medium">Items sold</td>
                    <td className="p-3 text-right">{Math.round(b.units).toLocaleString()}</td>
                    <td className="p-3 text-right font-bold text-indigo-700">{Math.round(s.units).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-sans font-medium">Sales after discounts</td>
                    <td className="p-3 text-right">{money(b.net_revenue)}</td>
                    <td className="p-3 text-right font-bold text-indigo-700">{money(s.net_revenue)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-sans font-medium">Product cost</td>
                    <td className="p-3 text-right">{money(b.cogs)}</td>
                    <td className="p-3 text-right font-bold text-indigo-700">{money(s.cogs)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-sans font-medium">Profit before overheads</td>
                    <td className="p-3 text-right">{money(b.gross_profit)}</td>
                    <td className="p-3 text-right font-bold text-indigo-700">{money(s.gross_profit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h4 className="text-sm font-bold text-slate-900">
              Comparison chart ($)
            </h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="Measure" tick={{ fontSize: 10 }} />
                  <YAxis
                    tickFormatter={val => `$${Math.round(val / 1000)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip formatter={(val: any) => [`$${Number(val).toLocaleString()}`, '']} />
                  <Legend />
                  <Bar
                    dataKey="Now (from data)"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="After change (assumption)"
                    fill="#ec4899"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* By Product Table */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
          <h4 className="text-sm font-bold text-slate-900">
            By product
          </h4>
          <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-[460px]">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3 text-right">Items now</th>
                  <th className="p-3 text-right">Items after change</th>
                  <th className="p-3 text-right">Profit now</th>
                  <th className="p-3 text-right">Profit after change</th>
                  <th className="p-3 text-right">Items needed to break even</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {bp.map(p => {
                  const beTxt = !isFinite(p.breakeven_units) ? '—' : Math.round(p.breakeven_units).toLocaleString();
                  return (
                    <tr key={p.product_id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-sans font-semibold text-slate-900 whitespace-nowrap">
                        {p.product_name}
                      </td>
                      <td className="p-3 text-right">{Math.round(p.baseline_units).toLocaleString()}</td>
                      <td className="p-3 text-right font-medium text-slate-900">{Math.round(p.scenario_units).toLocaleString()}</td>
                      <td className="p-3 text-right font-medium text-slate-800">{money(p.baseline_gross_profit)}</td>
                      <td className={`p-3 text-right font-bold ${p.scenario_gross_profit >= p.baseline_gross_profit ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {money(p.scenario_gross_profit)}
                      </td>
                      <td className="p-3 text-right font-medium text-indigo-700">{beTxt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">
            A blank value means no number of extra sales can match your current profit at the new settings.
          </p>
        </div>
      </div>
    </div>
  );
};

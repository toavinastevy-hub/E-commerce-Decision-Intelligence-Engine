import React, { useState, useMemo, useEffect } from 'react';
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
import { money, pct, pctSign } from '../engine/helpers';
import { Sliders, DollarSign, TrendingUp, ShoppingBag, PieChart, CheckCircle2, AlertTriangle, Search, CheckSquare, Square } from 'lucide-react';

interface SimulatorPageProps {
  salesData: SalesRow[];
}

export const SimulatorPage: React.FC<SimulatorPageProps> = ({ salesData }) => {
  if (salesData.length === 0) {
    return (
      <div className="bg-white dark:bg-[#111827] p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-xs">
        <p className="text-slate-500 dark:text-slate-400">No sales data loaded yet. Import an Excel or CSV file to run simulations.</p>
      </div>
    );
  }

  // Ensure only products physically inside the uploaded dataset/excel are displayed
  const baselineProducts = useMemo(() => {
    const list = baselineByProduct(salesData);
    return list.filter(p => p.product_id && p.product_name && p.product_name.trim() !== '');
  }, [salesData]);

  const allProductIds = useMemo(() => baselineProducts.map(p => p.product_id), [baselineProducts]);

  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(allProductIds);
  const [productSearch, setProductSearch] = useState('');
  const [priceChg, setPriceChg] = useState(0);
  const [costChg, setCostChg] = useState(0);
  const [setDiscActive, setSetDiscActive] = useState(false);
  const [newDisc, setNewDisc] = useState(10);

  const [mode, setMode] = useState<'manual' | 'elasticity'>('manual');
  const [manualVolChg, setManualVolChg] = useState(0);
  const [elasticity, setElasticity] = useState(-1.5);

  // Sync selectedProductIds whenever salesData changes (e.g. user uploads a new Excel/CSV file)
  useEffect(() => {
    setSelectedProductIds(allProductIds);
  }, [allProductIds]);

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
  const deselectAllProducts = () => {
    if (allProductIds.length > 0) {
      // Keep at least 1 selected so simulation has data
      setSelectedProductIds([allProductIds[0]]);
    }
  };

  // Filter products by search query
  const filteredCatalog = useMemo(() => {
    if (!productSearch.trim()) return baselineProducts;
    const q = productSearch.toLowerCase();
    return baselineProducts.filter(p => p.product_name.toLowerCase().includes(q) || p.product_id.toLowerCase().includes(q));
  }, [baselineProducts, productSearch]);

  const computedVolChg = useMemo(() => {
    if (mode === 'manual') {
      return manualVolChg / 100;
    }
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
    return <div className="p-4 text-rose-500">Error computing scenario simulation.</div>;
  }

  const { baseline: b, scenario: s, change: ch, breakeven_units: be } = simResult;

  const comparisonChartData = [
    {
      Measure: 'Net Revenue',
      'Current Baseline': Math.round(b.net_revenue),
      'Simulated Scenario': Math.round(s.net_revenue)
    },
    {
      Measure: 'Product Cost (COGS)',
      'Current Baseline': Math.round(b.cogs),
      'Simulated Scenario': Math.round(s.cogs)
    },
    {
      Measure: 'Gross Profit',
      'Current Baseline': Math.round(b.gross_profit),
      'Simulated Scenario': Math.round(s.gross_profit)
    }
  ];

  return (
    <div className="space-y-6">
      <Hero
        icon={<Sliders className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        title="Price &amp; Volume Scenario Simulator"
        subtitle="Simulate what-if adjustments to pricing, supplier unit costs, and promotional discounts to evaluate projected commercial impact."
      />

      {/* Target Catalog Selection - Strictly constrained to products in the uploaded file */}
      <div className="exec-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <span>Target Catalog Selection:</span>
            <span className="font-mono text-[11px] text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
              {selectedProductIds.length} of {allProductIds.length} items from dataset
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Search products..."
                className="pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-indigo-500 w-44"
              />
            </div>
            <button
              onClick={selectAllProducts}
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 text-xs cursor-pointer flex items-center gap-1 font-medium"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Select All</span>
            </button>
            <button
              onClick={deselectAllProducts}
              className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs cursor-pointer flex items-center gap-1 font-medium"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Product Pills - Only products inside the active uploaded file */}
        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-1">
          {filteredCatalog.map(p => {
            const isSel = selectedProductIds.includes(p.product_id);
            return (
              <button
                key={p.product_id}
                onClick={() => toggleProduct(p.product_id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer truncate max-w-xs micro-interactive ${
                  isSel
                    ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 font-semibold shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border border-transparent hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title={p.product_name}
              >
                {p.product_name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Simulator Inputs Grid */}
      <div className="exec-card p-6 space-y-6">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide border-b border-slate-200 dark:border-slate-800 pb-3">
          Simulation Parameters
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 micro-interactive">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Price Adjustment:</span>
              <span className={`font-mono font-bold ${priceChg > 0 ? 'text-emerald-600 dark:text-emerald-400' : priceChg < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'}`}>
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
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 micro-interactive">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Supplier Cost Shift:</span>
              <span className={`font-mono font-bold ${costChg > 0 ? 'text-rose-600 dark:text-rose-400' : costChg < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
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
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 micro-interactive">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={setDiscActive}
                  onChange={e => setSetDiscActive(e.target.checked)}
                  className="rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span>Override Discount</span>
              </label>
              {setDiscActive && <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xs">{newDisc}%</span>}
            </div>
            <input
              type="range"
              min={0}
              max={80}
              value={newDisc}
              disabled={!setDiscActive}
              onChange={e => setNewDisc(Number(e.target.value))}
              className={`w-full accent-indigo-600 ${!setDiscActive ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
            />
          </div>
        </div>

        {/* Volume Assumption Mode */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
          <div className="flex flex-wrap items-center gap-6">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Demand Response Mode:</span>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="simMode"
                checked={mode === 'manual'}
                onChange={() => setMode('manual')}
                className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span>Direct Volume Guess (%)</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="simMode"
                checked={mode === 'elasticity'}
                onChange={() => setMode('elasticity')}
                className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span>Price Elasticity Model</span>
            </label>
          </div>

          <div className="max-w-md bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            {mode === 'manual' ? (
              <>
                <div className="flex justify-between items-center text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Assumed Sales Volume Change:</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
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
              </>
            ) : (
              <>
                <div className="flex justify-between items-center text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Price Elasticity Coefficient:</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{elasticity.toFixed(1)}</span>
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
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Implied volume change: <b className="text-slate-900 dark:text-white">{pctSign(computedVolChg)}</b>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Simulated Outcomes - 4 Big Primary Cards */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Projected Commercial Impact
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Projected Revenue"
            value={money(s.net_revenue)}
            delta={pctSign(ch.net_revenue)}
            deltaType={ch.net_revenue >= 0 ? 'positive' : 'negative'}
            subtitle={`Baseline: ${money(b.net_revenue)}`}
            icon={<DollarSign className="w-5 h-5" />}
            size="hero"
            accentColor="indigo"
          />
          <MetricCard
            label="Projected Gross Profit"
            value={money(s.gross_profit)}
            delta={pctSign(ch.gross_profit)}
            deltaType={ch.gross_profit >= 0 ? 'positive' : 'negative'}
            subtitle={`Baseline: ${money(b.gross_profit)}`}
            icon={<TrendingUp className="w-5 h-5" />}
            size="hero"
            accentColor="emerald"
          />
          <MetricCard
            label="Gross Margin Shift"
            value={pct(s.gross_margin_pct)}
            delta={`${ch.gross_margin_pts >= 0 ? '+' : ''}${(ch.gross_margin_pts * 100).toFixed(1)} pts`}
            deltaType={ch.gross_margin_pts >= 0 ? 'positive' : 'negative'}
            subtitle={`Baseline: ${pct(b.gross_margin_pct)}`}
            icon={<PieChart className="w-5 h-5" />}
            size="hero"
            accentColor="sky"
          />
          <MetricCard
            label="Projected Units Sold"
            value={Math.round(s.units).toLocaleString()}
            delta={pctSign(ch.units)}
            deltaType={ch.units >= 0 ? 'positive' : 'negative'}
            subtitle={`Baseline: ${Math.round(b.units).toLocaleString()}`}
            icon={<ShoppingBag className="w-5 h-5" />}
            size="hero"
            accentColor="amber"
          />
        </div>
      </div>

      {/* Break-even Indicator Banner */}
      <div className="exec-card p-4">
        {!isFinite(be) ? (
          <div className="flex items-center gap-2 text-xs text-rose-500 dark:text-rose-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Break-even unreachable: Unit gross profit is zero or negative under these settings.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
            {s.units >= be ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <span>
              Break-even requires selling <b>{Math.round(be).toLocaleString()} units</b> to match current baseline gross profit of {money(b.gross_profit)}.{' '}
              <b className={s.units >= be ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                {s.units >= be ? 'Projected volume meets or exceeds break-even.' : 'Projected volume falls below break-even.'}
              </b>
            </span>
          </div>
        )}
      </div>

      {/* Comparison Chart */}
      <div className="exec-card p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
          Baseline vs Simulated Financials
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" vertical={false} />
              <XAxis dataKey="Measure" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={val => `$${Math.round(val / 1000)}k`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(val: any) => [`${money(Number(val))}`, '']}
                contentStyle={{
                  backgroundColor: 'var(--card-surface)',
                  borderColor: 'var(--card-border)',
                  borderRadius: '0.75rem',
                  fontSize: '12px'
                }}
              />
              <Legend />
              <Bar dataKey="Current Baseline" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Simulated Scenario" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

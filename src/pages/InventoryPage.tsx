import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
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
import { SalesRow, InventoryRow, InventoryAnalysisResult } from '../types';
import { validateInventory, analyzeInventory, STOCKOUT, REORDER, EXCESS, OK, NO_SALES, NO_INV } from '../engine/inventory';
import { money, plain, EXPLAIN_TEXTS } from '../engine/helpers';
import { Download, Upload, AlertCircle, ChevronDown, ChevronUp, PackageCheck } from 'lucide-react';

interface InventoryPageProps {
  salesData: SalesRow[];
  inventoryData: InventoryRow[] | null;
  inventoryLabel: string | null;
  isSimulatedInventory: boolean;
  onSetInventory: (data: InventoryRow[], label: string, isSimulated: boolean) => void;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({
  salesData,
  inventoryData,
  inventoryLabel,
  isSimulatedInventory,
  onSetInventory
}) => {
  if (salesData.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
        <p className="text-slate-600">No sales data confirmed yet. Go to the Data page to start.</p>
      </div>
    );
  }

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Assumptions
  const [serviceLevel, setServiceLevel] = useState(95); // 90 to 99 %
  const [windowDays, setWindowDays] = useState(90); // 30 to 180
  const [coverDays, setCoverDays] = useState(30); // 7 to 90
  const [excessDays, setExcessDays] = useState(90); // 30 to 365

  const [showFormula, setShowFormula] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string[]>([STOCKOUT, REORDER, EXCESS, OK, NO_SALES, NO_INV]);

  // Load demo inventory
  const handleLoadDemo = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch('/data/inventory.csv');
      const text = await res.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      const salesPids = Array.from(new Set(salesData.map(r => r.product_id)));
      const { good, missing } = validateInventory(parsed.data, salesPids);
      if (missing.length > 0) {
        throw new Error(`Required columns missing: ${missing.join(', ')}`);
      }
      onSetInventory(good, 'SIMULATED demo inventory', true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load demo inventory.');
    } finally {
      setLoading(false);
    }
  };

  // Upload inventory file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setErrorMsg(null);

    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const buffer = evt.target?.result;
          const workbook = XLSX.read(buffer, { type: 'binary' });
          const invSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('inventory') || n.toLowerCase().includes('stock')) || workbook.SheetNames[0];
          const invJson: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[invSheetName]);
          const salesPids = Array.from(new Set(salesData.map(r => r.product_id)));
          const { good, missing } = validateInventory(invJson, salesPids);
          if (missing.length > 0) {
            throw new Error(`Required columns missing: ${missing.join(', ')}`);
          }
          onSetInventory(good, `Uploaded file: ${file.name}`, false);
        } catch (err: any) {
          setErrorMsg(err.message);
        } finally {
          setLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: results => {
          try {
            const salesPids = Array.from(new Set(salesData.map(r => r.product_id)));
            const { good, missing } = validateInventory(results.data, salesPids);
            if (missing.length > 0) {
              throw new Error(`Required columns missing: ${missing.join(', ')}`);
            }
            onSetInventory(good, `Uploaded file: ${file.name}`, false);
          } catch (err: any) {
            setErrorMsg(err.message);
          } finally {
            setLoading(false);
          }
        },
        error: err => {
          setErrorMsg(err.message);
          setLoading(false);
        }
      });
    }
  };

  // Run inventory analysis
  const invAnalysis: InventoryAnalysisResult | null = useMemo(() => {
    if (!inventoryData || inventoryData.length === 0) return null;
    try {
      return analyzeInventory(
        salesData,
        inventoryData,
        serviceLevel / 100,
        windowDays,
        coverDays,
        excessDays
      );
    } catch {
      return null;
    }
  }, [salesData, inventoryData, serviceLevel, windowDays, coverDays, excessDays]);

  // Counts of each status
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      [STOCKOUT]: 0,
      [REORDER]: 0,
      [EXCESS]: 0,
      [OK]: 0,
      [NO_SALES]: 0,
      [NO_INV]: 0
    };
    if (invAnalysis) {
      for (const r of invAnalysis.rows) {
        if (r.status in c) c[r.status]++;
      }
    }
    return c;
  }, [invAnalysis]);

  const totalExcessCash = useMemo(() => {
    if (!invAnalysis) return 0;
    return invAnalysis.rows.reduce((acc, r) => acc + (r.excess_value || 0), 0);
  }, [invAnalysis]);

  const toggleStatusFilter = (st: string) => {
    if (statusFilter.includes(st)) {
      if (statusFilter.length > 1) {
        setStatusFilter(statusFilter.filter(s => s !== st));
      }
    } else {
      setStatusFilter([...statusFilter, st]);
    }
  };

  const filteredRows = useMemo(() => {
    if (!invAnalysis) return [];
    return invAnalysis.rows.filter(r => statusFilter.includes(r.status));
  }, [invAnalysis, statusFilter]);

  const chartData = useMemo(() => {
    if (!invAnalysis) return [];
    return invAnalysis.rows
      .filter(r => r.days_of_stock !== undefined && isFinite(r.days_of_stock))
      .map(r => ({
        product: r.product_name,
        days_of_stock: +(r.days_of_stock || 0).toFixed(1),
        status: r.status
      }))
      .sort((a, b) => a.days_of_stock - b.days_of_stock);
  }, [invAnalysis]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case STOCKOUT:
        return '#ef4444'; // red
      case REORDER:
        return '#f59e0b'; // amber
      case EXCESS:
        return '#6366f1'; // indigo
      case OK:
        return '#10b981'; // emerald
      default:
        return '#94a3b8';
    }
  };

  // Reorder list download
  const handleDownloadReorder = () => {
    if (!invAnalysis) return;
    const toOrder = invAnalysis.rows
      .filter(r => (r.suggested_order_qty || 0) > 0)
      .map(r => ({
        Product: r.product_name,
        Status: r.status,
        Stock: Math.round(r.current_stock || 0),
        'Reorder point': Math.round(r.reorder_point || 0),
        'Suggested order (units)': Math.round(r.suggested_order_qty || 0)
      }));
    const csv = Papa.unparse(toOrder);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reorder_list.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Hero
        icon="📦"
        title="Stock check"
        subtitle="Which products may run out, what to order, and where you hold too much stock."
      />

      <Tip
        text="<b>Days of stock</b> = how many days your stock lasts at the recent selling speed. <b>Delivery time</b> = how long a new order takes to arrive. If stock runs out before a new order can arrive, there is a risk of lost sales."
      />

      {errorMsg && (
        <div className="p-4 bg-rose-50 border-l-4 border-rose-600 rounded-xl text-rose-800 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Upload or Load Demo Buttons */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              Inventory Data Source
            </h4>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              {inventoryLabel ? `Active: ${inventoryLabel} (${inventoryData?.length || 0} products)` : 'No inventory data loaded yet.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleLoadDemo}
              disabled={loading}
              className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Use simulated inventory (demo)
            </button>
            <label className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>Upload stock file</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {isSimulatedInventory && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium">
            ⚠️ The inventory is SIMULATED for demonstration. Results are illustrative, not real stock positions.
          </div>
        )}
      </div>

      {!invAnalysis ? (
        <div className="p-8 bg-indigo-50/50 rounded-2xl border border-indigo-100 text-center text-xs text-indigo-900 space-y-3">
          <p>
            No inventory data loaded. Without current stock and lead times, reliable inventory results are not possible.
          </p>
          <button
            onClick={handleLoadDemo}
            className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs shadow-xs hover:bg-indigo-700 cursor-pointer"
          >
            Click here to load simulated demo inventory
          </button>
        </div>
      ) : (
        <>
          {/* Assumptions Control Panel */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <button
              onClick={() => setShowAssumptions(!showAssumptions)}
              className="w-full flex items-center justify-between text-xs font-bold text-slate-800 cursor-pointer"
            >
              <span>Assumptions (change them to see the effect)</span>
              {showAssumptions ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {showAssumptions && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 pt-2">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
                    <span>Target service level (%)</span>
                    <span className="font-mono text-indigo-600 font-bold">{serviceLevel}%</span>
                  </div>
                  <input
                    type="range"
                    min={90}
                    max={99}
                    value={serviceLevel}
                    onChange={e => setServiceLevel(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Higher means a bigger safety buffer.</p>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
                    <span>Demand history window</span>
                    <span className="font-mono text-indigo-600 font-bold">{windowDays} days</span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={180}
                    value={windowDays}
                    onChange={e => setWindowDays(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">How far back to measure selling speed.</p>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
                    <span>Order cover period</span>
                    <span className="font-mono text-indigo-600 font-bold">{coverDays} days</span>
                  </div>
                  <input
                    type="range"
                    min={7}
                    max={90}
                    value={coverDays}
                    onChange={e => setCoverDays(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Extra days of sales each order covers.</p>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
                    <span>Excess threshold</span>
                    <span className="font-mono text-indigo-600 font-bold">{excessDays} days</span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={365}
                    value={excessDays}
                    onChange={e => setExcessDays(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Stock above this is marked as excess.</p>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 font-mono">
            Stock assumed as of {invAnalysis.as_of}, the last sales date. Demand measured over the last {invAnalysis.days_used} days.
          </p>

          {/* Formulas Expander */}
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
                <p>• <b>Average daily demand (d)</b> = units sold in the demand window / days in the window</p>
                <p>• <b>Days of stock</b> = current stock / d</p>
                <p>• <b>Safety stock</b> = z × (standard deviation of daily demand) × sqrt(lead time); z comes from the service level ({serviceLevel}% → z = {invAnalysis.z.toFixed(3)})</p>
                <p>• <b>Reorder point</b> = d × lead time + safety stock</p>
                <p>• <b>Suggested order</b> = d × (lead time + cover days) + safety stock - current stock</p>
                <p className="text-[11px] text-amber-800 italic mt-2">
                  Status rules in order: Stockout risk (days &lt; lead time) → Reorder now (stock &le; reorder point) → Excess stock (days &gt; {excessDays}) → OK.
                </p>
              </div>
            )}
          </div>

          {/* 4 Status Metric Cards + Excess Cash Card */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard
              label={STOCKOUT}
              value={String(counts[STOCKOUT])}
              help={EXPLAIN_TEXTS[STOCKOUT]}
              variant="danger"
            />
            <MetricCard
              label={REORDER}
              value={String(counts[REORDER])}
              help={EXPLAIN_TEXTS[REORDER]}
              variant="warning"
            />
            <MetricCard
              label={EXCESS}
              value={String(counts[EXCESS])}
              help={EXPLAIN_TEXTS[EXCESS]}
              variant="primary"
            />
            <MetricCard
              label={OK}
              value={String(counts[OK])}
              help={EXPLAIN_TEXTS[OK]}
              variant="success"
            />
            <MetricCard
              label="Cash tied up in excess"
              value={money(totalExcessCash)}
              help="Excess value = units above threshold × average unit cost."
              variant="primary"
            />
          </div>

          {/* Days of stock vs lead time chart */}
          {chartData.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
              <h3 className="text-base font-bold text-slate-900">
                Days of stock versus lead time
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" unit=" days" tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="product"
                      tick={{ fontSize: 10 }}
                      width={120}
                    />
                    <Tooltip
                      formatter={(val: any) => [`${val} days`, 'Days of stock']}
                    />
                    <Bar dataKey="days_of_stock" radius={[0, 4, 4, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={getStatusColor(entry.status)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-slate-400">
                A product is in stockout risk when its bar is shorter than its lead time.
              </p>
            </div>
          )}

          {/* Product Inventory Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h3 className="text-base font-bold text-slate-900">
                Product table
              </h3>
              <button
                onClick={handleDownloadReorder}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download reorder list (CSV)</span>
              </button>
            </div>

            {/* Filter pills */}
            <div className="flex flex-wrap gap-1.5 pb-2">
              {[STOCKOUT, REORDER, EXCESS, OK, NO_SALES].map(st => {
                const isSel = statusFilter.includes(st);
                return (
                  <button
                    key={st}
                    onClick={() => toggleStatusFilter(st)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isSel ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st} ({counts[st] || 0})
                  </button>
                );
              })}
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Stock</th>
                    <th className="p-3 text-right">Days of stock</th>
                    <th className="p-3 text-right">Lead time (days)</th>
                    <th className="p-3 text-right">Avg daily demand</th>
                    <th className="p-3 text-right">Reorder point</th>
                    <th className="p-3 text-right">Suggested order (units)</th>
                    <th className="p-3 text-right">Excess units</th>
                    <th className="p-3">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {filteredRows.map(r => (
                    <tr key={r.product_id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-sans font-semibold text-slate-900 whitespace-nowrap">
                        {r.product_name}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{
                            backgroundColor: `${getStatusColor(r.status)}20`,
                            color: getStatusColor(r.status)
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">{Math.round(r.current_stock || 0).toLocaleString()}</td>
                      <td className="p-3 text-right">
                        {isFinite(r.days_of_stock || 0) ? (r.days_of_stock || 0).toFixed(1) : '—'}
                      </td>
                      <td className="p-3 text-right">{Math.round(r.lead_time_days || 0)}</td>
                      <td className="p-3 text-right">{(r.avg_daily_demand || 0).toFixed(1)}</td>
                      <td className="p-3 text-right">{Math.round(r.reorder_point || 0).toLocaleString()}</td>
                      <td className="p-3 text-right font-bold text-indigo-700">
                        {Math.round(r.suggested_order_qty || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right">{Math.round(r.excess_units || 0).toLocaleString()}</td>
                      <td className="p-3 font-sans text-slate-600 min-w-[260px] leading-relaxed">
                        {plain(r.reason)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400">
              Suggestions are a starting point. Check supplier minimums, budget and upcoming promotions before ordering.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

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
import { MetricCard } from '../components/MetricCard';
import { SalesRow, InventoryRow, InventoryAnalysisResult } from '../types';
import { validateInventory, analyzeInventory, STOCKOUT, REORDER, EXCESS, OK, NO_SALES, NO_INV } from '../engine/inventory';
import { money, plain } from '../engine/helpers';
import { exportToExcel, exportToCsv } from '../engine/export_utils';
import {
  Boxes,
  AlertTriangle,
  Clock,
  Package,
  CheckCircle2,
  DollarSign,
  Download,
  Upload,
  Sliders,
  FileSpreadsheet
} from 'lucide-react';

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
  onSetInventory
}) => {
  if (salesData.length === 0) {
    return (
      <div className="bg-white dark:bg-[#111827] p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-xs">
        <p className="text-slate-500 dark:text-slate-400">No sales data loaded yet.</p>
      </div>
    );
  }

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Assumptions
  const [serviceLevel, setServiceLevel] = useState(95);
  const [windowDays, setWindowDays] = useState(90);
  const [coverDays, setCoverDays] = useState(30);
  const [excessDays, setExcessDays] = useState(90);

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
      onSetInventory(good, 'Benchmark Inventory Dataset', true);
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

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
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
          onSetInventory(good, file.name, false);
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
            onSetInventory(good, file.name, false);
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
        return '#f43f5e';
      case REORDER:
        return '#f59e0b';
      case EXCESS:
        return '#818cf8';
      case OK:
        return '#10b981';
      default:
        return '#64748b';
    }
  };

  const getReorderRows = () => {
    if (!invAnalysis) return [];
    return invAnalysis.rows
      .filter(r => (r.suggested_order_qty || 0) > 0)
      .map(r => ({
        ProductID: r.product_id,
        Product: r.product_name,
        Status: r.status,
        CurrentStock: Math.round(r.current_stock || 0),
        DaysOfStock: +(r.days_of_stock || 0).toFixed(1),
        LeadTimeDays: Math.round(r.lead_time_days || 0),
        ReorderPoint: Math.round(r.reorder_point || 0),
        SuggestedOrderUnits: Math.round(r.suggested_order_qty || 0)
      }));
  };

  const handleDownloadExcel = () => {
    const rows = getReorderRows();
    exportToExcel([{ name: 'Reorder Replenishment', data: rows }], 'Reorder_Replenishment_List.xlsx');
  };

  const handleDownloadCsv = () => {
    const rows = getReorderRows();
    exportToCsv(rows, 'Reorder_Replenishment_List.csv');
  };

  return (
    <div className="space-y-6">
      <Hero
        icon={<Boxes className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        title="Inventory Health &amp; Reorder Optimization"
        subtitle="Stockout risk alerts, safety buffer calculations, and automated purchase order recommendations based on sales velocity."
      />

      {errorMsg && (
        <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-800 dark:text-rose-300 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Source & Upload Bar */}
      <div className="exec-card p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Inventory Status: </span>
          <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
            {inventoryLabel ? `${inventoryLabel} (${inventoryData?.length || 0} SKUs)` : 'No inventory data active'}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleLoadDemo}
            disabled={loading}
            className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-all cursor-pointer micro-interactive"
          >
            Load Benchmark Inventory
          </button>
          <label className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs micro-interactive">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Stock File</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {!invAnalysis ? (
        <div className="exec-card p-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-3">
          <p>Load an inventory file or click below to view the stock replenishment analysis.</p>
          <button
            onClick={handleLoadDemo}
            className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-xl text-xs hover:bg-indigo-500 cursor-pointer shadow-xs micro-interactive"
          >
            Load Benchmark Inventory
          </button>
        </div>
      ) : (
        <>
          {/* Dynamic Assumptions Toolbar */}
          <div className="exec-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Buffer Assumptions</span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Demand window: {invAnalysis.days_used} days | Z-Score: {invAnalysis.z.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <span>Service Level:</span>
                  <span className="font-mono text-slate-900 dark:text-white font-bold">{serviceLevel}%</span>
                </div>
                <input
                  type="range"
                  min={90}
                  max={99}
                  value={serviceLevel}
                  onChange={e => setServiceLevel(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <span>History Window:</span>
                  <span className="font-mono text-slate-900 dark:text-white font-bold">{windowDays} days</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={180}
                  value={windowDays}
                  onChange={e => setWindowDays(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <span>Order Cover:</span>
                  <span className="font-mono text-slate-900 dark:text-white font-bold">{coverDays} days</span>
                </div>
                <input
                  type="range"
                  min={7}
                  max={90}
                  value={coverDays}
                  onChange={e => setCoverDays(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <span>Excess Threshold:</span>
                  <span className="font-mono text-slate-900 dark:text-white font-bold">{excessDays} days</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={365}
                  value={excessDays}
                  onChange={e => setExcessDays(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* 5 Status Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <MetricCard
              label={STOCKOUT}
              value={String(counts[STOCKOUT])}
              subtitle="Stock ends before arrival"
              icon={<AlertTriangle className="w-4 h-4" />}
              size="compact"
              accentColor="rose"
            />
            <MetricCard
              label={REORDER}
              value={String(counts[REORDER])}
              subtitle="At or below reorder level"
              icon={<Clock className="w-4 h-4" />}
              size="compact"
              accentColor="amber"
            />
            <MetricCard
              label={EXCESS}
              value={String(counts[EXCESS])}
              subtitle="Holding &gt; threshold days"
              icon={<Package className="w-4 h-4" />}
              size="compact"
              accentColor="indigo"
            />
            <MetricCard
              label={OK}
              value={String(counts[OK])}
              subtitle="Healthy buffer balance"
              icon={<CheckCircle2 className="w-4 h-4" />}
              size="compact"
              accentColor="emerald"
            />
            <MetricCard
              label="Excess Tied Cash"
              value={money(totalExcessCash)}
              subtitle="Valued at product cost"
              icon={<DollarSign className="w-4 h-4" />}
              size="compact"
              accentColor="sky"
            />
          </div>

          {/* Days of stock chart */}
          {chartData.length > 0 && (
            <div className="exec-card p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
                Days of Stock Coverage vs Supplier Delivery Lead Time
              </h3>
              <div className="h-80 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" horizontal={false} />
                    <XAxis type="number" unit="d" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="product"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={140}
                    />
                    <Tooltip
                      formatter={(val: any) => [`${val} days`, 'Days of Stock']}
                      contentStyle={{
                        backgroundColor: 'var(--card-surface)',
                        borderColor: 'var(--card-border)',
                        borderRadius: '0.75rem',
                        fontSize: '12px'
                      }}
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
            </div>
          )}

          {/* Inventory Table with Reorder Download */}
          <div className="exec-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
                Stock Positions &amp; Suggested Orders
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer micro-interactive"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Excel (.xlsx)</span>
                </button>
                <button
                  onClick={handleDownloadCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-all cursor-pointer micro-interactive"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto max-h-[480px]">
              <table className="w-full text-xs text-left text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 sticky top-0 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">Product Name</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Current Stock</th>
                    <th className="p-3 text-right">Coverage</th>
                    <th className="p-3 text-right">Lead Time</th>
                    <th className="p-3 text-right">Daily Demand</th>
                    <th className="p-3 text-right">Reorder Point</th>
                    <th className="p-3 text-right">Suggested Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-mono text-[11px]">
                  {filteredRows.map(r => (
                    <tr key={r.product_id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      <td className="p-3 font-sans font-medium text-slate-900 dark:text-white whitespace-nowrap">
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
                      <td className="p-3 text-right font-medium text-slate-800 dark:text-slate-200">
                        {Math.round(r.current_stock || 0)}
                      </td>
                      <td className="p-3 text-right">
                        {(r.days_of_stock || 0).toFixed(1)} days
                      </td>
                      <td className="p-3 text-right text-slate-500 dark:text-slate-400">
                        {Math.round(r.lead_time_days || 0)} days
                      </td>
                      <td className="p-3 text-right text-slate-500 dark:text-slate-400">
                        {(r.avg_daily_demand || 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-right text-slate-500 dark:text-slate-400">
                        {Math.round(r.reorder_point || 0)}
                      </td>
                      <td className="p-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                        {(r.suggested_order_qty || 0) > 0 ? `${Math.round(r.suggested_order_qty!)} units` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

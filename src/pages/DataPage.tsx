import React, { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Hero } from '../components/Hero';
import { Tip } from '../components/Tip';
import { MetricCard } from '../components/MetricCard';
import { checkDataQuality, splitValidRows, REQUIRED_COLUMNS } from '../engine/data_quality';
import { QualityReport, SalesRow, InventoryRow } from '../types';
import { Download, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, PlayCircle } from 'lucide-react';

interface DataPageProps {
  onQuickStart: () => Promise<void>;
  onLoadCleanDemo: () => Promise<void>;
  onLoadDirtyDemo: () => Promise<void>;
  onConfirmData: (valid: SalesRow[], excluded: any[], label: string, isSimulated: boolean, inventory?: InventoryRow[]) => void;
  currentValidCount: number;
  currentExcludedCount: number;
  sourceLabel: string | null;
  onNavigateToExecutive: () => void;
}

export const DataPage: React.FC<DataPageProps> = ({
  onQuickStart,
  onLoadCleanDemo,
  onLoadDirtyDemo,
  onConfirmData,
  currentValidCount,
  currentExcludedCount,
  sourceLabel,
  onNavigateToExecutive
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formatOpen, setFormatOpen] = useState(false);

  // Staged file state
  const [stagedRows, setStagedRows] = useState<any[] | null>(null);
  const [stagedLabel, setStagedLabel] = useState<string>('');
  const [stagedIsSimulated, setStagedIsSimulated] = useState<boolean>(false);
  const [stagedReport, setStagedReport] = useState<QualityReport | null>(null);
  const [stagedInventory, setStagedInventory] = useState<InventoryRow[] | undefined>(undefined);
  const [dataConfirmed, setDataConfirmed] = useState(false);

  // Trigger quick start
  const handleQuickStart = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      await onQuickStart();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load demo data.');
    } finally {
      setLoading(false);
    }
  };

  // Trigger clean demo
  const handleCleanDemo = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      setDataConfirmed(false);
      const res = await fetch('/data/sales.csv');
      const text = await res.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      const report = checkDataQuality(parsed.data, parsed.meta.fields || []);
      setStagedRows(parsed.data);
      setStagedLabel('SIMULATED demo data (clean)');
      setStagedIsSimulated(true);
      setStagedReport(report);
      setStagedInventory(undefined);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load clean demo.');
    } finally {
      setLoading(false);
    }
  };

  // Trigger dirty demo
  const handleDirtyDemo = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      setDataConfirmed(false);
      const res = await fetch('/data/sales_dirty.csv');
      const text = await res.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      const report = checkDataQuality(parsed.data, parsed.meta.fields || []);
      setStagedRows(parsed.data);
      setStagedLabel('SIMULATED demo data with planted errors');
      setStagedIsSimulated(true);
      setStagedReport(report);
      setStagedInventory(undefined);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load dirty demo.');
    } finally {
      setLoading(false);
    }
  };

  // Handle uploaded file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setErrorMsg(null);
    setDataConfirmed(false);

    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const buffer = evt.target?.result;
          const workbook = XLSX.read(buffer, { type: 'binary' });

          // Find Sales sheet
          const salesSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('sales')) || workbook.SheetNames[0];
          const salesSheet = workbook.Sheets[salesSheetName];
          const salesJson: any[] = XLSX.utils.sheet_to_json(salesSheet);

          // Find optional Inventory sheet
          const invSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('inventory') || n.toLowerCase().includes('stock'));
          let invData: InventoryRow[] | undefined = undefined;
          if (invSheetName) {
            const invSheet = workbook.Sheets[invSheetName];
            const invJson: any[] = XLSX.utils.sheet_to_json(invSheet);
            invData = invJson.map(r => ({
              product_id: String(r.product_id ?? '').trim(),
              current_stock: Number(r.current_stock ?? 0),
              lead_time_days: Number(r.lead_time_days ?? 0)
            }));
          }

          if (salesJson.length === 0) {
            throw new Error('No data found in the Sales sheet.');
          }

          const cols = Object.keys(salesJson[0]);
          const report = checkDataQuality(salesJson, cols);
          setStagedRows(salesJson);
          setStagedLabel(`Uploaded workbook: ${file.name}`);
          setStagedIsSimulated(false);
          setStagedReport(report);
          setStagedInventory(invData);
        } catch (err: any) {
          setErrorMsg(`Failed to parse Excel file: ${err.message}`);
        } finally {
          setLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    } else {
      // CSV
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: results => {
          try {
            if (results.data.length === 0) {
              throw new Error('Uploaded CSV file is empty.');
            }
            const cols = results.meta.fields || [];
            const report = checkDataQuality(results.data, cols);
            setStagedRows(results.data);
            setStagedLabel(`Uploaded file: ${file.name}`);
            setStagedIsSimulated(false);
            setStagedReport(report);
            setStagedInventory(undefined);
          } catch (err: any) {
            setErrorMsg(err.message);
          } finally {
            setLoading(false);
          }
        },
        error: err => {
          setErrorMsg(`CSV parsing error: ${err.message}`);
          setLoading(false);
        }
      });
    }
  };

  // Confirm data for use in engine
  const handleConfirm = () => {
    if (!stagedRows || !stagedReport) return;
    const { valid, excluded } = splitValidRows(stagedRows, stagedReport);
    if (valid.length === 0) {
      setErrorMsg('No usable rows are left after removing errors. Please fix the file.');
      return;
    }
    onConfirmData(valid, excluded, stagedLabel, stagedIsSimulated, stagedInventory);
    setDataConfirmed(true);
  };

  // Download excluded rows
  const downloadExcluded = () => {
    if (!stagedRows || !stagedReport) return;
    const { excluded } = splitValidRows(stagedRows, stagedReport);
    const csv = Papa.unparse(excluded);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'excluded_rows.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Hero
        icon="🏁"
        title="Start here"
        subtitle="Choose your sales data. We check it for mistakes before we use it, so you can trust the results."
      />

      <Tip
        label="Quick start"
        text="New here? Click the big button. It loads made-up demo data and takes you straight to the results. You can also upload your own file below."
      />

      {errorMsg && (
        <div className="p-4 bg-rose-50 border-l-4 border-rose-600 rounded-xl text-rose-800 text-sm flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main one-click demo button */}
      <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            One-Click Interactive Demo
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            Loads 18 months of simulated sales (13,590 orders) + inventory dataset, runs data checks, and opens the Executive Summary.
          </p>
        </div>
        <button
          onClick={handleQuickStart}
          disabled={loading}
          className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
        >
          <PlayCircle className="w-5 h-5" />
          <span>🚀 Try the demo in one click</span>
        </button>
      </div>

      <div className="border-t border-slate-200 pt-6">
        <h3 className="text-lg font-bold text-slate-900 mb-3">
          Or choose your own data
        </h3>

        {/* Data dictionary expander */}
        <div className="border border-slate-200 rounded-xl bg-white mb-6 overflow-hidden">
          <button
            onClick={() => setFormatOpen(!formatOpen)}
            className="w-full p-4 text-left font-semibold text-sm text-slate-800 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
              <span>Required file format (data dictionary)</span>
            </div>
            <span className="text-xs text-indigo-600 font-medium">
              {formatOpen ? 'Hide' : 'Show columns'}
            </span>
          </button>
          {formatOpen && (
            <div className="p-4 border-t border-slate-100 overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Column</th>
                    <th className="p-2.5">Meaning</th>
                    <th className="p-2.5">Format</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  <tr>
                    <td className="p-2 font-bold text-indigo-950">order_id</td>
                    <td className="p-2 font-sans">Order number (an order may have several rows)</td>
                    <td className="p-2">Text or number</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold text-indigo-950">order_date</td>
                    <td className="p-2 font-sans">Order date, YYYY-MM-DD</td>
                    <td className="p-2">YYYY-MM-DD</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold text-indigo-950">product_id</td>
                    <td className="p-2 font-sans">Product code</td>
                    <td className="p-2">Text</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold text-indigo-950">product_name</td>
                    <td className="p-2 font-sans">Product title</td>
                    <td className="p-2">Text</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold text-indigo-950">category</td>
                    <td className="p-2 font-sans">Product category</td>
                    <td className="p-2">Text</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold text-indigo-950">quantity</td>
                    <td className="p-2 font-sans">Items sold (whole number, 1 or more)</td>
                    <td className="p-2">Integer &gt;= 1</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold text-indigo-950">list_price</td>
                    <td className="p-2 font-sans">Price per unit before discount (above 0)</td>
                    <td className="p-2">Decimal &gt; 0</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold text-indigo-950">discount_rate</td>
                    <td className="p-2 font-sans">Discount fraction: 0.10 = 10% (0 to 1)</td>
                    <td className="p-2">0.0 to 1.0</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold text-indigo-950">unit_cost</td>
                    <td className="p-2 font-sans">Cost per unit (0 or more)</td>
                    <td className="p-2">Decimal &gt;= 0</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Demo buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <button
            onClick={handleCleanDemo}
            disabled={loading}
            className="p-4 bg-white border border-slate-200 hover:border-indigo-400 rounded-xl text-left hover:shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            <div className="font-bold text-slate-900 text-sm">
              Use clean demo data (SIMULATED)
            </div>
            <p className="text-xs text-slate-500 mt-1">
              13,590 valid transactions without planted errors.
            </p>
          </button>

          <button
            onClick={handleDirtyDemo}
            disabled={loading}
            className="p-4 bg-white border border-slate-200 hover:border-amber-400 rounded-xl text-left hover:shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            <div className="font-bold text-slate-900 text-sm">
              Use demo data with deliberate errors (SIMULATED)
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Includes missing values, negative quantity, invalid discount rates to test data quality engine.
            </p>
          </button>
        </div>

        {/* Excel Template & File Uploader */}
        <div className="bg-slate-100/70 border border-slate-200/80 rounded-2xl p-5 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
            <div>
              <h4 className="font-bold text-sm text-slate-900">
                Excel Template with Built-In Validation
              </h4>
              <p className="text-xs text-slate-600 mt-0.5">
                Download the spreadsheet template with built-in data validation rules, fill it in, then upload it here.
              </p>
            </div>
            <a
              href="/templates/EDIE_data_template.xlsx"
              download="EDIE_data_template.xlsx"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-xl shadow-xs transition-colors shrink-0"
            >
              <Download className="w-4 h-4 text-indigo-600" />
              <span>📥 Download Excel template</span>
            </a>
          </div>

          <div className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl p-6 bg-white text-center transition-all cursor-pointer">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer block">
              <Upload className="w-8 h-8 text-indigo-600 mx-auto mb-2" />
              <span className="font-bold text-sm text-indigo-900 block">
                Click to upload your sales file
              </span>
              <span className="text-xs text-slate-500 block mt-1">
                Supports Excel (.xlsx) or CSV format
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Quality Report Output if file is staged */}
      {stagedReport && stagedRows && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          {stagedIsSimulated && (
            <div className="p-3 bg-amber-50 border-l-4 border-amber-500 text-amber-900 text-xs font-medium rounded-r-lg">
              ⚠️ This is SIMULATED data created for demonstration. It is not real business data.
            </div>
          )}

          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Data quality report
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Source: {stagedLabel}
            </p>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard
              label="Rows in file"
              value={stagedReport.n_rows.toLocaleString('en-US')}
            />
            <MetricCard
              label="Rows with errors"
              value={stagedReport.n_error_rows.toLocaleString('en-US')}
              variant={stagedReport.n_error_rows > 0 ? 'danger' : 'primary'}
            />
            <MetricCard
              label="Rows usable"
              value={(stagedReport.n_rows - stagedReport.n_error_rows).toLocaleString('en-US')}
              variant="success"
            />
          </div>

          {/* Issues table */}
          {stagedReport.issues.length === 0 ? (
            <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-sm flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="font-medium">No problems found. File is ready for analysis.</span>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-700">
                  <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Check</th>
                      <th className="p-3">Severity</th>
                      <th className="p-3 text-right">Rows affected</th>
                      <th className="p-3">Example line numbers</th>
                      <th className="p-3">How it affects analysis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stagedReport.issues.map((iss, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-900">{iss.check}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              iss.severity === 'ERROR'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {iss.severity}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-medium">
                          {iss.rows_affected.toLocaleString('en-US')}
                        </td>
                        <td className="p-3 font-mono text-[11px] text-slate-500">
                          {iss.example_row_numbers || '—'}
                        </td>
                        <td className="p-3 text-slate-600 leading-normal">{iss.impact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-2.5 bg-slate-50 text-[11px] text-slate-500 border-t border-slate-200">
                ERROR = the row cannot be used. WARNING = the row is kept, but review it. Nothing is changed or filled in automatically.
              </div>
            </div>
          )}

          {/* Excluded rows banner */}
          {stagedReport.n_error_rows > 0 && (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-3">
              <p>
                <b>{stagedReport.n_error_rows.toLocaleString('en-US')} rows with errors</b> will be LEFT OUT of all calculations, so totals will be lower than the raw file suggests. The original rows are kept and can be downloaded below.
              </p>
              <button
                onClick={downloadExcluded}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download the excluded rows (CSV)</span>
              </button>
            </div>
          )}

          {/* Confirm Button */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={handleConfirm}
              className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Use this data for analysis
            </button>

            {dataConfirmed && (
              <div className="text-xs text-emerald-700 font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>
                  Data confirmed! {stagedRows.length - stagedReport.n_error_rows} rows active.
                </span>
                <button
                  onClick={onNavigateToExecutive}
                  className="ml-2 text-indigo-600 underline font-bold hover:text-indigo-800 cursor-pointer"
                >
                  Open &quot;The big picture&quot; →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

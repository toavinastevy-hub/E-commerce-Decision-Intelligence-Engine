import React, { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Hero } from '../components/Hero';
import { SalesRow, InventoryRow } from '../types';
import { parseSqlDump } from '../engine/sql_parser';
import { autoDetectMapping, transformToSalesRows, ColumnMapping } from '../engine/smart_importer';
import { validateInventory } from '../engine/inventory';
import { exportToExcel } from '../engine/export_utils';
import {
  Upload,
  FileSpreadsheet,
  Database,
  FileText,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Download,
  AlertCircle
} from 'lucide-react';

interface DataPageProps {
  onConfirmData: (valid: SalesRow[], excluded: any[], label: string, isSimulated: boolean, inventory?: InventoryRow[]) => void;
  onNavigateToDashboard: () => void;
}

export const DataPage: React.FC<DataPageProps> = ({
  onConfirmData,
  onNavigateToDashboard
}) => {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Staged data
  const [detectedRows, setDetectedRows] = useState<any[] | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [fileName, setFileName] = useState<string>('');
  const [showSqlInput, setShowSqlInput] = useState(false);
  const [sqlText, setSqlText] = useState('');

  // 1. Process files: Excel, CSV, SQL
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatusMsg(null);
    setFileName(file.name);

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const buffer = evt.target?.result;
          const workbook = XLSX.read(buffer, { type: 'binary' });
          const firstSheet = workbook.SheetNames[0];
          const rawJson: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

          if (rawJson.length === 0) {
            throw new Error('The uploaded Excel sheet contains no records.');
          }

          const cols = Object.keys(rawJson[0]);
          const mapping = autoDetectMapping(cols);

          setDetectedRows(rawJson);
          setDetectedColumns(cols);
          setColumnMapping(mapping);
          setStatusMsg({
            text: `Successfully read ${rawJson.length.toLocaleString()} rows from ${file.name}. Review mappings below.`,
            type: 'success'
          });
        } catch (err: any) {
          setStatusMsg({ text: err.message || 'Failed to parse Excel file', type: 'error' });
        } finally {
          setLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    } else if (ext === 'sql') {
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const content = String(evt.target?.result || '');
          const parsed = parseSqlDump(content);
          if (parsed.length === 0) {
            throw new Error('No INSERT INTO row data could be extracted from this SQL file.');
          }
          const cols = Object.keys(parsed[0]);
          const mapping = autoDetectMapping(cols);
          setDetectedRows(parsed);
          setDetectedColumns(cols);
          setColumnMapping(mapping);
          setStatusMsg({
            text: `Successfully parsed ${parsed.length.toLocaleString()} records from SQL dump.`,
            type: 'success'
          });
        } catch (err: any) {
          setStatusMsg({ text: err.message, type: 'error' });
        } finally {
          setLoading(false);
        }
      };
      reader.readAsText(file);
    } else {
      // CSV or other text formats
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: results => {
          try {
            if (results.data.length === 0) {
              throw new Error('The uploaded CSV file is empty.');
            }
            const cols = results.meta.fields || (results.data[0] ? Object.keys(results.data[0] as object) : []);
            const mapping = autoDetectMapping(cols);
            setDetectedRows(results.data);
            setDetectedColumns(cols);
            setColumnMapping(mapping);
            setStatusMsg({
              text: `Successfully read ${results.data.length.toLocaleString()} rows from ${file.name}.`,
              type: 'success'
            });
          } catch (err: any) {
            setStatusMsg({ text: err.message, type: 'error' });
          } finally {
            setLoading(false);
          }
        },
        error: err => {
          setStatusMsg({ text: `CSV parsing error: ${err.message}`, type: 'error' });
          setLoading(false);
        }
      });
    }
  };

  // 2. Process pasted SQL text
  const handleParseSqlText = () => {
    if (!sqlText.trim()) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      const parsed = parseSqlDump(sqlText);
      if (parsed.length === 0) {
        throw new Error('No INSERT INTO statements found in provided SQL query.');
      }
      const cols = Object.keys(parsed[0]);
      const mapping = autoDetectMapping(cols);
      setDetectedRows(parsed);
      setDetectedColumns(cols);
      setColumnMapping(mapping);
      setFileName('Custom SQL Query Input');
      setStatusMsg({
        text: `Extracted ${parsed.length.toLocaleString()} row items from SQL.`,
        type: 'success'
      });
    } catch (err: any) {
      setStatusMsg({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 3. Transform and apply to dashboard
  const handleTransformAndLaunch = () => {
    if (!detectedRows) return;
    try {
      const transformedSales = transformToSalesRows(detectedRows, columnMapping);
      if (transformedSales.length === 0) {
        throw new Error('No valid sales rows could be produced from the uploaded data.');
      }

      onConfirmData(transformedSales, [], fileName || 'Uploaded Dataset', false);
      onNavigateToDashboard();
    } catch (err: any) {
      setStatusMsg({ text: err.message, type: 'error' });
    }
  };

  // 4. Load demo sample
  const handleLoadDemo = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const sRes = await fetch('/data/sales.csv');
      const sText = await sRes.text();
      const sParsed = Papa.parse(sText, { header: true, skipEmptyLines: true });
      const cols = sParsed.meta.fields || Object.keys(sParsed.data[0] as object);
      const mapping = autoDetectMapping(cols);
      const transformed = transformToSalesRows(sParsed.data, mapping);

      const iRes = await fetch('/data/inventory.csv');
      const iText = await iRes.text();
      const iParsed = Papa.parse(iText, { header: true, skipEmptyLines: true });
      const salesPids = Array.from(new Set(transformed.map(r => r.product_id)));
      const { good: goodInv } = validateInventory(iParsed.data, salesPids);

      onConfirmData(transformed, [], 'Global Retail Benchmark Demo', true, goodInv);
      onNavigateToDashboard();
    } catch (err: any) {
      setStatusMsg({ text: `Failed to load demo: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Robust template download using local binary or dynamic SheetJS fallback
  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch('/EDIE_data_template.xlsx');
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'EDIE_data_template.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
    } catch (err) {
      console.warn('Fallback generating template via XLSX:', err);
    }

    // Dynamic SheetJS fallback
    const salesSample = [
      { order_id: 'ORD-1001', order_date: '2024-01-15', product_id: 'PRD-01', product_name: 'Wireless Noise-Canceling Headphones', category: 'Audio', quantity: 2, unit_price: 149.99, unit_cost: 65.00, discount_amount: 15.00, return_quantity: 0 },
      { order_id: 'ORD-1002', order_date: '2024-01-16', product_id: 'PRD-02', product_name: 'Ergonomic Mechanical Keyboard', category: 'Accessories', quantity: 1, unit_price: 119.00, unit_cost: 45.00, discount_amount: 0.00, return_quantity: 0 },
      { order_id: 'ORD-1003', order_date: '2024-01-18', product_id: 'PRD-03', product_name: 'Ultra-Wide 4K Gaming Monitor', category: 'Displays', quantity: 1, unit_price: 499.00, unit_cost: 290.00, discount_amount: 50.00, return_quantity: 0 },
      { order_id: 'ORD-1004', order_date: '2024-01-19', product_id: 'PRD-04', product_name: 'USB-C Multi-Port Docking Station', category: 'Accessories', quantity: 3, unit_price: 79.99, unit_cost: 28.00, discount_amount: 10.00, return_quantity: 0 }
    ];

    const inventorySample = [
      { product_id: 'PRD-01', current_stock: 45, reorder_point: 20, lead_time_days: 14, unit_cost: 65.00 },
      { product_id: 'PRD-02', current_stock: 12, reorder_point: 15, lead_time_days: 10, unit_cost: 45.00 },
      { product_id: 'PRD-03', current_stock: 8, reorder_point: 10, lead_time_days: 21, unit_cost: 290.00 },
      { product_id: 'PRD-04', current_stock: 85, reorder_point: 30, lead_time_days: 7, unit_cost: 28.00 }
    ];

    exportToExcel([
      { name: 'Sales Transactions', data: salesSample },
      { name: 'Inventory Stock', data: inventorySample }
    ], 'EDIE_data_template.xlsx');
  };

  return (
    <div className="space-y-6">
      <Hero
        icon={<FileSpreadsheet className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        title="Universal Data Ingestion &amp; Hub"
        subtitle="Upload any Excel spreadsheet, CSV export, or SQL dump. The engine automatically maps columns and converts your data into executive reports."
      />

      {/* Status Messages */}
      {statusMsg && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 micro-interactive ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-300'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Main Ingestion Dropzone & Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Drag & Drop Upload Zone */}
        <div className="exec-card p-6 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
                Import File (Excel, CSV, or SQL)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Drop your file here or click to browse. Formats supported: .xlsx, .xls, .csv, .sql
              </p>
            </div>
            <button
              onClick={() => setShowSqlInput(!showSqlInput)}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{showSqlInput ? 'Hide SQL Box' : 'Paste SQL Query'}</span>
            </button>
          </div>

          {!showSqlInput ? (
            <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-slate-50/50 dark:bg-slate-900/30 hover:bg-indigo-50/20 dark:hover:bg-indigo-950/20 group micro-interactive">
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.sql"
                onChange={handleFileUpload}
                className="hidden"
                disabled={loading}
              />
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {loading ? 'Analyzing schema...' : 'Choose or Drag File Here'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Supports .xlsx, .xls, .csv, and .sql database exports
              </span>
            </label>
          ) : (
            <div className="space-y-3">
              <textarea
                value={sqlText}
                onChange={e => setSqlText(e.target.value)}
                placeholder="Paste your raw SQL script or INSERT INTO statements here..."
                rows={7}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-indigo-500 shadow-2xs"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleParseSqlText}
                  disabled={loading || !sqlText.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer micro-interactive"
                >
                  {loading ? 'Parsing SQL...' : 'Extract SQL Records'}
                </button>
              </div>
            </div>
          )}

          {/* Quick Demo Pre-load */}
          <div className="pt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Want to test with benchmark e-commerce records?</span>
            <button
              onClick={handleLoadDemo}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer micro-interactive"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Load 18-Month Benchmark Demo</span>
            </button>
          </div>
        </div>

        {/* Quick Excel Template & Data Guide */}
        <div className="exec-card p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Standard Excel Template</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Prefer a structured template with pre-built data validation rules? Download our template with built-in checks for sales and stock.
            </p>
            <div className="space-y-2 pt-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span>Auto-converts foreign column names</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span>Auto-calculates missing unit costs</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span>Normalizes any date &amp; currency format</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-xs rounded-xl border border-slate-700 transition-all shadow-xs cursor-pointer micro-interactive"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Download Excel Template</span>
          </button>
        </div>
      </div>

      {/* Auto-Detected Column Mapping Preview (If file loaded) */}
      {detectedRows && (
        <div className="exec-card p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Detected Schema &amp; Column Mapping</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Source: <span className="font-mono text-indigo-600 dark:text-indigo-300">{fileName}</span> ({detectedRows.length.toLocaleString()} rows)
              </p>
            </div>

            <button
              onClick={handleTransformAndLaunch}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/25 transition-all cursor-pointer micro-interactive"
            >
              <span>Transform &amp; Launch Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Mapping Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { key: 'order_id', label: 'Order ID' },
              { key: 'order_date', label: 'Order Date' },
              { key: 'product_name', label: 'Product Name' },
              { key: 'category', label: 'Category' },
              { key: 'quantity', label: 'Quantity' },
              { key: 'list_price', label: 'Unit Price' },
              { key: 'discount_rate', label: 'Discount Rate' },
              { key: 'unit_cost', label: 'Unit Cost' },
              { key: 'total_amount', label: 'Total Sales' }
            ].map(target => {
              const currentMapped = (columnMapping as any)[target.key];
              return (
                <div key={target.key} className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    {target.label}
                  </span>
                  <select
                    value={currentMapped || ''}
                    onChange={e =>
                      setColumnMapping(prev => ({
                        ...prev,
                        [target.key]: e.target.value || undefined
                      }))
                    }
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700/80 rounded-lg p-1.5 text-xs text-indigo-700 dark:text-indigo-300 font-mono focus:outline-hidden"
                  >
                    <option value="">(Auto-generate)</option>
                    {detectedColumns.map(col => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {/* Sample Rows Preview */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Sample Data Rows (First 5 records)
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto max-h-48">
              <table className="w-full text-xs text-left text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-mono text-[11px] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    {detectedColumns.slice(0, 8).map(c => (
                      <th key={c} className="p-2.5 whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-mono text-[11px]">
                  {detectedRows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      {detectedColumns.slice(0, 8).map(c => (
                        <td key={c} className="p-2.5 truncate max-w-[140px]">
                          {String(r[c] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

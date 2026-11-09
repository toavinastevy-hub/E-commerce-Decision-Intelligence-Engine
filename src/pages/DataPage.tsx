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
  validateAndParseWorkbook,
  parseValidatedSalesSheet,
  parseValidatedInventorySheet,
  SheetAnalysis,
  WorkbookValidationResult,
  REQUIRED_TEMPLATE_SALES_FIELDS
} from '../engine/template_validator';
import {
  Upload,
  FileSpreadsheet,
  Database,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Download,
  AlertCircle,
  Trash2,
  Layers,
  Info,
  Check,
  FileText,
  Boxes,
  HelpCircle,
  RefreshCw
} from 'lucide-react';

interface DataPageProps {
  onConfirmData: (
    valid: SalesRow[],
    excluded: any[],
    label: string,
    isSimulated: boolean,
    inventory?: InventoryRow[] | null
  ) => void;
  onClearData: () => void;
  hasActiveData: boolean;
  activeDataLabel: string | null;
  activeRowCount: number;
  onNavigateToDashboard: () => void;
}

export const DataPage: React.FC<DataPageProps> = ({
  onConfirmData,
  onClearData,
  hasActiveData,
  activeDataLabel,
  activeRowCount,
  onNavigateToDashboard
}) => {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Staged Excel Workbook Data (Multi-sheet)
  const [workbookResult, setWorkbookResult] = useState<WorkbookValidationResult | null>(null);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState<number>(0);
  const [salesSheetName, setSalesSheetName] = useState<string>('');
  const [inventorySheetName, setInventorySheetName] = useState<string | null>(null);

  // Staged CSV / SQL data
  const [detectedRows, setDetectedRows] = useState<any[] | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});

  const [fileName, setFileName] = useState<string>('');
  const [fileType, setFileType] = useState<'excel' | 'csv' | 'sql' | null>(null);
  const [showSqlInput, setShowSqlInput] = useState(false);
  const [sqlText, setSqlText] = useState('');

  // Reset all staged upload state
  const clearStagedState = () => {
    setWorkbookResult(null);
    setSelectedSheetIndex(0);
    setSalesSheetName('');
    setInventorySheetName(null);
    setDetectedRows(null);
    setDetectedColumns([]);
    setColumnMapping({});
    setFileName('');
    setFileType(null);
  };

  // 1. Process files: Excel, CSV, SQL
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatusMsg(null);
    clearStagedState();
    setFileName(file.name);

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      setFileType('excel');
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const buffer = evt.target?.result;
          const workbook = XLSX.read(buffer, { type: 'binary', cellDates: true });

          // Validate all workbook sheets against required commercial template
          const validation = validateAndParseWorkbook(workbook);

          if (!validation.isValid) {
            setWorkbookResult(null);
            setStatusMsg({
              text: validation.errorMessage || 'Invalid file format. Please upload an Excel file that conforms to the official template.',
              type: 'error'
            });
            return;
          }

          setWorkbookResult(validation);

          // Select the active sales sheet index
          const activeSalesIndex = validation.sheets.findIndex(
            s => s.sheetName === validation.activeSalesSheet?.sheetName
          );
          setSelectedSheetIndex(activeSalesIndex >= 0 ? activeSalesIndex : 0);
          setSalesSheetName(validation.activeSalesSheet?.sheetName || validation.sheets[0].sheetName);

          if (validation.activeInventorySheet) {
            setInventorySheetName(validation.activeInventorySheet.sheetName);
          }

          const salesCount = validation.activeSalesSheet?.rowCount || 0;
          const invText = validation.activeInventorySheet
            ? ` and linked ${validation.activeInventorySheet.rowCount} inventory items`
            : '';

          setStatusMsg({
            text: `Workbook validated: Loaded ${validation.sheets.length} sheets (${salesCount.toLocaleString()} sales transactions ready${invText}).`,
            type: 'success'
          });
        } catch (err: any) {
          setStatusMsg({
            text: err.message || 'Failed to read Excel workbook. Please verify the file is not corrupted.',
            type: 'error'
          });
        } finally {
          setLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    } else if (ext === 'sql') {
      setFileType('sql');
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const content = String(evt.target?.result || '');
          const parsed = parseSqlDump(content);
          if (parsed.length === 0) {
            throw new Error('No INSERT INTO row data could be extracted from this SQL file.');
          }

          // Commercial sanity check
          const cols = Object.keys(parsed[0]);
          const mapping = autoDetectMapping(cols);
          if (!mapping.product_name && !mapping.order_id && !mapping.list_price) {
            throw new Error('The SQL dump does not contain sales transactions or commercial product data.');
          }

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
      setFileType('csv');
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: results => {
          try {
            if (results.data.length === 0) {
              throw new Error('The uploaded CSV file is empty.');
            }
            const cols = results.meta.fields || (results.data[0] ? Object.keys(results.data[0] as object) : []);

            // Check if CSV has business columns
            const cleanCols = cols.map(c => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
            const hasBizCol = cleanCols.some(c =>
              ['product', 'productid', 'productname', 'sku', 'price', 'quantity', 'qty', 'orderid'].some(k => c.includes(k))
            );

            if (!hasBizCol) {
              throw new Error(
                'The uploaded CSV file does not contain sales data or recognizable commercial fields (product, quantity, price). Please use the template format.'
              );
            }

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
    clearStagedState();
    setFileType('sql');

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

  // 3. Confirm and Launch: Complete Replacement of previous data
  const handleApplyData = () => {
    try {
      if (fileType === 'excel' && workbookResult) {
        // Find sales sheet
        const sSheet = workbookResult.sheets.find(s => s.sheetName === salesSheetName);
        if (!sSheet) {
          throw new Error('Please select a valid sheet for sales data.');
        }

        const parseResult = parseValidatedSalesSheet(sSheet);
        if (parseResult.error || parseResult.sales.length === 0) {
          throw new Error(parseResult.error || 'Failed to parse sales rows from selected sheet.');
        }

        let invRows: InventoryRow[] | null = null;
        if (inventorySheetName) {
          const iSheet = workbookResult.sheets.find(s => s.sheetName === inventorySheetName);
          if (iSheet) {
            const pids = Array.from(new Set(parseResult.sales.map(r => r.product_id)));
            invRows = parseValidatedInventorySheet(iSheet, pids);
          }
        }

        // Wipe old data completely and pass clean new records
        onConfirmData(parseResult.sales, [], fileName || 'Uploaded Workbook', false, invRows);
        onNavigateToDashboard();
      } else if ((fileType === 'csv' || fileType === 'sql') && detectedRows) {
        const transformedSales = transformToSalesRows(detectedRows, columnMapping);
        if (transformedSales.length === 0) {
          throw new Error('No valid sales rows could be produced from the uploaded data.');
        }

        // Wipe old data completely and pass clean new records
        onConfirmData(transformedSales, [], fileName || 'Uploaded Dataset', false, null);
        onNavigateToDashboard();
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message, type: 'error' });
    }
  };

  // 4. Clear data handler: resets whole application to blank
  const handleClearAll = () => {
    onClearData();
    clearStagedState();
    setStatusMsg({
      text: 'Active dataset has been removed. The application is now completely blank and ready for new data.',
      type: 'info'
    });
  };

  // 5. Load demo benchmark data
  const handleLoadDemo = async () => {
    setLoading(true);
    setStatusMsg(null);
    clearStagedState();

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

  // 6. Direct download of official template
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
      { order_id: 'ORD-1001', order_date: '2024-01-15', product_id: 'PRD-01', product_name: 'Wireless Noise-Canceling Headphones', category: 'Audio', quantity: 2, list_price: 149.99, discount_rate: 0.10, unit_cost: 65.00 },
      { order_id: 'ORD-1002', order_date: '2024-01-16', product_id: 'PRD-02', product_name: 'Ergonomic Mechanical Keyboard', category: 'Accessories', quantity: 1, list_price: 119.00, discount_rate: 0.00, unit_cost: 45.00 },
      { order_id: 'ORD-1003', order_date: '2024-01-18', product_id: 'PRD-03', product_name: 'Ultra-Wide 4K Gaming Monitor', category: 'Displays', quantity: 1, list_price: 499.00, discount_rate: 0.15, unit_cost: 290.00 },
      { order_id: 'ORD-1004', order_date: '2024-01-19', product_id: 'PRD-04', product_name: 'USB-C Multi-Port Docking Station', category: 'Accessories', quantity: 3, list_price: 79.99, discount_rate: 0.05, unit_cost: 28.00 }
    ];

    const inventorySample = [
      { product_id: 'PRD-01', current_stock: 45, lead_time_days: 14 },
      { product_id: 'PRD-02', current_stock: 12, lead_time_days: 10 },
      { product_id: 'PRD-03', current_stock: 8, lead_time_days: 21 },
      { product_id: 'PRD-04', current_stock: 85, lead_time_days: 7 }
    ];

    exportToExcel([
      { name: 'Sales', data: salesSample },
      { name: 'Inventory', data: inventorySample }
    ], 'EDIE_data_template.xlsx');
  };

  const currentlyViewedSheet: SheetAnalysis | null =
    workbookResult && workbookResult.sheets[selectedSheetIndex]
      ? workbookResult.sheets[selectedSheetIndex]
      : null;

  return (
    <div className="space-y-6">
      {/* Hero Header with Reset & Action buttons */}
      <Hero
        icon={<FileSpreadsheet className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        title="Universal Data Ingestion & Hub"
        subtitle="Upload your Excel workbook, CSV export, or SQL dump. Reads all sheets, validates commercial format, and converts records into executive analytics."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {hasActiveData && (
              <button
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-semibold text-xs rounded-xl border border-rose-200 dark:border-rose-900/40 transition-all cursor-pointer micro-interactive"
                title="Wipe active records and reset application to blank canvas"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All Data (Reset to Blank)</span>
              </button>
            )}
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer micro-interactive"
              title="Download official Microsoft Excel template with required columns"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Excel Template</span>
            </button>
          </div>
        }
      />

      {/* Active Dataset Status Alert (If data exists) */}
      {hasActiveData && (
        <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Active Dataset:</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-300">{activeDataLabel}</span>
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-mono">
                  {activeRowCount.toLocaleString()} records live
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                Uploading a new file will completely remove this current dataset and replace it with the new data.
              </p>
            </div>
          </div>
          <button
            onClick={handleClearAll}
            className="self-start sm:self-auto px-3 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/50 font-semibold text-xs rounded-lg transition-colors cursor-pointer border border-rose-200 dark:border-rose-900/40 shrink-0"
          >
            Clear Data Now
          </button>
        </div>
      )}

      {/* Status Messages */}
      {statusMsg && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-2.5 micro-interactive ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
              : statusMsg.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-300'
              : 'bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-800 dark:text-indigo-300'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : statusMsg.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 space-y-1">
            <div className="font-semibold">{statusMsg.text}</div>
            {statusMsg.type === 'error' && (
              <div className="text-[11px] text-rose-700 dark:text-rose-300/90 pt-1">
                To fix this, download the official Excel template above, paste your sales transactions into the "Sales" sheet, and re-upload.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Ingestion Dropzone & Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Drag & Drop Upload Zone */}
        <div className="exec-card p-6 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
                Import File (Excel Multi-Sheet, CSV, or SQL)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Drop your file here or click to browse. Reads all pages/sheets inside workbooks.
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
                {loading ? 'Analyzing all sheets & validating schema...' : 'Choose or Drag File Here'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Reads all sheets in .xlsx and .xls, as well as .csv and .sql files
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
            <span>Want to test with official benchmark records?</span>
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

        {/* Template Guide & Download Card */}
        <div className="exec-card p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Official Template Requirements</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              To prevent calculation errors and invalid charts, the engine strictly requires sales transactions matching the template structure:
            </p>

            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] font-mono space-y-1.5 text-slate-700 dark:text-slate-300">
              <div className="font-bold text-indigo-600 dark:text-indigo-400 uppercase text-[10px] tracking-wider">
                Sales Sheet Columns:
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <span>• order_id</span>
                <span>• order_date</span>
                <span>• product_id</span>
                <span>• product_name</span>
                <span>• category</span>
                <span>• quantity</span>
                <span>• list_price</span>
                <span>• discount_rate</span>
                <span>• unit_cost</span>
              </div>
            </div>

            <div className="space-y-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Multi-sheet reading: Sales, Stock, Guides</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Auto-normalizes dates, prices &amp; margins</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span>Rejects empty or non-business files</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleDownloadTemplate}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-xs rounded-xl border border-slate-700 transition-all shadow-xs cursor-pointer micro-interactive"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Download Official Template (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* MULTI-SHEET WORKBOOK VIEWER (When Excel file uploaded) */}
      {fileType === 'excel' && workbookResult && (
        <div className="exec-card p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>Workbook Multi-Sheet Inspector</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                File: <span className="font-mono text-indigo-600 dark:text-indigo-300 font-semibold">{fileName}</span> ({workbookResult.sheets.length} sheets detected)
              </p>
            </div>

            <button
              onClick={handleApplyData}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/25 transition-all cursor-pointer micro-interactive"
            >
              <span>Replace All Data &amp; Launch Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Sheet Selector Tabs */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Workbook Pages / Sheets:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {workbookResult.sheets.map((sheet, idx) => {
                const isSelected = selectedSheetIndex === idx;
                const isSalesTarget = salesSheetName === sheet.sheetName;
                const isInventoryTarget = inventorySheetName === sheet.sheetName;

                return (
                  <button
                    key={sheet.sheetName}
                    onClick={() => setSelectedSheetIndex(idx)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all flex items-center gap-2 border ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-500/50 shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {sheet.type === 'sales' ? (
                      <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    ) : sheet.type === 'inventory' ? (
                      <Boxes className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span className="font-semibold">{sheet.sheetName}</span>
                    <span className="font-mono text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      {sheet.rowCount.toLocaleString()} rows
                    </span>

                    {isSalesTarget && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold">
                        Active Sales
                      </span>
                    )}
                    {isInventoryTarget && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold">
                        Linked Stock
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Currently Selected Sheet Details & Actions */}
          {currentlyViewedSheet && (
            <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-xs shadow-2xs">
                    {currentlyViewedSheet.type === 'sales' ? (
                      <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    ) : currentlyViewedSheet.type === 'inventory' ? (
                      <Boxes className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Info className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Sheet: {currentlyViewedSheet.sheetName}</span>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                        Type: {currentlyViewedSheet.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {currentlyViewedSheet.rowCount.toLocaleString()} total rows • {currentlyViewedSheet.columns.length} columns detected
                    </p>
                  </div>
                </div>

                {currentlyViewedSheet.type === 'sales' && salesSheetName !== currentlyViewedSheet.sheetName && (
                  <button
                    onClick={() => setSalesSheetName(currentlyViewedSheet.sheetName)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Select as Sales Dataset</span>
                  </button>
                )}
              </div>

              {/* Sheet Columns Preview */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Detected Columns in "{currentlyViewedSheet.sheetName}":
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {currentlyViewedSheet.columns.map(col => {
                    const isRequiredField = REQUIRED_TEMPLATE_SALES_FIELDS.some(
                      f => f.aliases.includes(col.toLowerCase().replace(/[^a-z0-9]/g, ''))
                    );
                    return (
                      <span
                        key={col}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-mono border ${
                          isRequiredField
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 font-semibold'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {col}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Sample Rows Table */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Preview Rows (First 5 records):
                </span>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto max-h-56 bg-white dark:bg-slate-950">
                  <table className="w-full text-xs text-left text-slate-700 dark:text-slate-300">
                    <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-mono text-[11px] border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        {currentlyViewedSheet.columns.slice(0, 10).map(c => (
                          <th key={c} className="p-2.5 whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-mono text-[11px]">
                      {currentlyViewedSheet.rawRows.slice(0, 5).map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                          {currentlyViewedSheet.columns.slice(0, 10).map(c => (
                            <td key={c} className="p-2.5 truncate max-w-[160px]">
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
      )}

      {/* CSV / SQL Column Mapping Preview (If CSV or SQL loaded) */}
      {(fileType === 'csv' || fileType === 'sql') && detectedRows && (
        <div className="exec-card p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Detected CSV / SQL Schema &amp; Mapping</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Source: <span className="font-mono text-indigo-600 dark:text-indigo-300">{fileName}</span> ({detectedRows.length.toLocaleString()} rows)
              </p>
            </div>

            <button
              onClick={handleApplyData}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/25 transition-all cursor-pointer micro-interactive"
            >
              <span>Replace All Data &amp; Launch Dashboard</span>
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
                    <option value="">(Auto-detect)</option>
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
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto max-h-48 bg-white dark:bg-slate-950">
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
export default DataPage;

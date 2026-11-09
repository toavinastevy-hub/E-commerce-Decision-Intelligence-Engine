import * as XLSX from 'xlsx';
import { SalesRow, InventoryRow } from '../types';

export interface SheetAnalysis {
  sheetName: string;
  rowCount: number;
  columns: string[];
  type: 'sales' | 'inventory' | 'instructions' | 'invalid';
  matchedSalesFields: string[];
  missingSalesFields: string[];
  rawRows: any[];
}

export interface WorkbookValidationResult {
  isValid: boolean;
  sheets: SheetAnalysis[];
  activeSalesSheet: SheetAnalysis | null;
  activeInventorySheet: SheetAnalysis | null;
  errorMessage?: string;
}

// Official template columns for Sales
export const REQUIRED_TEMPLATE_SALES_FIELDS: { key: keyof SalesRow; label: string; aliases: string[] }[] = [
  { key: 'order_id', label: 'Order ID', aliases: ['order_id', 'orderid', 'order_number', 'order_no', 'invoice_no', 'invoiceno', 'invoice_id', 'transaction_id'] },
  { key: 'order_date', label: 'Order Date', aliases: ['order_date', 'orderdate', 'date', 'transaction_date', 'invoice_date', 'sale_date', 'created_at'] },
  { key: 'product_id', label: 'Product ID', aliases: ['product_id', 'productid', 'sku', 'item_code', 'item_id', 'prod_id'] },
  { key: 'product_name', label: 'Product Name', aliases: ['product_name', 'productname', 'item_name', 'product', 'title', 'item', 'description'] },
  { key: 'category', label: 'Category', aliases: ['category', 'product_category', 'dept', 'department', 'type', 'group'] },
  { key: 'quantity', label: 'Quantity', aliases: ['quantity', 'qty', 'units', 'volume', 'count', 'amount_sold'] },
  { key: 'list_price', label: 'List Price', aliases: ['list_price', 'price', 'unit_price', 'selling_price', 'item_price', 'rate'] },
  { key: 'discount_rate', label: 'Discount Rate', aliases: ['discount_rate', 'discount', 'disc', 'discount_pct', 'disc_rate'] },
  { key: 'unit_cost', label: 'Unit Cost', aliases: ['unit_cost', 'cost', 'cogs', 'cost_price', 'buy_price', 'item_cost'] }
];

// Essential core fields that MUST be present to be considered a business sales table
export const CRITICAL_BUSINESS_FIELDS = ['product_id', 'quantity', 'list_price', 'order_date'];

// Inventory sheet columns
export const INVENTORY_FIELDS = {
  product_id: ['product_id', 'productid', 'sku', 'item_code'],
  current_stock: ['current_stock', 'stock', 'inventory', 'on_hand', 'units_in_stock', 'quantity_on_hand'],
  lead_time_days: ['lead_time_days', 'lead_time', 'supplier_lead_time', 'days_lead_time']
};

/**
 * Normalizes date from Excel serial number, Date object, or string.
 */
export function normalizeExcelDate(val: any): string {
  if (val === null || val === undefined || val === '') {
    return new Date().toISOString().substring(0, 10);
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().substring(0, 10);
  }
  if (typeof val === 'number') {
    // Excel date serial number (e.g. 46096 -> 2026-03-15)
    // Excel epoch begins Dec 30 1899 due to 1900 leap year bug
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      return date.toISOString().substring(0, 10);
    }
  }
  const str = String(val).trim();
  // Check ISO format YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Try JS date parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1990 && parsed.getFullYear() < 2100) {
    return parsed.toISOString().substring(0, 10);
  }
  return new Date().toISOString().substring(0, 10);
}

/**
 * Inspects all sheets of an uploaded Excel workbook, validates compliance with the official template,
 * and extracts sales and inventory data.
 */
export function validateAndParseWorkbook(workbook: XLSX.WorkBook): WorkbookValidationResult {
  const sheetAnalyses: SheetAnalysis[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    // sheet_to_json with defval to avoid sparse rows
    const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (rawRows.length === 0) {
      sheetAnalyses.push({
        sheetName,
        rowCount: 0,
        columns: [],
        type: 'invalid',
        matchedSalesFields: [],
        missingSalesFields: REQUIRED_TEMPLATE_SALES_FIELDS.map(f => f.key),
        rawRows: []
      });
      continue;
    }

    const cols = Object.keys(rawRows[0] || {});
    const cleanCols = cols.map(c => c.toLowerCase().trim().replace(/[^a-z0-9]/g, ''));

    // 1. Check if this is an instruction sheet
    if (
      sheetName.toLowerCase().includes('read me') ||
      sheetName.toLowerCase().includes('instruction') ||
      (cols.length <= 2 && cols.some(c => c.toLowerCase().includes('template') || c.toLowerCase().includes('guide')))
    ) {
      sheetAnalyses.push({
        sheetName,
        rowCount: rawRows.length,
        columns: cols,
        type: 'instructions',
        matchedSalesFields: [],
        missingSalesFields: REQUIRED_TEMPLATE_SALES_FIELDS.map(f => f.key),
        rawRows
      });
      continue;
    }

    // 2. Check if this is an Inventory sheet
    const hasInvPid = cleanCols.some(c => INVENTORY_FIELDS.product_id.some(a => c === a.replace(/[^a-z0-9]/g, '')));
    const hasInvStock = cleanCols.some(c => INVENTORY_FIELDS.current_stock.some(a => c === a.replace(/[^a-z0-9]/g, '')));
    const isInvNamed = sheetName.toLowerCase().includes('inventory') || sheetName.toLowerCase().includes('stock');

    if (hasInvPid && hasInvStock) {
      sheetAnalyses.push({
        sheetName,
        rowCount: rawRows.length,
        columns: cols,
        type: 'inventory',
        matchedSalesFields: [],
        missingSalesFields: [],
        rawRows
      });
      continue;
    }

    // 3. Check for Sales Template fields
    const matchedFields: string[] = [];
    const missingFields: string[] = [];

    REQUIRED_TEMPLATE_SALES_FIELDS.forEach(req => {
      const match = cleanCols.some(c => req.aliases.some(a => c === a.replace(/[^a-z0-9]/g, '')));
      if (match) {
        matchedFields.push(req.key);
      } else {
        missingFields.push(req.key);
      }
    });

    // Check critical business fields
    const hasCriticalBusiness = CRITICAL_BUSINESS_FIELDS.filter(f => matchedFields.includes(f));

    if (hasCriticalBusiness.length >= 3 || (matchedFields.length >= 4 && (matchedFields.includes('quantity') || matchedFields.includes('list_price')))) {
      sheetAnalyses.push({
        sheetName,
        rowCount: rawRows.length,
        columns: cols,
        type: 'sales',
        matchedSalesFields: matchedFields,
        missingSalesFields: missingFields,
        rawRows
      });
    } else {
      sheetAnalyses.push({
        sheetName,
        rowCount: rawRows.length,
        columns: cols,
        type: isInvNamed ? 'inventory' : 'invalid',
        matchedSalesFields: matchedFields,
        missingSalesFields: missingFields,
        rawRows
      });
    }
  }

  // Determine active sales sheet
  // Prefer a sheet named 'Sales' if valid and has rows, otherwise 'Example' or first valid sales sheet
  const validSalesSheets = sheetAnalyses.filter(s => s.type === 'sales' && s.rowCount > 0);

  let activeSales: SheetAnalysis | null = null;
  if (validSalesSheets.length > 0) {
    activeSales =
      validSalesSheets.find(s => s.sheetName.toLowerCase() === 'sales') ||
      validSalesSheets.find(s => s.sheetName.toLowerCase() === 'example') ||
      validSalesSheets[0];
  }

  // Determine active inventory sheet
  const validInvSheets = sheetAnalyses.filter(s => s.type === 'inventory' && s.rowCount > 0);
  const activeInventory = validInvSheets.length > 0 ? validInvSheets[0] : null;

  if (!activeSales) {
    const inspectedSheetNames = workbook.SheetNames.join(', ');
    return {
      isValid: false,
      sheets: sheetAnalyses,
      activeSalesSheet: null,
      activeInventorySheet: activeInventory,
      errorMessage: `Invalid Template Format: Could not find a valid sales sheet matching the template in workbook [${inspectedSheetNames}]. To avoid calculation errors, the uploaded file must contain the required columns (order_id, order_date, product_id, product_name, category, quantity, list_price, discount_rate, unit_cost). Please use the official downloadable template.`
    };
  }

  return {
    isValid: true,
    sheets: sheetAnalyses,
    activeSalesSheet: activeSales,
    activeInventorySheet: activeInventory
  };
}

/**
 * Transforms validated raw sheet rows into strictly typed SalesRow[].
 * Does NOT generate fake placeholder data for non-business files.
 */
export function parseValidatedSalesSheet(sheet: SheetAnalysis): { sales: SalesRow[]; error?: string } {
  const { rawRows, columns } = sheet;
  if (rawRows.length === 0) {
    return { sales: [], error: 'Selected sheet contains no rows.' };
  }

  // Find column name mapping
  const findCol = (aliases: string[]) => {
    return columns.find(c => {
      const clean = c.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      return aliases.some(a => clean === a.replace(/[^a-z0-9]/g, ''));
    });
  };

  const colOid = findCol(['order_id', 'orderid', 'order_number', 'order_no', 'invoice_no', 'invoiceno', 'invoice_id']);
  const colDate = findCol(['order_date', 'orderdate', 'date', 'transaction_date', 'invoice_date', 'sale_date']);
  const colPid = findCol(['product_id', 'productid', 'sku', 'item_code', 'item_id']);
  const colPname = findCol(['product_name', 'productname', 'item_name', 'product', 'title', 'item', 'description']);
  const colCat = findCol(['category', 'product_category', 'dept', 'department', 'type', 'group']);
  const colQty = findCol(['quantity', 'qty', 'units', 'volume', 'count']);
  const colPrice = findCol(['list_price', 'price', 'unit_price', 'selling_price', 'item_price']);
  const colDisc = findCol(['discount_rate', 'discount', 'disc', 'discount_pct', 'disc_rate']);
  const colCost = findCol(['unit_cost', 'cost', 'cogs', 'cost_price', 'buy_price']);

  // Strict check: must have at least product and quantity and price
  if (!colQty || (!colPrice && !colCost) || (!colPid && !colPname)) {
    return {
      sales: [],
      error: `Missing required business fields in sheet "${sheet.sheetName}". Required: product, quantity, and price/cost.`
    };
  }

  const result: SalesRow[] = [];

  rawRows.forEach((row, idx) => {
    // Product identifier
    const rawPid = colPid ? row[colPid] : null;
    const rawPname = colPname ? row[colPname] : null;

    const product_id = rawPid != null && String(rawPid).trim() !== ''
      ? String(rawPid).trim()
      : rawPname ? String(rawPname).trim().slice(0, 12) : '';

    const product_name = rawPname != null && String(rawPname).trim() !== ''
      ? String(rawPname).trim()
      : product_id;

    if (!product_name && !product_id) return; // Skip empty rows

    // Quantity
    const qtyNum = parseFloat(String(colQty ? row[colQty] : 1).replace(/[^0-9.-]/g, ''));
    const quantity = !isNaN(qtyNum) && qtyNum > 0 ? Math.floor(qtyNum) : 1;

    // Price
    const priceNum = parseFloat(String(colPrice ? row[colPrice] : 0).replace(/[^0-9.-]/g, ''));
    const list_price = !isNaN(priceNum) && priceNum >= 0 ? priceNum : 0;

    // Discount rate
    let discount_rate = 0;
    if (colDisc) {
      const discVal = parseFloat(String(row[colDisc]).replace(/[^0-9.-]/g, ''));
      if (!isNaN(discVal)) {
        // If entered as 10 or 15 instead of 0.10, convert
        discount_rate = discVal > 1 && discVal <= 100 ? discVal / 100 : Math.max(0, Math.min(1, discVal));
      }
    }

    // Unit cost
    let unit_cost = 0;
    if (colCost) {
      const costVal = parseFloat(String(row[colCost]).replace(/[^0-9.-]/g, ''));
      if (!isNaN(costVal) && costVal >= 0) {
        unit_cost = costVal;
      }
    }
    if (unit_cost === 0 && list_price > 0) {
      // Default standard 40% margin cost if unit_cost was omitted
      unit_cost = +(list_price * 0.6).toFixed(2);
    }

    // Order ID
    const rawOid = colOid ? row[colOid] : null;
    const order_id = rawOid != null && String(rawOid).trim() !== ''
      ? String(rawOid).trim()
      : `ORD-${String(idx + 1).padStart(5, '0')}`;

    // Order Date
    const rawDate = colDate ? row[colDate] : null;
    const order_date = normalizeExcelDate(rawDate);

    // Category
    const rawCat = colCat ? row[colCat] : null;
    const category = rawCat != null && String(rawCat).trim() !== '' ? String(rawCat).trim() : 'General';

    result.push({
      order_id,
      order_date,
      product_id,
      product_name,
      category,
      quantity,
      list_price,
      discount_rate,
      unit_cost
    });
  });

  if (result.length === 0) {
    return { sales: [], error: `Sheet "${sheet.sheetName}" contains rows, but none had valid sales products.` };
  }

  return { sales: result };
}

/**
 * Parses raw inventory sheet rows into InventoryRow[].
 */
export function parseValidatedInventorySheet(sheet: SheetAnalysis, validPids: string[]): InventoryRow[] {
  const { rawRows, columns } = sheet;
  if (rawRows.length === 0) return [];

  const findCol = (aliases: string[]) => {
    return columns.find(c => {
      const clean = c.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      return aliases.some(a => clean === a.replace(/[^a-z0-9]/g, ''));
    });
  };

  const colPid = findCol(INVENTORY_FIELDS.product_id);
  const colStock = findCol(INVENTORY_FIELDS.current_stock);
  const colLead = findCol(INVENTORY_FIELDS.lead_time_days);

  if (!colPid || !colStock) return [];

  const result: InventoryRow[] = [];
  rawRows.forEach(row => {
    const rawPid = row[colPid];
    if (rawPid == null || String(rawPid).trim() === '') return;
    const pid = String(rawPid).trim();

    const stockVal = parseFloat(String(row[colStock]).replace(/[^0-9.-]/g, ''));
    const current_stock = !isNaN(stockVal) && stockVal >= 0 ? Math.floor(stockVal) : 0;

    const leadVal = colLead ? parseFloat(String(row[colLead]).replace(/[^0-9.-]/g, '')) : 14;
    const lead_time_days = !isNaN(leadVal) && leadVal >= 0 ? Math.floor(leadVal) : 14;

    result.push({
      product_id: pid,
      current_stock,
      lead_time_days
    });
  });

  return result;
}

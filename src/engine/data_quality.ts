import { SalesRow, QualityReport, QualityIssue } from '../types';

export const REQUIRED_COLUMNS = [
  'order_id',
  'order_date',
  'product_id',
  'product_name',
  'category',
  'quantity',
  'list_price',
  'discount_rate',
  'unit_cost'
];

export const ERROR_IF_MISSING = [
  'order_id',
  'order_date',
  'product_id',
  'quantity',
  'list_price',
  'discount_rate',
  'unit_cost'
];

export const WARNING_IF_MISSING = ['product_name', 'category'];

export const IMPACT: Record<string, string> = {
  'Missing required columns': 'The analysis cannot run. Add the missing columns to the file.',
  'Missing value': 'A missing number means the row cannot be used in revenue or profit. We do not guess it. Totals will be understated if these rows are excluded.',
  'Missing label': 'The row still counts in totals, but it will appear under a blank name or category in product and category reports.',
  'Quantity not a whole number above 0': 'Zero, negative, or non-numeric quantities distort units, revenue and profit. (A negative quantity may be a return, which this model does not support.)',
  'List price not above 0': 'A zero or negative price gives zero or negative revenue and ruins margins.',
  'Discount rate outside 0 to 1': 'A discount above 100% creates negative revenue. Discounts may have been entered as 10 instead of 0.10.',
  'Unit cost not a number of 0 or more': 'Wrong costs change profit and margin directly.',
  'Invalid date': 'Rows with unreadable dates cannot be placed in a month, so trends are incomplete.',
  'Duplicate rows': 'If these are true duplicates, revenue and units are double counted. They may also be genuine repeat lines (e.g. the same item added twice), so review before removing.',
  'Unit cost above list price': 'Either the cost is wrong, or the product is sold at a loss even before discounts. Margins for this product would look very negative.',
  'Product ID with several names or categories': 'Product reports may split one product into several, or mix categories.',
  'Order ID with several dates': 'One order should have one date. Trends by date may be unreliable.'
};

export function checkDataQuality(rows: any[], columns: string[]): QualityReport {
  const missingCols = REQUIRED_COLUMNS.filter(c => !columns.includes(c));
  const errorIndices = new Set<number>();
  const issues: QualityIssue[] = [];

  if (missingCols.length > 0) {
    issues.push({
      check: 'Missing required columns',
      severity: 'ERROR',
      rows_affected: rows.length,
      example_row_numbers: '',
      impact: `${IMPACT['Missing required columns']} Missing: ${missingCols.join(', ')}`
    });
    return {
      n_rows: rows.length,
      n_error_rows: rows.length,
      missing_columns: missingCols,
      issues,
      error_indices: new Set(rows.map((_, i) => i)),
      ok_to_proceed: false
    };
  }

  // Tracking maps for multi-row consistency
  const productMeta = new Map<string, { names: Set<string>; categories: Set<string> }>();
  const orderDates = new Map<string, Set<string>>();
  const rowHashCount = new Map<string, number[]>();

  // Temporary issue buckets
  const issueMasks: Record<string, { severity: 'ERROR' | 'WARNING'; rows: number[] }> = {};

  const recordIssue = (check: string, severity: 'ERROR' | 'WARNING', rowIndex: number) => {
    if (!issueMasks[check]) {
      issueMasks[check] = { severity, rows: [] };
    }
    issueMasks[check].rows.push(rowIndex);
    if (severity === 'ERROR') {
      errorIndices.add(rowIndex);
    }
  };

  rows.forEach((row, i) => {
    // 1. Missing values
    for (const col of ERROR_IF_MISSING) {
      const val = row[col];
      if (val === undefined || val === null || String(val).trim() === '') {
        recordIssue(`Missing value: ${col}`, 'ERROR', i);
      }
    }
    for (const col of WARNING_IF_MISSING) {
      const val = row[col];
      if (val === undefined || val === null || String(val).trim() === '') {
        recordIssue(`Missing label: ${col}`, 'WARNING', i);
      }
    }

    // 2. Numeric and Date Parsing
    const rawQty = row.quantity;
    const qty = Number(rawQty);
    if (rawQty !== undefined && rawQty !== null && String(rawQty).trim() !== '') {
      if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
        recordIssue('Quantity not a whole number above 0', 'ERROR', i);
      }
    }

    const rawPrice = row.list_price;
    const price = Number(rawPrice);
    if (rawPrice !== undefined && rawPrice !== null && String(rawPrice).trim() !== '') {
      if (isNaN(price) || price <= 0) {
        recordIssue('List price not above 0', 'ERROR', i);
      }
    }

    const rawDisc = row.discount_rate;
    const disc = Number(rawDisc);
    if (rawDisc !== undefined && rawDisc !== null && String(rawDisc).trim() !== '') {
      if (isNaN(disc) || disc < 0 || disc > 1) {
        recordIssue('Discount rate outside 0 to 1', 'ERROR', i);
      }
    }

    const rawCost = row.unit_cost;
    const cost = Number(rawCost);
    if (rawCost !== undefined && rawCost !== null && String(rawCost).trim() !== '') {
      if (isNaN(cost) || cost < 0) {
        recordIssue('Unit cost not a number of 0 or more', 'ERROR', i);
      }
    }

    const rawDate = row.order_date;
    if (rawDate !== undefined && rawDate !== null && String(rawDate).trim() !== '') {
      const dStr = String(rawDate).trim();
      const parsedDate = new Date(dStr);
      // Ensure valid format YYYY-MM-DD
      const isFormatOk = /^\d{4}-\d{2}-\d{2}$/.test(dStr);
      if (isNaN(parsedDate.getTime()) || !isFormatOk) {
        recordIssue('Invalid date', 'ERROR', i);
      }
    }

    // Cost > Price warning
    if (!isNaN(price) && !isNaN(cost) && price > 0 && cost > price) {
      recordIssue('Unit cost above list price', 'WARNING', i);
    }

    // Row hashing for duplicates
    const rowHash = REQUIRED_COLUMNS.map(c => String(row[c] ?? '')).join('|');
    if (!rowHashCount.has(rowHash)) {
      rowHashCount.set(rowHash, []);
    }
    rowHashCount.get(rowHash)!.push(i);

    // Consistency tracking
    const pid = String(row.product_id ?? '').trim();
    if (pid) {
      if (!productMeta.has(pid)) {
        productMeta.set(pid, { names: new Set(), categories: new Set() });
      }
      const pEntry = productMeta.get(pid)!;
      const pname = String(row.product_name ?? '').trim();
      const cat = String(row.category ?? '').trim();
      if (pname) pEntry.names.add(pname);
      if (cat) pEntry.categories.add(cat);
    }

    const oid = String(row.order_id ?? '').trim();
    const oDate = String(row.order_date ?? '').trim();
    if (oid && oDate) {
      if (!orderDates.has(oid)) {
        orderDates.set(oid, new Set());
      }
      orderDates.get(oid)!.add(oDate);
    }
  });

  // Duplicates check
  for (const indices of rowHashCount.values()) {
    if (indices.length > 1) {
      for (let j = 1; j < indices.length; j++) {
        recordIssue('Duplicate rows', 'WARNING', indices[j]);
      }
    }
  }

  // Consistency checks
  const inconsistentProducts = new Set<string>();
  for (const [pid, meta] of productMeta.entries()) {
    if (meta.names.size > 1 || meta.categories.size > 1) {
      inconsistentProducts.add(pid);
    }
  }
  if (inconsistentProducts.size > 0) {
    rows.forEach((r, idx) => {
      const pid = String(r.product_id ?? '').trim();
      if (inconsistentProducts.has(pid)) {
        recordIssue('Product ID with several names or categories', 'WARNING', idx);
      }
    });
  }

  const multiDateOrders = new Set<string>();
  for (const [oid, dates] of orderDates.entries()) {
    if (dates.size > 1) {
      multiDateOrders.add(oid);
    }
  }
  if (multiDateOrders.size > 0) {
    rows.forEach((r, idx) => {
      const oid = String(r.order_id ?? '').trim();
      if (multiDateOrders.has(oid)) {
        recordIssue('Order ID with several dates', 'WARNING', idx);
      }
    });
  }

  // Construct issues array
  for (const [check, data] of Object.entries(issueMasks)) {
    const rowNumbers = data.rows.slice(0, 5).map(idx => idx + 2).join(', ');
    const checkKey = check.split(':')[0];
    issues.push({
      check,
      severity: data.severity,
      rows_affected: data.rows.length,
      example_row_numbers: rowNumbers,
      impact: IMPACT[checkKey] || ''
    });
  }

  return {
    n_rows: rows.length,
    n_error_rows: errorIndices.size,
    missing_columns: [],
    issues,
    error_indices: errorIndices,
    ok_to_proceed: true
  };
}

export function splitValidRows(rows: any[], report: QualityReport): { valid: SalesRow[]; excluded: any[] } {
  const valid: SalesRow[] = [];
  const excluded: any[] = [];

  rows.forEach((row, i) => {
    if (report.error_indices.has(i)) {
      excluded.push(row);
    } else {
      valid.push({
        order_id: String(row.order_id).trim(),
        order_date: String(row.order_date).trim(),
        product_id: String(row.product_id).trim(),
        product_name: String(row.product_name || '').trim(),
        category: String(row.category || '').trim(),
        quantity: Math.floor(Number(row.quantity)),
        list_price: Number(row.list_price),
        discount_rate: Number(row.discount_rate),
        unit_cost: Number(row.unit_cost)
      });
    }
  });

  return { valid, excluded };
}

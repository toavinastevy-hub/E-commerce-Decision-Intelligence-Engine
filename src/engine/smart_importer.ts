import { SalesRow } from '../types';

export interface ColumnMapping {
  order_id?: string;
  order_date?: string;
  product_id?: string;
  product_name?: string;
  category?: string;
  quantity?: string;
  list_price?: string;
  discount_rate?: string;
  unit_cost?: string;
  total_amount?: string;
}

const CANDIDATES: Record<keyof ColumnMapping, string[]> = {
  order_id: ['order_id', 'orderid', 'order_number', 'order_no', 'invoice_no', 'invoiceno', 'invoice_id', 'transaction_id', 'tx_id', 'id', 'order#', 'order'],
  order_date: ['order_date', 'orderdate', 'date', 'transaction_date', 'invoice_date', 'created_at', 'timestamp', 'sale_date', 'datetime', 'time'],
  product_id: ['product_id', 'productid', 'sku', 'item_code', 'item_id', 'prod_id', 'code', 'asin', 'part_number'],
  product_name: ['product_name', 'productname', 'item_name', 'product', 'title', 'item', 'description', 'name', 'product_title'],
  category: ['category', 'product_category', 'dept', 'department', 'type', 'group', 'category_name', 'collection'],
  quantity: ['quantity', 'qty', 'units', 'volume', 'count', 'items', 'amount_sold', 'pieces'],
  list_price: ['list_price', 'price', 'unit_price', 'selling_price', 'item_price', 'rate', 'msrp', 'sales_price'],
  discount_rate: ['discount_rate', 'discount', 'disc', 'discount_pct', 'discount_%', 'disc_rate', 'rebate'],
  unit_cost: ['unit_cost', 'cost', 'cogs', 'cost_price', 'buy_price', 'purchase_price', 'item_cost'],
  total_amount: ['total_amount', 'total', 'net_revenue', 'revenue', 'sales', 'gross_sales', 'subtotal', 'line_total', 'amount']
};

/**
 * Automatically inspects headers from any table and suggests the best column mapping.
 */
export function autoDetectMapping(columns: string[]): ColumnMapping {
  const normalizedCols = columns.map(c => ({
    original: c,
    clean: c.toLowerCase().replace(/[^a-z0-9]/g, '')
  }));

  const mapping: ColumnMapping = {};
  const usedCols = new Set<string>();

  for (const [targetKey, synonyms] of Object.entries(CANDIDATES)) {
    const key = targetKey as keyof ColumnMapping;
    // Look for exact or strong match
    let found = normalizedCols.find(
      c => !usedCols.has(c.original) && synonyms.some(syn => c.clean === syn.replace(/[^a-z0-9]/g, ''))
    );

    // If not found, look for partial inclusion
    if (!found) {
      found = normalizedCols.find(
        c => !usedCols.has(c.original) && synonyms.some(syn => c.clean.includes(syn.replace(/[^a-z0-9]/g, '')))
      );
    }

    if (found) {
      mapping[key] = found.original;
      usedCols.add(found.original);
    }
  }

  return mapping;
}

/**
 * Transforms arbitrary raw rows into clean, typed SalesRow[] using the mapping.
 */
export function transformToSalesRows(rawRows: any[], mapping: ColumnMapping): SalesRow[] {
  const result: SalesRow[] = [];
  const today = new Date().toISOString().substring(0, 10);

  rawRows.forEach((row, idx) => {
    // 1. Order ID
    const rawOid = mapping.order_id ? row[mapping.order_id] : null;
    const order_id = rawOid !== null && rawOid !== undefined && String(rawOid).trim() !== ''
      ? String(rawOid).trim()
      : `ORD-${String(idx + 1).padStart(5, '0')}`;

    // 2. Order Date
    let order_date = today;
    const rawDate = mapping.order_date ? row[mapping.order_date] : null;
    if (rawDate) {
      order_date = normalizeDate(rawDate);
    }

    // 3. Product Name & Product ID
    const rawName = mapping.product_name ? row[mapping.product_name] : null;
    const rawPid = mapping.product_id ? row[mapping.product_id] : null;
    
    let product_name = rawName ? String(rawName).trim() : '';
    let product_id = rawPid ? String(rawPid).trim() : '';

    if (!product_name && !product_id) {
      product_name = `Product Item ${idx + 1}`;
      product_id = `PRD-${idx + 1}`;
    } else if (!product_name) {
      product_name = `Product (${product_id})`;
    } else if (!product_id) {
      product_id = product_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 12) || `P-${idx + 1}`;
    }

    // 4. Category
    const rawCat = mapping.category ? row[mapping.category] : null;
    const category = rawCat && String(rawCat).trim() !== '' ? String(rawCat).trim() : 'General';

    // 5. Quantity
    const rawQty = mapping.quantity ? row[mapping.quantity] : null;
    let quantity = Math.floor(parseNumeric(rawQty));
    if (isNaN(quantity) || quantity <= 0) {
      quantity = 1;
    }

    // 6. Pricing & Revenue
    const rawPrice = mapping.list_price ? row[mapping.list_price] : null;
    const rawTotal = mapping.total_amount ? row[mapping.total_amount] : null;
    let list_price = parseNumeric(rawPrice);

    if (isNaN(list_price) || list_price <= 0) {
      const total = parseNumeric(rawTotal);
      if (!isNaN(total) && total > 0) {
        list_price = total / quantity;
      } else {
        list_price = 49.99; // Fallback sensible base price
      }
    }

    // 7. Discount Rate
    const rawDisc = mapping.discount_rate ? row[mapping.discount_rate] : null;
    let discount_rate = parseNumeric(rawDisc);
    if (isNaN(discount_rate) || discount_rate < 0) {
      discount_rate = 0;
    } else if (discount_rate > 1 && discount_rate <= 100) {
      discount_rate = discount_rate / 100; // e.g. 15 -> 0.15
    } else if (discount_rate > 100) {
      discount_rate = 0.10;
    }

    // 8. Cost
    const rawCost = mapping.unit_cost ? row[mapping.unit_cost] : null;
    let unit_cost = parseNumeric(rawCost);
    if (isNaN(unit_cost) || unit_cost < 0) {
      // Default to 60% of list price (40% margin) if not provided
      unit_cost = +(list_price * 0.60).toFixed(2);
    }

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

  return result;
}

function parseNumeric(val: any): number {
  if (val === null || val === undefined) return NaN;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned);
}

function normalizeDate(val: any): string {
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().substring(0, 10);
  }
  // If Excel serial number (e.g. 45000)
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    return date.toISOString().substring(0, 10);
  }
  const str = String(val).trim();
  // Check if already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  // Try JS date parse
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().substring(0, 10);
  }
  return new Date().toISOString().substring(0, 10);
}

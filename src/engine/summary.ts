import { SalesRow, InventoryAnalysisResult, KeyFinding, Recommendation } from '../types';
import { summaryKpis, kpisByCategory, kpisByProduct, kpisByMonth } from './kpis';
import { segmentProducts } from './segmentation';
import { discountEffectiveness } from './discounts';
import { STOCKOUT, REORDER, EXCESS } from './inventory';
import { money, safeDivide, plain } from './helpers';

function formatMonth(dateStr: string): string {
  // e.g. "2025-03" -> "Mar 2025"
  const [year, month] = dateStr.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mIdx = parseInt(month, 10) - 1;
  return `${monthNames[mIdx] || month} ${year}`;
}

export function keyFindings(df: SalesRow[], inventoryResult: InventoryAnalysisResult | null = null): KeyFinding[] {
  const s = summaryKpis(df);
  const out: KeyFinding[] = [];

  let minDate = df[0].order_date;
  let maxDate = df[0].order_date;
  for (const r of df) {
    if (r.order_date < minDate) minDate = r.order_date;
    if (r.order_date > maxDate) maxDate = r.order_date;
  }

  // 1. Performance
  out.push({
    headline: `Performance, ${formatMonth(minDate.substring(0, 7))} to ${formatMonth(maxDate.substring(0, 7))}`,
    detail: `Net revenue ${money(s.net_revenue)} and gross profit ${money(s.gross_profit)} (gross margin ${(s.gross_margin_pct * 100).toFixed(1)}%) from ${s.orders.toLocaleString('en-US')} orders. Gross profit is before fixed costs, shipping, marketing and tax.`
  });

  // 2. Growth
  const monthly = kpisByMonth(df);
  if (monthly.length >= 18) {
    const recent6 = monthly.slice(-6);
    const prior6 = monthly.slice(-18, -12);

    const recRev = recent6.reduce((acc, m) => acc + m.net_revenue, 0);
    const priorRev = prior6.reduce((acc, m) => acc + m.net_revenue, 0);
    const recGp = recent6.reduce((acc, m) => acc + m.gross_profit, 0);
    const priorGp = prior6.reduce((acc, m) => acc + m.gross_profit, 0);

    const rChg = safeDivide(recRev - priorRev, priorRev);
    const gChg = safeDivide(recGp - priorGp, priorGp);

    const rSign = rChg >= 0 ? '+' : '';
    const gSign = gChg >= 0 ? '+' : '';

    out.push({
      headline: 'Growth: latest 6 months against the same months a year earlier',
      detail: `Net revenue ${rSign}${(rChg * 100).toFixed(1)}% (${money(priorRev)} to ${money(recRev)}) and gross profit ${gSign}${(gChg * 100).toFixed(1)}% (${money(priorGp)} to ${money(recGp)}). Compared: ${recent6[0].month} to ${recent6[recent6.length - 1].month} against ${prior6[0].month} to ${prior6[prior6.length - 1].month}. The latest month may be incomplete.`
    });
  } else {
    out.push({
      headline: 'Growth: not enough history',
      detail: `The data covers ${monthly.length} months; a year-on-year comparison needs at least 18.`
    });
  }

  // 3. Categories
  const cats = kpisByCategory(df);
  if (cats.length >= 1) {
    const top = cats[0];
    const sortedByMargin = [...cats].sort((a, b) => a.gross_margin_pct - b.gross_margin_pct);
    const lo = sortedByMargin[0];
    const hi = sortedByMargin[sortedByMargin.length - 1];

    let txt = `${top.category} is the largest category with ${((top.net_revenue / s.net_revenue) * 100).toFixed(1)}% of net revenue.`;
    if (cats.length > 1) {
      txt += ` Highest margin: ${hi.category} (${(hi.gross_margin_pct * 100).toFixed(1)}%); lowest margin: ${lo.category} (${(lo.gross_margin_pct * 100).toFixed(1)}%).`;
    }
    out.push({ headline: 'Categories', detail: txt.trim() });
  }

  // 4. Concentration of profit
  const prods = kpisByProduct(df).sort((a, b) => b.gross_profit - a.gross_profit);
  let cum = 0;
  let nHalf = 0;
  for (let i = 0; i < prods.length; i++) {
    cum += prods[i].gross_profit;
    if (cum < s.gross_profit * 0.5) {
      nHalf = i + 1;
    }
  }
  nHalf += 1;

  let lead = '';
  if (prods.length > 3) {
    const top3 = prods.slice(0, 3);
    const top3Gp = top3.reduce((acc, p) => acc + p.gross_profit, 0);
    const top3Names = top3.map(p => p.product_name).join(', ');
    lead = `The top 3 products (${top3Names}) earn ${((top3Gp / s.gross_profit) * 100).toFixed(1)}% of gross profit.`;
  } else if (prods.length > 0) {
    lead = `${prods[0].product_name} alone earns ${((prods[0].gross_profit / s.gross_profit) * 100).toFixed(1)}% of gross profit.`;
  }
  out.push({
    headline: 'Concentration of profit',
    detail: `${lead} ${nHalf} of ${prods.length} products make up half of it.`
  });

  // 5. Discounts
  const dis = discountEffectiveness(df);
  const bad = dis.filter(d => d.verdict === 'Discounts reduce profit').length;
  const good = dis.filter(d => d.verdict === 'Discounts pay off').length;
  out.push({
    headline: 'Discounts',
    detail: `${money(s.discount_amount)} was given as discounts, ${((s.discount_amount / s.gross_sales) * 100).toFixed(1)}% of gross sales. Of ${dis.length} products, ${bad} earned less gross profit in discounted months and ${good} earned more (a link in past data, not proof of cause).`
  });

  // 6. Margin pressure
  const seg = segmentProducts(df);
  const thin = seg.filter(r => r.flags.includes('Price/cost review')).sort((a, b) => b.net_revenue - a.net_revenue);
  if (thin.length > 0) {
    const thinRevShare = thin.reduce((acc, r) => acc + r.revenue_share, 0);
    const names = thin.slice(0, 3).map(r => `${r.product_name} (${(r.gross_margin_pct * 100).toFixed(1)}%)`).join(', ');
    const more = thin.length > 3 ? ` and ${thin.length - 3} more` : '';
    out.push({
      headline: 'Margin pressure',
      detail: `${thin.length} products have a gross margin below 20%: ${names}${more}. Together they bring ${(thinRevShare * 100).toFixed(1)}% of net revenue.`
    });
  }

  // 7. Inventory
  if (inventoryResult) {
    const so = inventoryResult.rows.filter(r => r.status === STOCKOUT);
    const re = inventoryResult.rows.filter(r => r.status === REORDER);
    const ex = inventoryResult.rows.filter(r => r.status === EXCESS);

    const parts: string[] = [];
    if (so.length > 0) {
      const soNames = so.slice(0, 3).map(r => r.product_name).join(', ') + (so.length > 3 ? ` and ${so.length - 3} more` : '');
      parts.push(`${so.length} ${so.length === 1 ? 'product' : 'products'} may run out before new stock arrives (${soNames})`);
    }
    if (re.length > 0) {
      parts.push(`${re.length} ${re.length === 1 ? 'product is' : 'products are'} at the reorder point`);
    }
    if (ex.length > 0) {
      const exNames = ex.slice(0, 3).map(r => r.product_name).join(', ') + (ex.length > 3 ? ` and ${ex.length - 3} more` : '');
      const exCash = ex.reduce((acc, r) => acc + (r.excess_value || 0), 0);
      parts.push(`${ex.length} ${ex.length === 1 ? 'product holds' : 'products hold'} excess stock (${exNames}), about ${money(exCash)} at cost above the threshold`);
    }

    out.push({
      headline: 'Inventory',
      detail: parts.length > 0 ? parts.join('; ') + '.' : 'No stockout, reorder or excess alerts at the current assumptions.'
    });
  }

  return out;
}

export function executiveMarkdown(
  df: SalesRow[],
  findings: KeyFinding[],
  recs: Recommendation[],
  dataLabel = '',
  simulated = false,
  topActions = 5
): string {
  const s = summaryKpis(df);
  const lines: string[] = ['# Executive summary', ''];

  if (dataLabel) {
    lines.push(`Data: ${dataLabel}`);
  }
  if (simulated) {
    lines.push('', '**Important: this report uses SIMULATED data. It shows how the tool works; the numbers are not real.**');
  }

  lines.push(
    '',
    '## Headline numbers',
    '',
    '| Measure | Value |',
    '|---|---|',
    `| Net revenue | ${money(s.net_revenue)} |`,
    `| Gross profit | ${money(s.gross_profit)} |`,
    `| Gross margin | ${(s.gross_margin_pct * 100).toFixed(1)}% |`,
    `| Orders | ${s.orders.toLocaleString('en-US')} |`,
    `| Units sold | ${s.units_sold.toLocaleString('en-US')} |`,
    `| Average discount rate | ${(s.avg_discount_rate * 100).toFixed(1)}% |`,
    '',
    '## Key findings',
    ''
  );

  findings.forEach((f, i) => {
    lines.push(`${i + 1}. **${f.headline}.** ${f.detail}`);
  });

  const actionsCount = Math.min(topActions, recs.length);
  lines.push('', `## Top ${actionsCount} recommended actions`, '');

  recs.slice(0, actionsCount).forEach(r => {
    lines.push(
      `${r.rank}. **[${r.priority}] ${r.area}: ${r.subject}.** ${r.issue} Action: ${r.action} Benefit: ${r.expected_benefit}`
    );
  });

  lines.push(
    '',
    '## Limitations',
    '',
    '- Gross profit excludes fixed costs, shipping, marketing and tax.',
    '- Benefits are estimates from past data, not promises.',
    '- Discount results show a link between discounts and profit, not proof of cause.'
  );

  return lines.join('\n') + '\n';
}

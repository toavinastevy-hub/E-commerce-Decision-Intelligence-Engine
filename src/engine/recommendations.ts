import { SalesRow, InventoryAnalysisResult, Recommendation } from '../types';
import { summaryKpis } from './kpis';
import { segmentProducts, LOW } from './segmentation';
import { discountEffectiveness } from './discounts';
import { STOCKOUT, REORDER, EXCESS } from './inventory';
import { money } from './helpers';

function priorityFromShare(share: number): 'High' | 'Medium' | 'Low' {
  if (share >= 0.05) return 'High';
  if (share >= 0.01) return 'Medium';
  return 'Low';
}

function priceRiseToReachMargin(netPrice: number, unitCost: number, targetMargin: number): number {
  return unitCost / ((1 - targetMargin) * netPrice) - 1;
}

function costCutToReachMargin(netPrice: number, unitCost: number, targetMargin: number): number {
  return 1 - (netPrice * (1 - targetMargin)) / unitCost;
}

function formatNames(items: { name: string; detail: string }[], top = 3): string {
  const parts = items.slice(0, top).map(i => `${i.name} (${i.detail})`);
  const more = items.length - top;
  return parts.join(', ') + (more > 0 ? ` and ${more} more` : '');
}

export function generateRecommendations(
  df: SalesRow[],
  inventoryResult: InventoryAnalysisResult | null = null,
  excludedRows = 0,
  totalRows: number | null = null,
  simulatedInventory = false
): Recommendation[] {
  const kp = summaryKpis(df);
  const totalGp = kp.gross_profit;
  const totalRev = kp.net_revenue;
  const portMargin = kp.gross_margin_pct;

  const seg = segmentProducts(df);
  const segMap = new Map(seg.map(s => [s.product_id!, s]));

  const dis = discountEffectiveness(df);
  const disMap = new Map(dis.map(d => [d.product_id, d]));

  const recs: {
    priority: 'High' | 'Medium' | 'Low';
    area: string;
    subject: string;
    issue: string;
    evidence: string;
    action: string;
    expected_benefit: string;
    risks_assumptions: string;
    priority_reason: string;
    est_impact: number;
    isUrgent: boolean;
  }[] = [];

  const add = (
    priority: 'High' | 'Medium' | 'Low',
    area: string,
    subject: string,
    issue: string,
    evidence: string,
    action: string,
    benefit: string,
    risks: string,
    reason: string,
    impact = -1,
    isUrgent = false
  ) => {
    recs.push({
      priority,
      area,
      subject,
      issue,
      evidence,
      action,
      expected_benefit: benefit,
      risks_assumptions: risks,
      priority_reason: reason,
      est_impact: impact,
      isUrgent
    });
  };

  const simNote = simulatedInventory ? ' The inventory data is SIMULATED, so treat this as illustrative.' : '';

  // Track products at stock risk
  const risky = new Set<string>();
  if (inventoryResult) {
    for (const r of inventoryResult.rows) {
      if (r.status === STOCKOUT || r.status === REORDER) {
        risky.add(r.product_id);
      }
    }
  }

  // 1. Data Quality
  if (excludedRows > 0 && totalRows && totalRows > 0) {
    const share = excludedRows / totalRows;
    const pr: 'High' | 'Medium' | 'Low' = share >= 0.05 ? 'High' : share >= 0.01 ? 'Medium' : 'Low';
    add(
      pr,
      'Data quality',
      'Source data',
      'Some rows of the source data were rejected by the quality checks.',
      `${excludedRows.toLocaleString('en-US')} of ${totalRows.toLocaleString('en-US')} rows (${(share * 100).toFixed(1)}%) were excluded, so the results use less data than was uploaded.`,
      'Ask the data owner to fix the rejected rows at the source and upload the corrected file.',
      'More complete data makes every number in this report more reliable.',
      'The rows were excluded, not repaired; the excluded rows could differ from the rest in ways that matter.',
      `${(share * 100).toFixed(1)}% of rows excluded (5% or more = High, 1% to under 5% = Medium, otherwise Low).`
    );
  }

  // 2. Inventory: Stockout and Reorder
  if (inventoryResult) {
    const stockoutRows = inventoryResult.rows.filter(r => r.status === STOCKOUT);
    for (const r of stockoutRows) {
      const sProduct = segMap.get(r.product_id);
      const ugp = sProduct ? sProduct.unit_gp : 0;
      const shortfall = r.shortfall_during_lead_time || 0;
      const atRisk = shortfall * ugp;

      add(
        'High',
        'Inventory',
        `${r.product_name} (${r.product_id})`,
        'Stock is likely to run out before new stock can arrive.',
        `${Math.round(r.current_stock || 0).toLocaleString('en-US')} units cover ${(r.days_of_stock || 0).toFixed(1)} days, but the lead time is ${Math.round(r.lead_time_days || 0)} days. Average demand is ${(r.avg_daily_demand || 0).toFixed(1)} units per day; expected shortfall about ${Math.round(shortfall).toLocaleString('en-US')} units.`,
        `Order about ${Math.round(r.suggested_order_qty || 0).toLocaleString('en-US')} units now and ask the supplier about faster delivery. Until stock arrives, do not run promotions or discounts on this product.`,
        `Protects up to about ${money(atRisk)} of gross profit (${Math.round(shortfall).toLocaleString('en-US')} units x ${money(ugp)} per unit) that could otherwise be lost.`,
        'Assumes demand stays at its recent average and the lead time does not change. Check supplier minimum quantities and available cash.' + simNote,
        'Stock ends before an order placed today could arrive, so sales are likely to be lost within days.',
        atRisk,
        true
      );
    }

    const reorderRows = inventoryResult.rows.filter(r => r.status === REORDER);
    for (const r of reorderRows) {
      add(
        'Medium',
        'Inventory',
        `${r.product_name} (${r.product_id})`,
        'Stock has reached the reorder point.',
        `${Math.round(r.current_stock || 0).toLocaleString('en-US')} units are at or below the reorder point of ${Math.round(r.reorder_point || 0).toLocaleString('en-US')} (demand during the ${Math.round(r.lead_time_days || 0)}-day lead time plus safety stock). Stock covers ${(r.days_of_stock || 0).toFixed(1)} days.`,
        `Place an order of about ${Math.round(r.suggested_order_qty || 0).toLocaleString('en-US')} units.`,
        'Keeps stock above the demand expected during the lead time, which avoids lost sales.',
        'Assumes steady demand and a fixed lead time; safety stock uses only past demand variability.' + simNote,
        'Stock still covers the lead time, but it is at or below the reorder point, so the order should not wait.'
      );
    }
  }

  // 3. Thin Margin (Price/cost review)
  const thinProducts = seg.filter(s => s.flags.includes('Price/cost review'));
  for (const r of thinProducts) {
    const netP = r.units_sold > 0 ? r.net_revenue / r.units_sold : 0;
    const unitC = r.units_sold > 0 ? r.cogs / r.units_sold : 0;
    const gap = Math.max(0, portMargin - r.gross_margin_pct);
    const impact = gap * r.net_revenue;
    const share = totalGp > 0 ? impact / totalGp : 0;

    const priceRise = priceRiseToReachMargin(netP, unitC, portMargin);
    const costCut = costCutToReachMargin(netP, unitC, portMargin);

    add(
      priorityFromShare(share),
      'Pricing and cost',
      `${r.product_name} (${r.product_id})`,
      'The product sells in volume but earns a thin margin.',
      `Gross margin ${(r.gross_margin_pct * 100).toFixed(1)}% against ${(portMargin * 100).toFixed(1)}% for the whole portfolio; net revenue ${money(r.net_revenue)} (${(r.revenue_share * 100).toFixed(1)}% of total); average discount ${(r.avg_discount_rate * 100).toFixed(1)}%.`,
      `Review the price and the supplier cost. Reaching the portfolio margin would need about ${priceRise >= 0 ? '+' : ''}${(priceRise * 100).toFixed(0)}% on the net price, or about -${(costCut * 100).toFixed(0)}% on the unit cost. Test options in the Simulator.`,
      `If the margin reached the portfolio average at the same revenue, gross profit could rise by up to about ${money(impact)}.`,
      'A price rise may lose customers (the Simulator shows the volume you must keep). Cost cuts depend on suppliers. The estimate ignores volume changes.',
      `Estimated effect is ${(share * 100).toFixed(1)}% of total gross profit.`,
      impact
    );
  }

  // 4. Discounts that reduce profit
  const badDiscounts = dis
    .filter(d => d.verdict === 'Discounts reduce profit' && typeof d.gross_profit_change_pct === 'number' && d.gross_profit_change_pct < 0)
    .map(d => {
      const pFull = d.avg_gross_profit_full_price || 0;
      const gpChg = d.gross_profit_change_pct || 0;
      const loss = Math.abs(gpChg * pFull * d.months_discounted);
      return { ...d, loss };
    })
    .sort((a, b) => b.loss - a.loss);

  if (badDiscounts.length > 0) {
    const totalLoss = badDiscounts.reduce((acc, d) => acc + d.loss, 0);
    const share = totalGp > 0 ? totalLoss / totalGp : 0;
    const formattedBad = badDiscounts.map(d => ({
      name: d.product_name,
      detail: `${(((d.gross_profit_change_pct ?? 0)) * 100).toFixed(0)}% profit, discount ${((d.avg_discount_when_discounted || 0) * 100).toFixed(0)}%`
    }));

    add(
      priorityFromShare(share),
      'Discounts',
      `${badDiscounts.length} products`,
      'Discounts are reducing gross profit on these products.',
      `${badDiscounts.length} of ${dis.length} products earned less gross profit in discounted months than in full-price months. Largest: ${formatNames(formattedBad)}. Together about ${money(totalLoss)} less gross profit in the discounted months (${(share * 100).toFixed(1)}% of total gross profit).`,
      'Stop or sharply reduce discounts on these products, starting with the largest losses, and compare a full-price test period with the past. Do not use discounts to clear excess stock of these products.',
      `Could recover up to about ${money(totalLoss)} of gross profit if the same units sold at full price.`,
      'This compares past months and shows a link, not proof of cause. Volume could fall more than the past suggests; competitor prices are not considered.',
      `Estimated effect is ${(share * 100).toFixed(1)}% of total gross profit.`,
      totalLoss
    );
  }

  // 5. Discounts that pay off
  const goodDiscounts = dis
    .filter(d => d.verdict === 'Discounts pay off' && !risky.has(d.product_id) && d.gross_profit_change_pct !== null && d.gross_profit_change_pct !== undefined && d.gross_profit_change_pct > 0)
    .map(d => {
      const pFull = d.avg_gross_profit_full_price || 0;
      const gpChg = d.gross_profit_change_pct || 0;
      const gain = gpChg * pFull * d.months_discounted;
      return { ...d, gain };
    })
    .sort((a, b) => b.gain - a.gain);

  if (goodDiscounts.length > 0) {
    const totalGain = goodDiscounts.reduce((acc, d) => acc + d.gain, 0);
    const share = totalGp > 0 ? totalGain / totalGp : 0;
    const formattedGood = goodDiscounts.map(d => ({
      name: d.product_name,
      detail: `+${(((d.gross_profit_change_pct ?? 0)) * 100).toFixed(0)}% profit at about ${((d.avg_discount_when_discounted || 0) * 100).toFixed(0)}% discount`
    }));

    add(
      priorityFromShare(share),
      'Discounts',
      `${goodDiscounts.length} products`,
      'Discounts are paying off on these products; they are an opportunity.',
      `${goodDiscounts.length} products earned more gross profit in discounted months. Best: ${formatNames(formattedGood)}. The volume increase beat the break-even level.`,
      'Keep targeted discounts on these products in the range already used, and track units and gross profit for each campaign.',
      `Could keep up to about ${money(totalGain)} of extra gross profit seen in past discounted months (${(share * 100).toFixed(1)}% of total gross profit).`,
      'A link, not proof of cause. Larger discounts than those observed are untested. Check stock before each campaign.',
      `Estimated effect is ${(share * 100).toFixed(1)}% of total gross profit.`,
      totalGain
    );
  }

  // 6. Declining sales
  const decliningProducts = seg
    .filter(s => s.flags.includes('Declining sales'))
    .map(s => {
      const diff = s.units_prior_year - s.units_recent;
      const lost = diff > 0 ? diff * s.unit_gp : 0;
      return { ...s, lost };
    })
    .filter(s => s.lost > 0)
    .sort((a, b) => b.lost - a.lost);

  if (decliningProducts.length > 0) {
    const totalLost = decliningProducts.reduce((acc, s) => acc + s.lost, 0);
    const share = totalGp > 0 ? totalLost / totalGp : 0;
    const formattedDec = decliningProducts.map(s => ({
      name: s.product_name!,
      detail: `${((s.trend_pct || 0) * 100).toFixed(0)}% units`
    }));

    add(
      priorityFromShare(share),
      'Sales trend',
      `${decliningProducts.length} products`,
      'Unit sales of these products are falling compared with a year earlier.',
      `${decliningProducts.length} products sold at least 15% fewer units in the latest 6 months than in the same months a year earlier. Largest drops: ${formatNames(formattedDec)}.`,
      'Find the cause before changing price or discounts: stock availability, competitor prices, product listing, or seasonality. Do not reorder more stock until the cause is known.',
      `Returning to last year's level for the same 6 months would be worth about ${money(totalLost)} of gross profit (${(share * 100).toFixed(1)}% of the total).`,
      'The cause is unknown. A 6-month against 6-month comparison can reflect seasons or one-off events.',
      `Estimated effect is ${(share * 100).toFixed(1)}% of total gross profit.`,
      totalLost
    );
  }

  // 7. Excess Stock
  if (inventoryResult) {
    const excessRows = inventoryResult.rows
      .filter(r => r.status === EXCESS && (r.excess_value || 0) > 0)
      .sort((a, b) => (b.excess_value || 0) - (a.excess_value || 0));

    if (excessRows.length > 0) {
      const totalCash = excessRows.reduce((acc, r) => acc + (r.excess_value || 0), 0);
      const share = totalRev > 0 ? totalCash / totalRev : 0;
      const lines = excessRows.slice(0, 3).map(r => {
        const dVerdict = disMap.get(r.product_id)?.verdict;
        const hint =
          dVerdict === 'Discounts reduce profit'
            ? 'no discounts (they reduce profit here)'
            : dVerdict === 'Discounts pay off'
            ? 'a small targeted discount test is possible (discounts pay off here)'
            : 'discount effect is unclear';
        return `${r.product_name}: ${(r.days_of_stock || 0).toFixed(0)} days of stock, about ${money(r.excess_value)} above the threshold; ${hint}`;
      });

      add(
        share >= 0.01 ? 'Medium' : 'Low',
        'Inventory',
        `${excessRows.length} products`,
        'Stock is far above what is needed.',
        `${excessRows.length} products hold more stock than the excess threshold. About ${money(totalCash)} (at cost) is tied up above it, ${(share * 100).toFixed(1)}% of net revenue. ${lines.join('; ')}.`,
        'Pause reordering these products until days of stock fall below the threshold, and sell down slowly. Use discounts only where the discount analysis shows they pay off.',
        `Frees up to about ${money(totalCash)} of cash over time (not a profit gain).`,
        'Assumes demand stays at its recent level. Excess stock is not lost stock. Storage and supplier terms are not in the data.' + simNote,
        `Cash tied up is ${(share * 100).toFixed(1)}% of net revenue (1% or more = Medium, otherwise Low); excess stock is never High because it is not lost.`,
        totalCash
      );
    }
  }

  // 8. Low Performers
  const lowPerformers = seg.filter(s => s.segment === LOW).sort((a, b) => b.net_revenue - a.net_revenue);
  if (lowPerformers.length > 0) {
    const lowRev = lowPerformers.reduce((acc, s) => acc + s.net_revenue, 0);
    const lowGp = lowPerformers.reduce((acc, s) => acc + s.gross_profit, 0);
    const revShare = totalRev > 0 ? lowRev / totalRev : 0;
    const gpShare = totalGp > 0 ? lowGp / totalGp : 0;
    const formattedLow = lowPerformers.map(s => ({
      name: s.product_name!,
      detail: `${(s.gross_margin_pct * 100).toFixed(0)}% margin`
    }));

    add(
      'Low',
      'Product range',
      `${lowPerformers.length} products`,
      'Several products have low revenue and below-average margin.',
      `${lowPerformers.length} products are Low performers: together ${money(lowRev)} net revenue (${(revShare * 100).toFixed(1)}% of total) and ${money(lowGp)} gross profit (${(gpShare * 100).toFixed(1)}%). Largest: ${formatNames(formattedLow)}.`,
      'Review each one: reprice, reduce stock levels, or consider removing it from the range. Avoid new large orders meanwhile.',
      'Frees up money, storage and attention for products that earn more.',
      'Some may support sales of other products or be new; the data cannot show that.',
      'No reliable money estimate and a small share of profit, so Low.'
    );
  }

  // 9. Promotion Candidates
  const promoCandidates = seg.filter(s => s.flags.includes('Promotion candidate'));
  const promoKept = promoCandidates.filter(s => !risky.has(s.product_id!));
  const promoHeld = promoCandidates.filter(s => risky.has(s.product_id!));

  if (promoKept.length > 0) {
    const names = promoKept
      .map(r => `${r.product_name} (${(disMap.get(r.product_id!)?.verdict || 'n/a').toLowerCase()})`)
      .join(', ');
    const heldTxt = promoHeld.length > 0 ? ` Left out because of stock risk: ${promoHeld.map(r => r.product_name).join(', ')}.` : '';

    add(
      'Low',
      'Promotion',
      `${promoKept.length} products`,
      'Healthy-margin products with modest sales could grow with a promotion.',
      `Niche products with healthy margin and stable sales: ${names}.${heldTxt}`,
      'Try a small, time-limited promotion or better visibility on one or two of them, and track units and gross profit. Where discounts reduce profit, prefer non-price promotion such as featuring or bundling.',
      'May lift sales of products that already earn a healthy margin.',
      'No evidence yet that promotion works for these products. Check stock first.' + simNote,
      'No reliable money estimate, so Low.'
    );
  }

  // Sort by priority (High: 0, Medium: 1, Low: 2), then urgency (urgent first), then impact descending, then subject
  const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

  recs.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;

    const uDiff = (a.isUrgent ? 0 : 1) - (b.isUrgent ? 0 : 1);
    if (uDiff !== 0) return uDiff;

    const iDiff = b.est_impact - a.est_impact;
    if (iDiff !== 0) return iDiff;

    return a.subject.localeCompare(b.subject);
  });

  return recs.map((r, i) => ({
    rank: i + 1,
    priority: r.priority,
    area: r.area,
    subject: r.subject,
    issue: r.issue,
    evidence: r.evidence,
    action: r.action,
    expected_benefit: r.expected_benefit,
    risks_assumptions: r.risks_assumptions,
    priority_reason: r.priority_reason,
    est_impact: r.est_impact > 0 ? r.est_impact : undefined
  }));
}

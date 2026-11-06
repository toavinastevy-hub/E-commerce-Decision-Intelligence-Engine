export function money(x: number | null | undefined): string {
  if (x === null || x === undefined || isNaN(x)) return 'n/a';
  return `$${Math.round(x).toLocaleString('en-US')}`;
}

export function moneyExact(x: number | null | undefined): string {
  if (x === null || x === undefined || isNaN(x)) return 'n/a';
  return `$${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(x: number | null | undefined): string {
  if (x === null || x === undefined || isNaN(x)) return 'n/a';
  return `${(x * 100).toFixed(1)}%`;
}

export function pctSign(x: number | null | undefined): string {
  if (x === null || x === undefined || isNaN(x)) return 'n/a';
  const val = (x * 100).toFixed(1);
  return x > 0 ? `+${val}%` : `${val}%`;
}

export function num(x: number | null | undefined): string {
  if (x === null || x === undefined || isNaN(x)) return 'n/a';
  return Math.round(x).toLocaleString('en-US');
}

export function safeDivide(numerator: number, denominator: number): number {
  if (!denominator || isNaN(denominator) || denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

export const PLAIN_REPLACEMENTS: [string, string][] = [
  ["Gross profit is before fixed costs, shipping, marketing and tax.",
   "Profit before overheads means sales after discounts minus the cost of the products sold; rent, staff, shipping, advertising and tax are not included."],
  ["net revenue", "sales after discounts"],
  ["Net revenue", "Sales after discounts"],
  ["gross profit", "profit before overheads"],
  ["Gross profit", "Profit before overheads"],
  ["gross margin", "profit margin"],
  ["Gross margin", "Profit margin"],
  ["gross sales", "sales before discounts"],
  ["Gross sales", "Sales before discounts"],
  ["product cost", "product cost"],
  ["lead time", "delivery time"],
  ["Lead time", "Delivery time"],
  ["reorder point", "reorder level"],
  ["Reorder point", "Reorder level"],
  ["safety stock", "safety stock (extra buffer)"],
  ["Safety stock", "Safety stock (extra buffer)"],
  ["KPI", "key number"],
  ["units", "items"],
  ["sells in volume", "sells in large quantities"]
];

export function plain(text: string): string {
  if (!text) return text;
  let out = text;
  for (const [from, to] of PLAIN_REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  return out;
}

export const GLOSSARY_ITEMS = [
  {
    term: "Sales after discounts",
    definition: "Money received from customers after discounts are taken off."
  },
  {
    term: "Profit before overheads",
    definition: "Sales after discounts minus what the products cost you. Rent, staff, shipping, advertising and tax are NOT included, so your real final profit is lower."
  },
  {
    term: "Profit margin",
    definition: "How many cents of profit you keep from each $1 of sales, before overheads."
  },
  {
    term: "Delivery time",
    definition: "Days between placing an order with your supplier and receiving the goods."
  },
  {
    term: "Days of stock",
    definition: "How many days your stock lasts at the recent selling speed."
  },
  {
    term: "Reorder level",
    definition: "The stock level at which you should order more."
  },
  {
    term: "Safety stock",
    definition: "An extra buffer in case sales are higher than usual or delivery is delayed."
  },
  {
    term: "Break-even",
    definition: "The extra sales needed so a discount earns the same profit as full price."
  },
  {
    term: "Simulated data",
    definition: "Made-up data used for the demonstration. It is not a real business."
  }
];

export const HELP_TEXTS: Record<string, string> = {
  "Sales after discounts": "Money received from customers after discounts are taken off.",
  "Profit before overheads": "Sales after discounts minus what the products cost you. Rent, staff, shipping, advertising and tax are NOT included, so your real final profit is lower.",
  "Profit margin": "How many cents you keep from each $1 of sales, before overheads.",
  "Orders": "Number of separate customer orders.",
  "Items sold": "Total number of items sold.",
  "Average order size": "Average amount spent per order, after discounts.",
  "Discounts given": "Total money given away as discounts.",
  "Average discount": "Discounts as a share of sales before discounts."
};

export const EXPLAIN_TEXTS: Record<string, string> = {
  "Star": "Sells a lot AND keeps a good profit. Protect these products.",
  "Core volume": "Sells a lot and keeps a fair profit. The steady base of the business.",
  "Busy but thin": "Sells a lot but keeps very little profit per item. Check the price and the cost.",
  "Niche": "Sells less, but keeps a good profit per item. May grow with some promotion.",
  "Low performer": "Sells little and keeps little profit. Review whether to keep it.",
  "Discounts pay off": "Products that made MORE profit in discounted months than in full-price months.",
  "No clear gain from discounts": "Discounts did not clearly help or hurt.",
  "Discounts reduce profit": "Products that made LESS profit in discounted months. The extra sales did not make up for the lower price.",
  "Not enough data": "Too few months with and without discounts to compare fairly.",
  "Stockout risk": "Stock will run out before a new order could arrive. Act now.",
  "Reorder now": "Stock has reached the level where you should place an order.",
  "Excess stock": "Much more stock than you need. Money is tied up in the warehouse.",
  "OK": "Stock level looks healthy.",
  "High": "Do first.",
  "Medium": "Do soon.",
  "Low": "Do when you have time."
};

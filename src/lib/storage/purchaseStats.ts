import type { CatalogOption } from './suggest';
import type { Purchase } from '../types';

export interface SpendRow {
  key: string;
  total: number;
  count: number;
}

export interface PurchaseStats {
  total: number;
  byShop: SpendRow[];
  byCategory: SpendRow[]; // a product in two categories counts in both
  byProduct: SpendRow[];
  byMonth: { month: string; shops: Record<string, number> }[];
}

const NO_SHOP = '—';

function add(map: Map<string, SpendRow>, key: string, price: number) {
  const row = map.get(key) ?? { key, total: 0, count: 0 };
  row.total += price;
  row.count++;
  map.set(key, row);
}
const sorted = (map: Map<string, SpendRow>) => [...map.values()].sort((a, b) => b.total - a.total);

/** What was spent on recorded purchases (only those with a price) in a date range. */
export function purchaseStats(
  purchases: Purchase[],
  options: CatalogOption[],
  range: { from?: string; to?: string } = {},
): PurchaseStats {
  const byKey = new Map(options.map((o) => [o.productKey, o]));
  const shops = new Map<string, SpendRow>();
  const cats = new Map<string, SpendRow>();
  const products = new Map<string, SpendRow>();
  const months = new Map<string, Record<string, number>>();
  let total = 0;
  for (const p of purchases) {
    if (p.price === null || p.price === undefined) continue;
    if (range.from && p.date < range.from) continue;
    if (range.to && p.date > range.to) continue;
    const shop = p.shop?.trim() || NO_SHOP;
    const product = byKey.get(p.productKey);
    total += p.price;
    add(shops, shop, p.price);
    add(products, product?.name ?? p.name, p.price);
    for (const c of product?.categories.length ? product.categories : ['other']) add(cats, c, p.price);
    const month = p.date.slice(0, 7);
    const m = months.get(month) ?? {};
    m[shop] = (m[shop] ?? 0) + p.price;
    months.set(month, m);
  }
  return {
    total,
    byShop: sorted(shops),
    byCategory: sorted(cats),
    byProduct: sorted(products),
    byMonth: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, s]) => ({ month, shops: s })),
  };
}

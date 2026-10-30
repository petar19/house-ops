import { resolveProduct, type CatalogOption } from './suggest';
import type { Purchase, StorageItem } from '../types';

// One row of the Products page: a product with what's in storage of it now
// and its purchases, newest first.
export interface ProductSummary {
  option: CatalogOption;
  items: StorageItem[];
  purchases: Purchase[];
  last: Purchase | null; // most recent purchase
  lastPriced: Purchase | null; // most recent one with a comparable price
}

/**
 * Groups storage items (by whatever name they were stored under — any
 * spelling resolves to its product) and purchases by product. Products the
 * group hid or merged away are left out unless asked for.
 */
export function summarizeProducts(
  options: CatalogOption[],
  items: StorageItem[],
  purchases: Purchase[],
  { includeHidden = false }: { includeHidden?: boolean } = {},
): Map<string, ProductSummary> {
  const byKey = new Map<string, ProductSummary>();
  for (const option of options) {
    if (option.hidden && !includeHidden) continue;
    const existing = byKey.get(option.productKey);
    // The group's own version of a product wins over the built-in one.
    if (!existing || (existing.option.source === 'system' && option.source === 'group')) {
      byKey.set(option.productKey, { option, items: existing?.items ?? [], purchases: [], last: null, lastPriced: null });
    }
  }
  const resolved = new Map<string, string | null>();
  for (const item of items) {
    if (!resolved.has(item.nameKey)) resolved.set(item.nameKey, resolveProduct(item.name, options)?.productKey ?? item.nameKey);
    const key = resolved.get(item.nameKey)!;
    byKey.get(key)?.items.push(item);
  }
  for (const p of purchases) byKey.get(p.productKey)?.purchases.push(p);
  for (const summary of byKey.values()) {
    summary.purchases.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    summary.last = summary.purchases[0] ?? null;
    summary.lastPriced = summary.purchases.find((p) => p.unitPrice !== null) ?? null;
  }
  return byKey;
}

/** "In use": the group has stored it, bought it, or made it its own. */
export function inUse(s: ProductSummary): boolean {
  return s.items.length > 0 || s.purchases.length > 0 || s.option.source === 'group';
}

/**
 * How a purchase's per-unit price compares with the product's usual one
 * (the median of the others): -0.12 = 12 % cheaper. Null with too little
 * history to say.
 */
export function priceVsUsual(purchase: Purchase, all: Purchase[]): number | null {
  if (purchase.unitPrice === null) return null;
  const others = all.filter((p) => p.id !== purchase.id && p.unitPrice !== null).map((p) => p.unitPrice!);
  if (others.length < 2) return null;
  others.sort((a, b) => a - b);
  const mid = Math.floor(others.length / 2);
  const median = others.length % 2 ? others[mid] : (others[mid - 1] + others[mid]) / 2;
  if (median === 0) return null;
  return Math.round(((purchase.unitPrice - median) / median) * 100) / 100;
}

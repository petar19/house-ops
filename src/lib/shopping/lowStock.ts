import { isLow } from '../storage/layout';
import { resolveProduct, type CatalogOption } from '../storage/suggest';
import { normalizeText } from '../utils/normalize';
import type { ShoppingItem, StorageItem } from '../types';

export interface ListCandidate {
  name: string;
  productKey: string;
}

/** The product an item name is, or the name's own key for something new. */
export function productOf(name: string, options: CatalogOption[]): ListCandidate {
  const product = resolveProduct(name, options);
  return product
    ? { name: product.name, productKey: product.productKey }
    : { name: name.trim(), productKey: normalizeText(name) };
}

/**
 * What's running low or out in storage, one entry per product (the same
 * thing low in two places is bought once), minus what's already on the list.
 */
export function lowStock(items: StorageItem[], options: CatalogOption[], onList: ShoppingItem[] = []): ListCandidate[] {
  const taken = new Set(onList.filter((i) => !i.checked).map((i) => i.productKey));
  const out = new Map<string, ListCandidate>();
  for (const item of items) {
    if (!isLow(item)) continue;
    const c = productOf(item.name, options);
    if (!c.productKey || taken.has(c.productKey) || out.has(c.productKey)) continue;
    out.set(c.productKey, c);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The date a repeat timer puts the product back on the list. */
export function restockDue(lastBoughtAt: string, days: number): string {
  const d = new Date(`${lastBoughtAt}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

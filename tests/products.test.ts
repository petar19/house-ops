import { describe, expect, it } from 'vitest';
import { mergeCatalog } from '../src/lib/storage/suggest';
import { SYSTEM_ITEMS } from '../src/lib/storage/systemCatalog';
import { inUse, priceVsUsual, summarizeProducts } from '../src/lib/storage/products';
import type { Purchase, StorageCatalogEntry, StorageItem } from '../src/lib/types';

const item = (name: string, id = name): StorageItem => ({
  id, unitId: 'u', cellId: '1.1.1', name, nameKey: name.toLowerCase(), qtyMode: 'count', amount: 1, unit: null,
  level: null, expiry: null, note: '', addedAt: 0, addedBy: 'a', updatedAt: 0, updatedBy: 'a',
});
const purchase = (productKey: string, date: string, unitPrice: number | null, id = date): Purchase => ({
  id, productKey, name: productKey, raw: null, quantity: 1, unit: 'kg', packAmount: null, packUnit: null, price: unitPrice,
  unitPrice, priceUnit: 'kg', shop: null, brand: null, date, documentId: null, createdAt: 0, createdBy: 'a',
});

describe('products', () => {
  it('files every spelling of a product under one key', () => {
    const options = mergeCatalog(SYSTEM_ITEMS, [], 'hr');
    const summary = summarizeProducts(
      options,
      [item('Piletina prsa', 'a'), item('Pileća prsa', 'b'), item('pileći file', 'c')],
      [purchase('chicken breast', '2026-10-02', 5), purchase('chicken breast', '2026-10-15', 6)],
    ).get('chicken breast')!;
    expect(summary.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(summary.last?.date).toBe('2026-10-15');
    expect(inUse(summary)).toBe(true);
  });

  it("hides products the group merged away, and keeps the group's own version", () => {
    const entries: StorageCatalogEntry[] = [
      { id: 'grasak', name: 'Grašak', categories: [], unit: 'bag', count: 1, lastUsed: 0, unitIds: [] },
      { id: 'cevapi', name: 'Ćevapi', categories: [], unit: null, count: 0, lastUsed: 0, unitIds: [], hidden: true, systemKey: 'cevapi' },
    ];
    const products = summarizeProducts(mergeCatalog(SYSTEM_ITEMS, entries, 'en'), [], []);
    expect(products.get('peas')?.option.name).toBe('Grašak');
    expect(products.has('cevapi')).toBe(false);
    expect(inUse(products.get('rice')!)).toBe(false);
  });

  it('says how a price compares with the usual one', () => {
    const all = [purchase('x', '1', 5, 'a'), purchase('x', '2', 6, 'b'), purchase('x', '3', 4, 'c'), purchase('x', '4', 6, 'd')];
    expect(priceVsUsual(all[3], all)).toBe(0.2); // 6 vs median 5
    expect(priceVsUsual(all[0], all.slice(0, 2))).toBeNull(); // too little history
  });
});

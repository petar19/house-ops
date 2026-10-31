import { describe, expect, it } from 'vitest';
import { mergeCatalog } from '../src/lib/storage/suggest';
import { SYSTEM_ITEMS } from '../src/lib/storage/systemCatalog';
import { purchaseStats } from '../src/lib/storage/purchaseStats';
import type { Purchase } from '../src/lib/types';

const options = mergeCatalog(SYSTEM_ITEMS, [], 'en');
const chicken = options.find((o) => o.name === 'Chicken breast')!;
const p = (productKey: string, date: string, price: number | null, shop: string | null): Purchase => ({
  id: date + shop + price, productKey, name: productKey, raw: null, quantity: 1, unit: null, packAmount: null, packUnit: null,
  price, unitPrice: price, priceUnit: 'pcs', shop, brand: null, date, documentId: null, createdAt: 0, createdBy: 'a',
});

describe('purchaseStats', () => {
  const list = [
    p(chicken.productKey, '2026-10-02', 5, 'Metro'),
    p(chicken.productKey, '2026-10-20', 6, 'Lidl'),
    p('mystery thing', '2026-11-01', 2, 'Lidl'),
    p('mystery thing', '2026-11-02', null, 'Lidl'),
    p(chicken.productKey, '2026-09-01', 99, 'Lidl'),
  ];

  it('totals by shop, product and category within the range', () => {
    const s = purchaseStats(list, options, { from: '2026-10-01' });
    expect(s.total).toBe(13);
    expect(s.byShop).toEqual([{ key: 'Lidl', total: 8, count: 2 }, { key: 'Metro', total: 5, count: 1 }]);
    expect(s.byProduct[0]).toEqual({ key: 'Chicken breast', total: 11, count: 2 });
    expect(s.byCategory.find((c) => c.key === 'other')).toEqual({ key: 'other', total: 2, count: 1 });
    expect(s.byMonth).toEqual([
      { month: '2026-10', shops: { Metro: 5, Lidl: 6 } },
      { month: '2026-11', shops: { Lidl: 2 } },
    ]);
  });
});

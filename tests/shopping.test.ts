import { describe, expect, it } from 'vitest';
import { mergeCatalog } from '../src/lib/storage/suggest';
import { SYSTEM_ITEMS } from '../src/lib/storage/systemCatalog';
import { lowStock, productOf, restockDue } from '../src/lib/shopping/lowStock';
import type { ShoppingItem, StorageItem } from '../src/lib/types';

const item = (name: string, patch: Partial<StorageItem> = {}): StorageItem => ({
  id: name + Math.random(), unitId: 'u', cellId: '1.1.1', name, nameKey: name.toLowerCase(), qtyMode: 'count', amount: 1,
  unit: null, level: null, expiry: null, note: '', addedAt: 0, addedBy: 'a', updatedAt: 0, updatedBy: 'a', ...patch,
});
const options = mergeCatalog(SYSTEM_ITEMS, [], 'hr');

describe('lowStock', () => {
  it('lists low and empty things once per product', () => {
    const low = lowStock(
      [
        item('piletina prsa', { amount: 0 }),
        item('pileća prsa', { qtyMode: 'level', amount: null, level: 'empty' }),
        item('Riža', { qtyMode: 'level', amount: null, level: 'low' }),
        item('Tjestenina', { qtyMode: 'level', amount: null, level: 'plenty' }),
        item('Mlijeko', { amount: 2 }),
      ],
      options,
    );
    expect(low.map((c) => c.productKey)).toHaveLength(2);
    expect(low.map((c) => c.productKey)).toContain(productOf('piletina prsa', options).productKey);
  });

  it('skips what is already on the list, but not what was ticked off', () => {
    const rice = productOf('Riža', options);
    const onList = (checked: boolean) => [{ productKey: rice.productKey, checked } as ShoppingItem];
    const items = [item('Riža', { qtyMode: 'level', amount: null, level: 'low' })];
    expect(lowStock(items, options, onList(false))).toEqual([]);
    expect(lowStock(items, options, onList(true))).toHaveLength(1);
  });

  it('keys an unknown name by itself', () => {
    expect(productOf('  Zlatni klamerići ', options)).toEqual({ name: 'Zlatni klamerići', productKey: 'zlatni klamerici' });
  });
});

describe('restockDue', () => {
  it('adds days across month ends', () => {
    expect(restockDue('2026-10-25', 10)).toBe('2026-11-04');
    expect(restockDue('2026-02-27', 2)).toBe('2026-03-01');
  });
});

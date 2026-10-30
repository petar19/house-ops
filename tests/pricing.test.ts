import { describe, expect, it } from 'vitest';
import { unitPrice } from '../src/lib/storage/pricing';

describe('unit prices', () => {
  it('per kg from a weight', () => {
    expect(unitPrice({ price: 5, quantity: 1, unit: 'kg' }, 'kg')).toBe(5);
    expect(unitPrice({ price: 3, quantity: 500, unit: 'g' }, 'kg')).toBe(6);
  });

  it('per kg or l from a count of packages of a printed size', () => {
    expect(unitPrice({ price: 3.98, quantity: 2, unit: 'pcs', packAmount: 500, packUnit: 'g' }, 'kg')).toBe(3.98);
    expect(unitPrice({ price: 2.38, quantity: 2, unit: null, packAmount: 1, packUnit: 'l' }, 'l')).toBe(1.19);
  });

  it('per piece from a count', () => {
    expect(unitPrice({ price: 3, quantity: 10, unit: 'pcs' }, 'pcs')).toBe(0.3);
    expect(unitPrice({ price: 2, quantity: null, unit: null }, 'pcs')).toBe(2);
  });

  it("gives up rather than guess when the units don't line up", () => {
    expect(unitPrice({ price: 4, quantity: 2, unit: 'pcs' }, 'kg')).toBeNull();
    expect(unitPrice({ price: null, quantity: 1, unit: 'kg' }, 'kg')).toBeNull();
    expect(unitPrice({ price: 4, quantity: 1, unit: 'furlong' }, 'kg')).toBeNull();
  });

  it('a freebie costs nothing per unit', () => {
    expect(unitPrice({ price: 0, quantity: 1, unit: 'kg' }, 'kg')).toBe(0);
  });
});

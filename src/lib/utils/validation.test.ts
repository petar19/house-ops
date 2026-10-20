import { describe, expect, it } from 'vitest';
import { expenseImportSchema } from './validation';

const base = {
  id: 'x',
  name: 'Salary',
  paidBy: 'u1',
  categories: [],
  date: '2026-10-01',
  location: null,
  subitems: [],
  createdBy: 'u1',
  createdAt: 1,
  source: 'manual' as const,
};

describe('expenseImportSchema price', () => {
  it('accepts a positive expense', () => {
    expect(expenseImportSchema.safeParse({ ...base, price: 12.5 }).success).toBe(true);
  });

  it('accepts a negative price (money received, e.g. salary)', () => {
    expect(expenseImportSchema.safeParse({ ...base, price: -1500 }).success).toBe(true);
  });

  it('rejects a zero price, matching the Firestore rule', () => {
    expect(expenseImportSchema.safeParse({ ...base, price: 0 }).success).toBe(false);
  });
});

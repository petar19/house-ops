import { describe, expect, it } from 'vitest';
import { flowTotals } from '../src/lib/utils/stats';
import type { Expense } from '../src/lib/types';

const e = (price: number) => ({ price }) as Expense;

describe('flowTotals', () => {
  it('splits spending from money received', () => {
    expect(flowTotals([e(10), e(-4), e(2.5), e(-1), e(0)])).toEqual({
      out: 12.5,
      in: 5,
      net: 7.5,
      outCount: 2,
      inCount: 2,
    });
  });

  it('is all zero for no expenses', () => {
    expect(flowTotals([])).toEqual({ out: 0, in: 0, net: 0, outCount: 0, inCount: 0 });
  });
});

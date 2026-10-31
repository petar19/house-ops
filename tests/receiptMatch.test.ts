import { describe, expect, it } from 'vitest';
import { rankReceipts } from '../src/lib/documents/match';
import type { DocumentRecord } from '../src/lib/types';

const bill = (id: string, vendor: string, date: string | null, amount: number | null) =>
  ({ id, vendor, date, amount }) as DocumentRecord;
const bills = [
  bill('a', 'Lidl', '2026-10-01', 42.1),
  bill('b', 'Konzum', '2026-10-29', 12),
  bill('c', 'Lidl', '2026-10-30', 23.45),
  bill('d', 'Metro', '2026-09-01', 23.45),
];

describe('rankReceipts', () => {
  it('puts same amount and close date first', () => {
    expect(rankReceipts(bills, 23.45, '2026-10-31').map((m) => m.doc.id)).toEqual(['c', 'd', 'b', 'a']);
  });
  it('narrows by shop', () => {
    expect(rankReceipts(bills, null, '2026-10-31', 'lid').map((m) => m.doc.id)).toEqual(['c', 'a']);
  });
});

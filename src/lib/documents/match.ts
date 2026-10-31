import type { DocumentRecord } from '../types';

export interface ReceiptMatch {
  doc: DocumentRecord;
  // Same total (to the cent) and/or within a few days of the expense.
  sameAmount: boolean;
  near: boolean;
}

const dayDiff = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;

/**
 * Bills to offer for linking to an expense: likely ones first (same amount,
 * then a close date), the rest newest first. `search` narrows by shop name.
 */
export function rankReceipts(docs: DocumentRecord[], price: number | null, date: string, search = ''): ReceiptMatch[] {
  const q = search.trim().toLowerCase();
  return docs
    .filter((d) => !q || d.vendor.toLowerCase().includes(q))
    .map((doc) => ({
      doc,
      sameAmount: price !== null && doc.amount !== null && Math.abs(Math.abs(doc.amount) - Math.abs(price)) < 0.005,
      near: !!doc.date && !!date && dayDiff(doc.date, date) <= 3,
    }))
    .sort(
      (a, b) =>
        Number(b.sameAmount) * 2 + Number(b.near) - (Number(a.sameAmount) * 2 + Number(a.near)) ||
        (b.doc.date ?? '').localeCompare(a.doc.date ?? ''),
    );
}

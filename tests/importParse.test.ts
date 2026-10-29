import { describe, expect, it } from 'vitest';
import { combineDrafts, parseImportLine, parseImportText, type ImportDraft } from '../src/lib/storage/importParse';

describe('import line parsing', () => {
  it('reads the usual ways of writing a line', () => {
    expect(parseImportLine('peas, 2 bag')).toEqual({ name: 'peas', amount: 2, unit: 'bag' });
    expect(parseImportLine('Milk 1 l')).toEqual({ name: 'Milk', amount: 1, unit: 'l' });
    expect(parseImportLine('2x yogurt')).toEqual({ name: 'yogurt', amount: 2, unit: 'pcs' });
    expect(parseImportLine('eggs;10')).toEqual({ name: 'eggs', amount: 10, unit: null });
    expect(parseImportLine('rice - 1,5 kg')).toEqual({ name: 'rice', amount: 1.5, unit: 'kg' });
    expect(parseImportLine('Jogurt, 3 kom')).toEqual({ name: 'Jogurt', amount: 3, unit: 'pcs' });
    expect(parseImportLine('- batteries')).toEqual({ name: 'batteries', amount: null, unit: null });
  });

  it('keeps numbers that are part of the name', () => {
    expect(parseImportLine('Batteries AA')).toEqual({ name: 'Batteries AA', amount: null, unit: null });
    expect(parseImportLine('M6 screws, 20')).toEqual({ name: 'M6 screws', amount: 20, unit: null });
    expect(parseImportLine('Coca Cola 0,5 l, 6 bottle')).toEqual({ name: 'Coca Cola 0,5 l', amount: 6, unit: 'bottle' });
  });

  it('splits pasted text into lines and skips blanks', () => {
    expect(parseImportText('peas, 2 bag\n\n  \nMilk 1 l\r\nsalt')).toHaveLength(3);
  });
});

describe('combining an import list', () => {
  const draft = (over: Partial<ImportDraft>): ImportDraft => ({
    name: 'x', qtyMode: 'count', amount: 1, unit: null, level: null, expiry: null, note: '', categories: [], ...over,
  });

  it('adds up the same item listed twice, keeping both receipt lines', () => {
    const out = combineDrafts([
      draft({ name: 'Jogurt', amount: 2, unit: 'pcs', note: 'ZDR.JOG' }),
      draft({ name: ' jogurt ', amount: 1, unit: 'pcs', note: 'JOG.NAT' }),
      draft({ name: 'Jogurt', amount: 1, unit: 'kg' }),
      draft({ name: '  ' }),
    ]);
    expect(out.map((d) => [d.name, d.amount, d.unit, d.note])).toEqual([
      ['Jogurt', 3, 'pcs', 'ZDR.JOG; JOG.NAT'],
      ['Jogurt', 1, 'kg', ''],
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { combineDrafts, parseHeader, parseImportLine, parseImportText, type ImportDraft } from '../src/lib/storage/importParse';

const c = (name: string, amount: number | null, unit: string | null) => ({ name, amount, unit, level: null });

describe('import line parsing', () => {
  it('reads the usual ways of writing a line', () => {
    expect(parseImportLine('peas, 2 bag')).toEqual(c('peas', 2, 'bag'));
    expect(parseImportLine('Milk 1 l')).toEqual(c('Milk', 1, 'l'));
    expect(parseImportLine('2x yogurt')).toEqual(c('yogurt', 2, 'pcs'));
    expect(parseImportLine('eggs;10')).toEqual(c('eggs', 10, null));
    expect(parseImportLine('rice - 1,5 kg')).toEqual(c('rice', 1.5, 'kg'));
    expect(parseImportLine('Jogurt, 3 kom')).toEqual(c('Jogurt', 3, 'pcs'));
    expect(parseImportLine('- batteries')).toEqual(c('batteries', null, null));
  });

  it('keeps numbers that are part of the name', () => {
    expect(parseImportLine('Batteries AA')).toEqual(c('Batteries AA', null, null));
    expect(parseImportLine('M6 screws, 20')).toEqual(c('M6 screws', 20, null));
    expect(parseImportLine('Coca Cola 0,5 l, 6 bottle')).toEqual(c('Coca Cola 0,5 l', 6, 'bottle'));
  });

  it('reads ITEM, HOW_MUCH, UNIT with the unit in its own column', () => {
    expect(parseImportLine('peas, 2, bag')).toEqual(c('peas', 2, 'bag'));
    expect(parseImportLine('peas, 2, bags')).toEqual(c('peas', 2, 'bag'));
    expect(parseImportLine('rice, 1,5, kg')).toEqual(c('rice', 1.5, 'kg'));
    expect(parseImportLine('sausages; 3; links')).toEqual(c('sausages', 3, 'links'));
    expect(parseImportLine('Jogurt, 3, kom')).toEqual(c('Jogurt', 3, 'pcs'));
  });

  it('reads ITEM, SOME/PLENTY/LOW/EMPTY as a rough amount, in either language', () => {
    expect(parseImportLine('flour, some')).toEqual({ name: 'flour', amount: null, unit: null, level: 'some' });
    expect(parseImportLine('Salt, PLENTY')).toEqual({ name: 'Salt', amount: null, unit: null, level: 'plenty' });
    expect(parseImportLine('milk - low')).toEqual({ name: 'milk', amount: null, unit: null, level: 'low' });
    expect(parseImportLine('šećer, nema')).toEqual({ name: 'šećer', amount: null, unit: null, level: 'empty' });
    expect(parseImportLine('brašno; nešto')).toEqual({ name: 'brašno', amount: null, unit: null, level: 'some' });
  });

  it("doesn't mistake words inside a name for a level or a separator", () => {
    expect(parseImportLine('Low-fat milk, 2 l')).toEqual(c('Low-fat milk', 2, 'l'));
    expect(parseImportLine('Some cheese')).toEqual(c('Some cheese', null, null));
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
      draft(c('Jogurt', 1, 'kg')),
      draft({ name: '  ' }),
    ]);
    expect(out.map((d) => [d.name, d.amount, d.unit, d.note])).toEqual([
      ['Jogurt', 3, 'pcs', 'ZDR.JOG; JOG.NAT'],
      ['Jogurt', 1, 'kg', ''],
    ]);
  });
});

describe('prices and column headers', () => {
  it('reads the default order item, quantity, unit, price', () => {
    expect(parseImportLine('chicken breast, 1, kg, 5')).toMatchObject({ name: 'chicken breast', amount: 1, unit: 'kg', price: 5 });
    expect(parseImportLine('peas, 2, bag, 3,49')).toMatchObject({ name: 'peas', amount: 2, unit: 'bag', price: 3.49 });
    expect(parseImportLine('eggs, 10, 2.99')).toMatchObject({ name: 'eggs', amount: 10, unit: null, price: 2.99 });
    expect(parseImportLine('peas, 2, bag')).not.toHaveProperty('price');
  });

  it('recognises a header line in short or long form', () => {
    expect(parseHeader('i, q, u, p, s, b')).toEqual(['item', 'quantity', 'unit', 'price', 'shop', 'brand']);
    expect(parseHeader('Item; Price; Shop')).toEqual(['item', 'price', 'shop']);
    expect(parseHeader('stvar, kolicina, cijena')).toEqual(['item', 'quantity', 'price']);
    expect(parseHeader('q, u')).toBeNull(); // no item column
    expect(parseHeader('peas, 2, bag')).toBeNull();
  });

  it('reads every line in the header order, with any subset of columns', () => {
    const rows = parseImportText('i, p, q, u, s, b\nchicken breast, 5, 1, kg, metro, vindija\nfree sample, 0, 1\n\nflour, , some');
    expect(rows).toEqual([
      { name: 'chicken breast', amount: 1, unit: 'kg', level: null, price: 5, shop: 'metro', brand: 'vindija' },
      { name: 'free sample', amount: 1, unit: null, level: null, price: 0, shop: null, brand: null },
      { name: 'flour', amount: null, unit: null, level: 'some', price: null, shop: null, brand: null },
    ]);
  });

  it('without a header, lines are read one by one as before', () => {
    expect(parseImportText('Milk 1 l\nflour, some').map((r) => r.name)).toEqual(['Milk', 'flour']);
  });
});

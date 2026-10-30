import { COMMON_UNITS } from './systemCatalog';
import { normalizeText } from '../utils/normalize';
import type { StorageLevel } from '../types';

export interface ParsedLine {
  name: string;
  amount: number | null;
  unit: string | null;
  level: StorageLevel | null; // a rough amount instead ("flour, some")
  price?: number | null; // paid for the whole line
  shop?: string | null;
  brand?: string | null;
}

const UNIT_ALIASES: Record<string, string> = {
  kom: 'pcs', komad: 'pcs', komada: 'pcs', pc: 'pcs', piece: 'pcs', pieces: 'pcs', x: 'pcs',
  kg: 'kg', g: 'g', gr: 'g', l: 'l', lit: 'l', ml: 'ml', m: 'm',
  packs: 'pack', bags: 'bag', boxes: 'box', bottles: 'bottle', cans: 'can', jars: 'jar', rolls: 'roll',
  pak: 'pack', paket: 'pack', vrecica: 'bag', vreća: 'bag', vrecice: 'bag', kutija: 'box', boca: 'bottle',
  limenka: 'can', staklenka: 'jar', rola: 'roll',
};

// The rough amounts, in both app languages.
const LEVEL_WORDS: Record<string, StorageLevel> = {
  plenty: 'plenty', lots: 'plenty', puno: 'plenty',
  some: 'some', nesto: 'some',
  low: 'low', little: 'low', malo: 'low',
  empty: 'empty', none: 'empty', nema: 'empty', prazno: 'empty',
};

function unitOf(word: string | undefined): string | null {
  if (!word) return null;
  const w = word.toLowerCase().replace(/\.$/, '');
  if (COMMON_UNITS.includes(w)) return w;
  return UNIT_ALIASES[w] ?? null;
}

function levelOf(word: string): StorageLevel | null {
  return LEVEL_WORDS[normalizeText(word)] ?? null;
}

/**
 * Splits "a, b; c - d" into fields. A comma between two digits ("1,5") is a
 * decimal, and a dash only separates with spaces around it ("rice - 1 kg",
 * not "low-fat").
 */
function fields(text: string, keepEmpty = false): string[] {
  const out: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const decimalComma = c === ',' && /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '');
    const spacedDash = c === '-' && text[i - 1] === ' ' && text[i + 1] === ' ';
    if (c === ';' || c === '\t' || (c === ',' && !decimalComma) || spacedDash) {
      out.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  out.push(current);
  const trimmed = out.map((f) => f.trim());
  return keepEmpty ? trimmed : trimmed.filter(Boolean);
}

const NUMBER = /^\d+(?:[.,]\d+)?$/;
const num = (s: string) => Number(s.replace(',', '.'));
const plain = (name: string, amount: number | null = null, unit: string | null = null): ParsedLine => ({
  name,
  amount,
  unit,
  level: null,
});

/**
 * One typed/pasted line → name + amount + unit, or name + rough level.
 * Accepts what people naturally write: "peas, 2, bag", "peas, 2 bag",
 * "flour, some", "Milk 1 l", "2x yogurt", "eggs;10", "rice - 1,5 kg", or
 * just "batteries".
 */
export function parseImportLine(line: string): ParsedLine | null {
  const text = line.trim().replace(/^[-*•]\s*/, '');
  if (!text) return null;

  // "2x yogurt" / "2 x yogurt"
  const lead = /^(\d+(?:[.,]\d+)?)\s*x\s+(.+)$/i.exec(text);
  if (lead) return plain(lead[2].trim(), num(lead[1]), 'pcs');

  const parts = fields(text);
  // The default column order, item, quantity, unit, price: "peas, 2, bag, 3.49"
  // (or "peas, 2, 3.49" with no unit).
  if (parts.length >= 3 && NUMBER.test(parts[1])) {
    const third = parts[2];
    const thirdIsPrice = NUMBER.test(third);
    const priceText = thirdIsPrice ? third : parts[3];
    const line = plain(parts[0], num(parts[1]), thirdIsPrice ? null : (unitOf(third) ?? third.toLowerCase()));
    return priceText && NUMBER.test(priceText) ? { ...line, price: num(priceText) } : line;
  }
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    // ITEM, SOME / PLENTY / LOW / EMPTY
    const level = levelOf(last);
    if (level) return { name: parts.slice(0, -1).join(', '), amount: null, unit: null, level };
    // ITEM, HOW_MUCH, UNIT — the unit column can be any word
    const beforeLast = parts[parts.length - 2];
    if (parts.length >= 3 && NUMBER.test(beforeLast) && !NUMBER.test(last)) {
      return plain(parts.slice(0, -2).join(', '), num(beforeLast), unitOf(last) ?? last.toLowerCase());
    }
    // ITEM, HOW_MUCH [UNIT]
    const [qtyPart, ...unitWords] = last.split(/\s+/);
    if (NUMBER.test(qtyPart) && unitWords.length <= 1) {
      return plain(parts.slice(0, -1).join(', '), num(qtyPart), unitWords[0] ? (unitOf(unitWords[0]) ?? unitWords[0].toLowerCase()) : null);
    }
  }

  // No separator: "Milk 1 l" / "eggs 10" — a trailing number (+ known unit)
  const words = text.split(/\s+/);
  if (words.length >= 3 && NUMBER.test(words[words.length - 2]) && unitOf(words[words.length - 1])) {
    return plain(words.slice(0, -2).join(' '), num(words[words.length - 2]), unitOf(words[words.length - 1]));
  }
  if (words.length >= 2 && NUMBER.test(words[words.length - 1])) {
    return plain(words.slice(0, -1).join(' '), num(words[words.length - 1]));
  }
  return plain(text);
}

// Column names a header line may use — short or long, English or Croatian.
type Column = 'item' | 'quantity' | 'unit' | 'price' | 'shop' | 'brand';
const COLUMN_NAMES: Record<string, Column> = {
  i: 'item', item: 'item', name: 'item', product: 'item', stvar: 'item', artikl: 'item', proizvod: 'item', naziv: 'item',
  q: 'quantity', qty: 'quantity', quantity: 'quantity', amount: 'quantity', kol: 'quantity', kolicina: 'quantity',
  u: 'unit', unit: 'unit', jed: 'unit', jedinica: 'unit',
  p: 'price', price: 'price', cijena: 'price', c: 'price',
  s: 'shop', shop: 'shop', store: 'shop', trgovina: 'shop', ducan: 'shop',
  b: 'brand', brand: 'brand', marka: 'brand',
};

/** A first line like "i, q, u, p, s" — every field a known column name, one of them the item. */
export function parseHeader(line: string): Column[] | null {
  const parts = fields(line.trim());
  if (parts.length < 2) return null;
  const cols = parts.map((p) => COLUMN_NAMES[normalizeText(p)]);
  if (cols.some((c) => !c) || !cols.includes('item')) return null;
  return cols as Column[];
}

function parseWithColumns(line: string, cols: Column[]): ParsedLine | null {
  // Empty fields count here — "flour, , some" leaves the price column blank.
  const parts = fields(line.trim().replace(/^[-*•]\s*/, ''), true);
  const get = (c: Column) => {
    const i = cols.indexOf(c);
    return i >= 0 ? (parts[i] ?? '').trim() : '';
  };
  const name = get('item');
  if (!name) return null;
  const qty = get('quantity');
  const level = qty ? levelOf(qty) : null;
  const price = get('price');
  const unit = get('unit');
  return {
    name,
    amount: !level && NUMBER.test(qty) ? num(qty) : null,
    unit: unit ? (unitOf(unit) ?? unit.toLowerCase()) : null,
    level,
    price: NUMBER.test(price) ? num(price) : null,
    shop: get('shop') || null,
    brand: get('brand') || null,
  };
}

/**
 * A pasted list. If its first line names the columns ("i, q, u, p, s, b",
 * any order, any subset) every line is read in that order; otherwise each
 * line is read on its own, defaulting to item, quantity, unit, price.
 */
export function parseImportText(text: string): ParsedLine[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = lines.length > 0 ? parseHeader(lines[0]) : null;
  const parsed = header ? lines.slice(1).map((l) => parseWithColumns(l, header)) : lines.map(parseImportLine);
  return parsed.filter((l): l is ParsedLine => !!l && !!l.name);
}

/** One line of an import, ready to become a storage item. */
export interface ImportDraft {
  name: string;
  qtyMode: 'count' | 'level';
  amount: number | null;
  unit: string | null;
  level: StorageLevel | null;
  expiry: string | null;
  note: string;
  categories: string[]; // for names the catalog doesn't know yet
}

/**
 * Same thing listed twice in one import (two lines of the same yogurt) →
 * one entry with the amounts added, before anything is written.
 */
export function combineDrafts(drafts: ImportDraft[]): ImportDraft[] {
  const out: ImportDraft[] = [];
  for (const d of drafts) {
    const key = normalizeText(d.name);
    if (!key) continue;
    const same = out.find(
      (o) => normalizeText(o.name) === key && o.qtyMode === 'count' && d.qtyMode === 'count' && (o.unit ?? '') === (d.unit ?? ''),
    );
    if (same) {
      same.amount = (same.amount ?? 0) + (d.amount ?? 0);
      if (d.note && !same.note.includes(d.note)) same.note = [same.note, d.note].filter(Boolean).join('; ');
    } else {
      out.push({ ...d, name: d.name.trim() });
    }
  }
  return out;
}

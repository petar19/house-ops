import { COMMON_UNITS } from './systemCatalog';
import { normalizeText } from '../utils/normalize';
import type { StorageLevel } from '../types';

export interface ParsedLine {
  name: string;
  amount: number | null;
  unit: string | null;
}

const UNIT_ALIASES: Record<string, string> = {
  kom: 'pcs', komad: 'pcs', komada: 'pcs', pc: 'pcs', piece: 'pcs', pieces: 'pcs', x: 'pcs',
  kg: 'kg', g: 'g', gr: 'g', l: 'l', lit: 'l', ml: 'ml', m: 'm',
  pak: 'pack', paket: 'pack', vrecica: 'bag', vreća: 'bag', vrecice: 'bag', kutija: 'box', boca: 'bottle',
  limenka: 'can', staklenka: 'jar', rola: 'roll',
};

function unitOf(word: string | undefined): string | null {
  if (!word) return null;
  const w = word.toLowerCase().replace(/\.$/, '');
  if (COMMON_UNITS.includes(w)) return w;
  return UNIT_ALIASES[w] ?? null;
}

function lastSeparator(text: string): { at: number; length: number } | null {
  for (let i = text.length - 1; i >= 0; i--) {
    const c = text[i];
    if (c === ';' || c === '\t') return { at: i, length: 1 };
    if (c === ',' && !(/\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? ''))) return { at: i, length: 1 };
    if (c === '-' && text[i - 1] === ' ' && text[i + 1] === ' ') return { at: i - 1, length: 3 };
  }
  return null;
}

const NUMBER = /^\d+(?:[.,]\d+)?$/;
const num = (s: string) => Number(s.replace(',', '.'));

/**
 * One typed/pasted line → name + amount + unit. Accepts what people
 * naturally write: "peas, 2 bag", "Milk 1 l", "2x yogurt", "eggs;10",
 * "rice - 1 kg", or just "batteries".
 */
export function parseImportLine(line: string): ParsedLine | null {
  let text = line.trim().replace(/^[-*•]\s*/, '');
  if (!text) return null;

  // "2x yogurt" / "2 x yogurt"
  const lead = /^(\d+(?:[.,]\d+)?)\s*x\s+(.+)$/i.exec(text);
  if (lead) return { name: lead[2].trim(), amount: num(lead[1]), unit: 'pcs' };

  // "name, 2 kg" / "name; 2" / "name - 2 kg" / "name\t2" — split at the
  // last separator, where a comma between digits ("1,5") is a decimal, not one.
  const sep = lastSeparator(text);
  if (sep) {
    const name = text.slice(0, sep.at).trim();
    const rest = text.slice(sep.at + sep.length).trim();
    const [qtyPart, unitPart] = rest.split(/\s+/);
    if (name && qtyPart && NUMBER.test(qtyPart)) return { name, amount: num(qtyPart), unit: unitOf(unitPart) };
    if (name && !rest) text = name;
  }

  // "Milk 1 l" / "eggs 10" — trailing number (+ unit) without a separator
  const words = text.split(/\s+/);
  if (words.length >= 3 && NUMBER.test(words[words.length - 2]) && unitOf(words[words.length - 1])) {
    return { name: words.slice(0, -2).join(' '), amount: num(words[words.length - 2]), unit: unitOf(words[words.length - 1]) };
  }
  if (words.length >= 2 && NUMBER.test(words[words.length - 1])) {
    return { name: words.slice(0, -1).join(' '), amount: num(words[words.length - 1]), unit: null };
  }
  return { name: text, amount: null, unit: null };
}

export function parseImportText(text: string): ParsedLine[] {
  return text.split(/\r?\n/).map(parseImportLine).filter((l): l is ParsedLine => !!l && !!l.name);
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

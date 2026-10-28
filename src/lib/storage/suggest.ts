import { distance } from 'fastest-levenshtein';
import { normalizeText } from '../utils/normalize';
import type { StorageCatalogEntry, StorageItem } from '../types';
import type { SystemItem } from './systemCatalog';

// One autocomplete candidate: a system item, a group's own item, or a group
// item layered over the system item it matches (the group's version wins).
export interface CatalogOption {
  key: string;
  name: string;
  altNames: string[]; // other spellings that still match (e.g. the other language)
  categories: string[];
  unit: string | null;
  source: 'group' | 'system';
  count: number;
  unitIds: string[];
}

export function mergeCatalog(
  systemItems: SystemItem[],
  groupEntries: StorageCatalogEntry[],
  locale: 'en' | 'hr',
): CatalogOption[] {
  const options = new Map<string, CatalogOption>();
  // A group entry is keyed by whatever name it was saved under, which may be
  // either language's spelling of a system item — index both.
  const systemByAnyName = new Map<string, CatalogOption>();

  for (const s of systemItems) {
    const name = locale === 'hr' ? s.hr : s.en;
    const other = locale === 'hr' ? s.en : s.hr;
    const option: CatalogOption = {
      key: s.key,
      name,
      altNames: other !== name ? [other] : [],
      categories: [...s.categories],
      unit: s.unit,
      source: 'system',
      count: 0,
      unitIds: [],
    };
    options.set(option.key, option);
    systemByAnyName.set(normalizeText(s.en), option);
    systemByAnyName.set(normalizeText(s.hr), option);
  }

  for (const g of groupEntries) {
    const system = systemByAnyName.get(g.id);
    if (system) options.delete(system.key);
    options.set(g.id, {
      key: g.id,
      name: g.name,
      altNames: system ? [system.name, ...system.altNames].filter((n) => n !== g.name) : [],
      categories: g.categories.length > 0 ? g.categories : (system?.categories ?? []),
      unit: g.unit ?? system?.unit ?? null,
      source: 'group',
      count: g.count,
      unitIds: g.unitIds ?? [],
    });
  }

  return [...options.values()];
}

/** One typo away from the whole word, or from the part of it typed so far. */
function nearlyMatches(word: string, typed: string): boolean {
  return distance(word, typed) <= 1 || distance(word.slice(0, typed.length), typed) <= 1;
}

/** 4 exact, 3 prefix, 2 word-prefix, 1 substring, 0.5 one typo off; 0 = no match. */
export function matchQuality(query: string, text: string): number {
  const q = normalizeText(query);
  const s = normalizeText(text);
  if (!q || !s) return 0;
  if (s === q) return 4;
  if (s.startsWith(q)) return 3;
  const words = s.split(' ');
  if (words.some((w) => w.startsWith(q))) return 2;
  if (s.includes(q)) return 1;
  if (q.length >= 4 && words.some((w) => nearlyMatches(w, q))) return 0.5;
  return 0;
}

function bestQuality(query: string, option: CatalogOption): number {
  return Math.max(matchQuality(query, option.name), ...option.altNames.map((n) => matchQuality(query, n)));
}

export interface SuggestOptions {
  unitCategories: string[];
  unitId: string;
  showAll: boolean;
  limit?: number;
}

export interface SuggestResult {
  results: CatalogOption[];
  // Matches left out only because they're outside the unit's categories —
  // the UI offers "show all" when this is non-zero.
  hiddenCount: number;
}

export function suggest(query: string, options: CatalogOption[], opts: SuggestOptions): SuggestResult {
  const limit = opts.limit ?? 8;
  const inScope = (o: CatalogOption) =>
    opts.showAll ||
    opts.unitCategories.length === 0 ||
    o.categories.some((c) => opts.unitCategories.includes(c)) ||
    o.unitIds.includes(opts.unitId);
  const rank = (o: CatalogOption) =>
    (o.unitIds.includes(opts.unitId) ? 40 : 0) + (o.source === 'group' ? 20 : 0) + Math.min(o.count, 30);

  // No query yet: offer what this group usually puts here.
  if (!normalizeText(query)) {
    const results = options
      .filter((o) => o.source === 'group' && inScope(o))
      .sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name))
      .slice(0, limit);
    return { results, hiddenCount: 0 };
  }

  const scored: { option: CatalogOption; score: number }[] = [];
  let hiddenCount = 0;
  for (const option of options) {
    const quality = bestQuality(query, option);
    if (quality === 0) continue;
    if (!inScope(option)) {
      hiddenCount++;
      continue;
    }
    scored.push({ option, score: quality * 100 + rank(option) });
  }
  scored.sort((a, b) => b.score - a.score || a.option.name.localeCompare(b.option.name));
  return { results: scored.slice(0, limit).map((s) => s.option), hiddenCount };
}

/**
 * Items whose name (or another spelling of it, or its note) matches every
 * word of the query — prefix per word, tolerating one typo in longer words.
 */
export function searchItems(query: string, items: StorageItem[], options: CatalogOption[] = []): StorageItem[] {
  const tokens = normalizeText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];
  const altByKey = new Map(options.map((o) => [normalizeText(o.name), o.altNames]));

  return items.filter((item) => {
    const text = [item.name, ...(altByKey.get(item.nameKey) ?? []), item.note ?? ''].join(' ');
    const words = normalizeText(text).split(' ').filter(Boolean);
    return tokens.every((tok) =>
      words.some((w) => w.startsWith(tok) || (tok.length >= 4 && nearlyMatches(w, tok))),
    );
  });
}

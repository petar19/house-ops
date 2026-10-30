import { distance } from 'fastest-levenshtein';
import { normalizeText } from '../utils/normalize';
import type { StorageCatalogEntry, StorageItem } from '../types';
import type { PriceUnit, SystemItem } from './systemCatalog';

// One product: a built-in one, a group's own, or a group's version of a
// built-in one (the group's edits win). `productKey` is what purchases and
// price history are filed under — the built-in key when there is one, so it
// stays the same whether or not the group has edited the product.
export interface CatalogOption {
  key: string; // the group catalog doc id, or the built-in key
  productKey: string;
  name: string;
  altNames: string[]; // every other spelling that matches: the other language and the aliases
  aliases: string[]; // just the aliases (shown and edited on the Products page)
  categories: string[];
  unit: string | null;
  priceUnit: PriceUnit;
  source: 'group' | 'system';
  builtIn: boolean; // a built-in product, edited by the group or not
  hidden: boolean;
  mergedInto: string | null;
  count: number;
  unitIds: string[];
}

const DEFAULT_PRICE_UNIT: PriceUnit = 'pcs';

export function mergeCatalog(
  systemItems: SystemItem[],
  groupEntries: StorageCatalogEntry[],
  locale: 'en' | 'hr',
): CatalogOption[] {
  const options = new Map<string, CatalogOption>();
  // A group entry is keyed by whatever name it was saved under, which may be
  // either language's spelling of a built-in product or one of its aliases.
  const systemByAnyName = new Map<string, CatalogOption>();
  const systemByKey = new Map<string, CatalogOption>();

  for (const s of systemItems) {
    const name = locale === 'hr' ? s.hr : s.en;
    const other = locale === 'hr' ? s.en : s.hr;
    const option: CatalogOption = {
      key: s.key,
      productKey: s.key,
      name,
      altNames: [...(other !== name ? [other] : []), ...s.aliases],
      aliases: [...s.aliases],
      categories: [...s.categories],
      unit: s.unit,
      priceUnit: s.priceUnit,
      source: 'system',
      builtIn: true,
      hidden: false,
      mergedInto: null,
      count: 0,
      unitIds: [],
    };
    options.set(option.key, option);
    systemByKey.set(s.key, option);
    for (const n of [s.en, s.hr, ...s.aliases]) {
      const k = normalizeText(n);
      if (!systemByAnyName.has(k)) systemByAnyName.set(k, option);
    }
  }

  for (const g of groupEntries) {
    const system = (g.systemKey ? systemByKey.get(g.systemKey) : undefined) ?? systemByAnyName.get(g.id);
    if (system) options.delete(system.key);
    const aliases = g.aliases ?? system?.aliases ?? [];
    const names = new Set([...(system ? [system.name, ...system.altNames] : []), ...aliases]);
    names.delete(g.name);
    options.set(g.id, {
      key: g.id,
      productKey: system?.productKey ?? g.id,
      name: g.name,
      altNames: [...names],
      aliases: [...aliases],
      categories: g.categories.length > 0 ? g.categories : (system?.categories ?? []),
      unit: g.unit ?? system?.unit ?? null,
      priceUnit: g.priceUnit ?? system?.priceUnit ?? DEFAULT_PRICE_UNIT,
      source: 'group',
      builtIn: !!system,
      hidden: !!g.hidden || !!g.mergedInto,
      mergedInto: g.mergedInto ?? null,
      count: g.count,
      unitIds: g.unitIds ?? [],
    });
  }

  return [...options.values()];
}

/**
 * Finds the product a name means — by its name, the other language, or any
 * alias — preferring products still in use, and following merges. Null for
 * a name nothing knows yet (a new product).
 */
export function resolveProduct(name: string, options: CatalogOption[]): CatalogOption | null {
  const key = normalizeText(name);
  if (!key) return null;
  const matches = options.filter((o) => normalizeText(o.name) === key || o.altNames.some((n) => normalizeText(n) === key));
  const pick = matches.find((o) => !o.hidden && o.source === 'group') ?? matches.find((o) => !o.hidden) ?? matches[0];
  if (!pick) return null;
  if (pick.mergedInto) {
    const target = options.find((o) => o.productKey === pick.mergedInto && !o.hidden);
    if (target) return target;
  }
  return pick;
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
    !o.hidden &&
    (opts.showAll ||
    opts.unitCategories.length === 0 ||
    o.categories.some((c) => opts.unitCategories.includes(c)) ||
    o.unitIds.includes(opts.unitId));
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
    if (option.hidden) continue;
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

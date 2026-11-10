import { AUTO_CHECK_THRESHOLD, suggestCategories } from './categorize';
import { normalizeText, stripped } from './normalize';
import type { Category, Expense } from '../types';

// Expenses with no category, gathered by name for the "Sort categories"
// page: one choice then covers every "Konzum" at once. Names are compared
// without spaces, case or diacritics, so "Zoo City" and "zoocity" are one row.
export interface NameGroup {
  key: string;
  displayName: string; // the spelling used most
  expenses: Expense[];
  // Picked up front: what the same name already has elsewhere, otherwise
  // what its keywords pick by themselves.
  suggested: string[];
  source: 'history' | 'keywords' | null;
  // Weaker keyword matches, only outlined.
  hinted: string[];
}

function mostCommon<T>(items: T[], keyOf: (item: T) => string): T | undefined {
  const counts = new Map<string, { item: T; n: number }>();
  for (const item of items) {
    const k = keyOf(item);
    const entry = counts.get(k) ?? { item, n: 0 };
    entry.n++;
    counts.set(k, entry);
  }
  let best: { item: T; n: number } | undefined;
  for (const entry of counts.values()) if (!best || entry.n > best.n) best = entry;
  return best?.item;
}

export function groupUncategorized(expenses: Expense[], categories: Category[]): NameGroup[] {
  const known = new Set(categories.map((c) => c.id));
  const byKey = new Map<string, { without: Expense[]; withCats: string[][] }>();
  for (const e of expenses) {
    const key = stripped(e.name);
    if (!key) continue;
    const entry = byKey.get(key) ?? { without: [], withCats: [] };
    const cats = e.categories.filter((c) => known.has(c));
    if (cats.length === 0) entry.without.push(e);
    else entry.withCats.push([...cats].sort());
    byKey.set(key, entry);
  }

  const groups: NameGroup[] = [];
  for (const [key, { without, withCats }] of byKey) {
    if (without.length === 0) continue;
    const displayName = mostCommon(without, (e) => e.name.trim())!.name.trim();
    const fromHistory = mostCommon(withCats, (c) => c.join(','));
    const suggestions = suggestCategories(displayName, categories);
    const strong = suggestions.filter((s) => s.score >= AUTO_CHECK_THRESHOLD).map((s) => s.categoryId);
    const suggested = fromHistory ?? strong;
    groups.push({
      key,
      displayName,
      expenses: without,
      suggested,
      source: fromHistory ? 'history' : strong.length ? 'keywords' : null,
      hinted: suggestions.map((s) => s.categoryId).filter((id) => !suggested.includes(id)),
    });
  }
  return groups.sort((a, b) => b.expenses.length - a.expenses.length || a.displayName.localeCompare(b.displayName));
}

/** The keyword to remember for a name in a category — null when the
 * category's keywords already pick that name by themselves. */
export function keywordToLearn(name: string, category: Category): string | null {
  const keyword = normalizeText(name);
  if (!keyword) return null;
  const score = suggestCategories(name, [category])[0]?.score ?? 0;
  return score >= AUTO_CHECK_THRESHOLD ? null : keyword;
}

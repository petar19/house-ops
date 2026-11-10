import { describe, expect, it } from 'vitest';
import { groupUncategorized, keywordToLearn } from './categorizeBatch';
import type { Category, Expense } from '../types';

const cats: Category[] = [
  { id: 'food', name: 'Food', keywords: ['konzum', 'lidl'] },
  { id: 'pets', name: 'Pets', keywords: ['zoo'] },
  { id: 'car', name: 'Car', keywords: [] },
];
let n = 0;
const ex = (name: string, categories: string[] = []): Expense => ({
  id: String(n++), name, price: 1, paidBy: 'u', categories, date: '2026-11-01', location: null,
  subitems: [], createdBy: 'u', createdAt: 0, source: 'manual',
});

describe('groupUncategorized', () => {
  const groups = groupUncategorized(
    [
      ex('Konzum'), ex('konzum'), ex('KONZUM'),
      ex('Zoo City'), ex('zoocity'), ex('ZooCity', ['pets', 'food']), ex('Zoo city', ['pets', 'food']), ex('zoo city', ['pets']),
      ex('Vulkanizer'),
      ex('Lidl', ['food']),
      ex('Gone', ['deleted-category']),
    ],
    cats,
  );
  const byName = Object.fromEntries(groups.map((g) => [g.key, g]));

  it('gathers spellings of a name, most first, leaving fully sorted names out', () => {
    expect(groups.map((g) => [g.key, g.expenses.length])).toEqual([['konzum', 3], ['zoocity', 2], ['gone', 1], ['vulkanizer', 1]]);
    expect(byName.konzum.displayName).toBe('Konzum');
  });

  it('prefers what the same name already has, then keywords', () => {
    expect(byName.zoocity).toMatchObject({ suggested: ['food', 'pets'], source: 'history' });
    expect(byName.konzum).toMatchObject({ suggested: ['food'], source: 'keywords' });
    expect(byName.vulkanizer).toMatchObject({ suggested: [], source: null });
  });

  it('treats a category that no longer exists as none', () => {
    expect(byName.gone.suggested).toEqual([]);
  });
});

describe('keywordToLearn', () => {
  it('learns a name only when the keywords would not pick it already', () => {
    expect(keywordToLearn('Konzum', cats[0])).toBeNull();
    expect(keywordToLearn('Vulkanizer Ivo', cats[2])).toBe('vulkanizer ivo');
  });
});

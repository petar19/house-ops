import { describe, expect, it } from 'vitest';
import { filterExpenses } from './stats';
import type { Expense } from '../types';

const expense = (id: string, over: Partial<Expense>): Expense => ({
  id,
  name: id,
  price: 1,
  paidBy: 'u',
  categories: [],
  date: '2026-11-01',
  location: null,
  subitems: [],
  createdBy: 'u',
  createdAt: 0,
  source: 'manual',
  ...over,
});

const list = [
  expense('a', { name: 'Ćevapi kod Muje', categories: ['food'] }),
  expense('b', { name: 'Konzum', subitems: [{ name: 'Mlijeko', price: 1 }] }),
  expense('c', { name: 'Gorivo', description: 'INA Zagreb', categories: ['car'] }),
];
const ids = (xs: Expense[]) => xs.map((e) => e.id);

describe('filterExpenses', () => {
  it('searches name, description and subitems, ignoring case and diacritics', () => {
    expect(ids(filterExpenses(list, { search: 'cevapi' }))).toEqual(['a']);
    expect(ids(filterExpenses(list, { search: 'mlijeko' }))).toEqual(['b']);
    expect(ids(filterExpenses(list, { search: 'ina' }))).toEqual(['c']);
  });

  it('narrows to a category, or to the ones with none', () => {
    expect(ids(filterExpenses(list, { categoryIds: ['car'] }))).toEqual(['c']);
    expect(ids(filterExpenses(list, { uncategorized: true }))).toEqual(['b']);
  });
});

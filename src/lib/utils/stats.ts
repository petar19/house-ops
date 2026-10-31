import { format, startOfMonth, startOfWeek } from 'date-fns';
import { clusterNames, type NameCluster } from './fuzzyGroup';
import type { Expense, NameAlias } from '../types';

export interface ExpenseFilters {
  from?: string; // ISO date, inclusive
  to?: string; // ISO date, inclusive
  categoryIds?: string[]; // OR match
  spenderUids?: string[]; // OR match
  search?: string; // matched against name + description
}

// Money out vs money in over a set of expenses: a positive price is spending,
// a negative one (a refund, money received) is income. `net` is what was
// actually spent after what came back.
export interface FlowTotals {
  out: number;
  in: number;
  net: number;
  outCount: number;
  inCount: number;
}

export function flowTotals(expenses: Expense[]): FlowTotals {
  const totals: FlowTotals = { out: 0, in: 0, net: 0, outCount: 0, inCount: 0 };
  for (const e of expenses) {
    if (e.price > 0) {
      totals.out += e.price;
      totals.outCount++;
    } else if (e.price < 0) {
      totals.in -= e.price;
      totals.inCount++;
    }
  }
  totals.net = totals.out - totals.in;
  return totals;
}

// `date` is day-granularity, so sorting by it alone leaves same-day expenses
// in an arbitrary tiebreak order — a freshly-added expense could land
// anywhere among today's entries instead of at the top. createdAt (a real
// timestamp) breaks the tie, newest first.
export function sortByRecency(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) =>
    a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1,
  );
}

export function filterExpenses(expenses: Expense[], filters: ExpenseFilters): Expense[] {
  return expenses.filter((e) => {
    if (filters.from && e.date < filters.from) return false;
    if (filters.to && e.date > filters.to) return false;
    if (filters.categoryIds?.length && !e.categories.some((c) => filters.categoryIds!.includes(c))) {
      return false;
    }
    if (filters.spenderUids?.length && !filters.spenderUids.includes(e.paidBy)) return false;
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      const haystack = `${e.name} ${e.description ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export type SortKey = 'date-desc' | 'date-asc' | 'price-desc' | 'price-asc' | 'name-asc';

export function sortExpenses(expenses: Expense[], sortKey: SortKey): Expense[] {
  const sorted = [...expenses];
  switch (sortKey) {
    case 'date-asc':
      return sorted.sort((a, b) => a.date.localeCompare(b.date));
    case 'price-desc':
      return sorted.sort((a, b) => b.price - a.price);
    case 'price-asc':
      return sorted.sort((a, b) => a.price - b.price);
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'date-desc':
    default:
      return sorted.sort((a, b) => b.date.localeCompare(a.date));
  }
}

export interface Aggregate {
  key: string;
  total: number;
  count: number;
}

export function aggregateBy(expenses: Expense[], keyFn: (e: Expense) => string[]): Aggregate[] {
  const map = new Map<string, Aggregate>();
  for (const e of expenses) {
    for (const key of keyFn(e)) {
      const existing = map.get(key) ?? { key, total: 0, count: 0 };
      existing.total += e.price;
      existing.count += 1;
      map.set(key, existing);
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export const aggregateByCategory = (expenses: Expense[]): Aggregate[] =>
  aggregateBy(expenses, (e) => (e.categories.length > 0 ? e.categories : ['(uncategorized)']));

export const aggregateBySpender = (expenses: Expense[]): Aggregate[] =>
  aggregateBy(expenses, (e) => [e.paidBy]);

export function aggregateByName(
  expenses: Expense[],
  counts: Record<string, number>,
  aliases: NameAlias[] = [],
): { aggregates: Aggregate[]; clusters: NameCluster[] } {
  const distinctNames = [...new Set(expenses.map((e) => e.name))];
  const clusters = clusterNames(distinctNames, counts, aliases);
  const nameToCanonical = new Map<string, string>();
  for (const cluster of clusters) {
    for (const member of cluster.members) nameToCanonical.set(member, cluster.canonicalName);
  }
  const aggregates = aggregateBy(expenses, (e) => [nameToCanonical.get(e.name) ?? e.name]);
  return { aggregates, clusters };
}

export type BucketSize = 'day' | 'week' | 'month';

export function bucketLabel(isoDate: string, bucket: BucketSize): string {
  const d = new Date(isoDate);
  if (bucket === 'day') return isoDate;
  if (bucket === 'week') return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  return format(startOfMonth(d), 'yyyy-MM');
}

export function aggregateByTime(expenses: Expense[], bucket: BucketSize): Aggregate[] {
  const result = aggregateBy(expenses, (e) => [bucketLabel(e.date, bucket)]);
  return result.sort((a, b) => a.key.localeCompare(b.key));
}

export function suggestBucketSize(expenses: Expense[]): BucketSize {
  if (expenses.length === 0) return 'day';
  const dates = expenses.map((e) => e.date).sort();
  const spanDays =
    (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86_400_000;
  if (spanDays <= 31) return 'day';
  if (spanDays <= 180) return 'week';
  return 'month';
}

import type { StorageItem } from '../types';

export const DEFAULT_ALERT_DAYS = [7, 3, 1, 0];

/** Whole days from `today` to an ISO date (negative once it's past). */
export function daysUntil(date: string, today: string): number {
  const ms = Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export interface Expiring {
  item: StorageItem;
  days: number;
}

/** Items with an expiry date within `withinDays` (or already past), soonest first. */
export function expiringSoon(items: StorageItem[], today: string, withinDays: number): Expiring[] {
  return items
    .filter((i) => i.expiry)
    .map((item) => ({ item, days: daysUntil(item.expiry!, today) }))
    .filter((e) => e.days <= withinDays)
    .sort((a, b) => a.days - b.days || a.item.name.localeCompare(b.item.name));
}

/** "1, 3, 7" typed by hand → [7, 3, 1], deduped, whole non-negative days only. */
export function parseAlertDays(text: string): number[] {
  const days = text
    .split(/[\s,;]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 365);
  return [...new Set(days)].sort((a, b) => b - a);
}

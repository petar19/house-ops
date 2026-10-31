import { describe, expect, it } from 'vitest';
import { daysUntil, expiringSoon, parseAlertDays } from '../src/lib/storage/expiry';
import type { StorageItem } from '../src/lib/types';

const item = (name: string, expiry: string | null) => ({ id: name, name, expiry }) as StorageItem;

describe('expiry', () => {
  it('counts whole days, negative once past', () => {
    expect(daysUntil('2026-11-03', '2026-10-31')).toBe(3);
    expect(daysUntil('2026-10-31', '2026-10-31')).toBe(0);
    expect(daysUntil('2026-10-29', '2026-10-31')).toBe(-2);
    expect(daysUntil('2026-03-30', '2026-03-28')).toBe(2); // across the DST change
  });

  it('lists what expires soon, soonest first', () => {
    const soon = expiringSoon(
      [item('milk', '2026-11-02'), item('rice', null), item('jam', '2027-01-01'), item('ham', '2026-10-30')],
      '2026-10-31',
      7,
    );
    expect(soon.map((e) => [e.item.name, e.days])).toEqual([['ham', -1], ['milk', 2]]);
  });

  it('parses typed alert days', () => {
    expect(parseAlertDays('1, 3 7,3 x -2 0')).toEqual([7, 3, 1, 0]);
  });
});

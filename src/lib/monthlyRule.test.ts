import { describe, expect, it } from 'vitest';
import { nextMonthlyAfter, ruleDayInMonth } from './monthlyRule';

describe('monthly reminder rules', () => {
  it('finds the nth and last weekday', () => {
    // November 2026 starts on a Sunday.
    expect(ruleDayInMonth({ nth: 1, weekday: 2 }, 2026, 10)).toBe(3);
    expect(ruleDayInMonth({ nth: 4, weekday: 0 }, 2026, 10)).toBe(22);
    expect(ruleDayInMonth({ nth: -1, weekday: 5 }, 2026, 10)).toBe(27);
  });

  it('puts a 31st on the last day of a shorter month', () => {
    expect(ruleDayInMonth({ day: 31 }, 2026, 1)).toBe(28);
  });

  it('is later today when the time has not passed, else next month', () => {
    expect(nextMonthlyAfter('2026-11-03T09:00', { nth: 1, weekday: 2 }, '18:00')).toBe('2026-11-03T18:00');
    expect(nextMonthlyAfter('2026-11-03T18:00', { nth: 1, weekday: 2 }, '18:00')).toBe('2026-12-01T18:00');
    expect(nextMonthlyAfter('2026-12-20T10:00', { day: 11 }, '09:00')).toBe('2027-01-11T09:00');
  });
});

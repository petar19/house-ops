// A reminder that repeats on a day of the month rather than after a period:
// a date ("every 11th") or the nth weekday ("every 1st Tuesday", "every last
// Friday"). Stored on the reminder as `monthlyOn`; the time of day is the one
// in its nextTriggerAt. The bot works out each next one from the same rules
// (src/monthlyRule.ts there) — keep the two in step.
//   day: 1–31; in a shorter month a 29th–31st falls on the last day.
//   nth: 1–4, or -1 for the last; weekday: 0 = Sunday … 6 = Saturday.
export type MonthlyOn = { day: number } | { nth: number; weekday: number };

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** The day of the month the rule falls on in that month (month 0-based). */
export function ruleDayInMonth(rule: MonthlyOn, year: number, month: number): number {
  const length = daysInMonth(year, month);
  if ('day' in rule) return Math.min(rule.day, length);
  if (rule.nth === -1) {
    const lastWeekday = new Date(year, month, length).getDay();
    return length - ((lastWeekday - rule.weekday + 7) % 7);
  }
  const firstWeekday = new Date(year, month, 1).getDay();
  return 1 + ((rule.weekday - firstWeekday + 7) % 7) + (rule.nth - 1) * 7;
}

// "YYYY-MM-DDTHH:mm" in local time, like the reminders' nextTriggerAt.
function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The first time the rule comes round strictly after `after`
 * ("YYYY-MM-DDTHH:mm"), at `time` ("HH:mm"). */
export function nextMonthlyAfter(after: string, rule: MonthlyOn, time: string): string {
  const [h, mi] = time.split(':').map(Number);
  const start = new Date(after);
  for (let i = 0; i < 3; i++) {
    const month = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const day = ruleDayInMonth(rule, month.getFullYear(), month.getMonth());
    const candidate = formatLocalDateTime(new Date(month.getFullYear(), month.getMonth(), day, h, mi));
    if (candidate > after) return candidate;
  }
  // Unreachable: every month has each rule's day, so the next month always wins.
  throw new Error('No monthly occurrence found');
}

export function nowLocalDateTime(): string {
  return formatLocalDateTime(new Date());
}

import { to12h } from './timeWheel';

// Due day + optional time of day for reminders (owner 2026-10-18: "add a time picker"). A reminder
// with no time is due at the END of its day (23:59 local) — the shape every reminder had since the
// composer went date-only on 2026-09-24 — so 23:59 reads back as "no time chosen". Pure, no RN.

export interface TimeOfDay { hour: number; minute: number }

const END_OF_DAY: TimeOfDay = { hour: 23, minute: 59 };

/** "2026-10-19" + 12:00 → that local moment; no time → 23:59 that day. */
export function dueAtFor(day: string, time: TimeOfDay | null): Date {
  const [year, month, date] = day.split('-').map(Number);
  const t = time ?? END_OF_DAY;
  return new Date(year, month - 1, date, t.hour, t.minute, 0, 0);
}

/** The time of day a due moment was set for; null for end-of-day (= no time chosen). */
export function timeOfDue(d: Date): TimeOfDay | null {
  const t = { hour: d.getHours(), minute: d.getMinutes() };
  return t.hour === END_OF_DAY.hour && t.minute === END_OF_DAY.minute ? null : t;
}

/** 12:00 → "12:00 PM", 9:05 → "9:05 AM". */
export function formatTimeOfDay(t: TimeOfDay): string {
  const { h12, meridiem } = to12h(t.hour);
  return `${h12}:${String(t.minute).padStart(2, '0')} ${meridiem}`;
}

/** What the time sheet opens on: the next full hour today (never past 11 PM), 10:00 AM on a later day. */
export function defaultTimeFor(day: string | null, now = new Date()): TimeOfDay {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (day !== today) return { hour: 10, minute: 0 };
  return { hour: Math.min(23, now.getHours() + 1), minute: 0 };
}

/** True when that day + time has already gone by. */
export const isPastTime = (day: string, time: TimeOfDay, now = new Date()): boolean => dueAtFor(day, time).getTime() <= now.getTime();

/** A due moment for lists: the date, plus " · 12:00 PM" when a time was chosen. `dateText` keeps each
 *  screen's own date style. */
export function dueText(iso: string | undefined, dateText: (d: Date) => string, empty = 'No due date'): string {
  if (!iso) return empty;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return empty;
  const t = timeOfDue(d);
  return t ? `${dateText(d)} · ${formatTimeOfDay(t)}` : dateText(d);
}

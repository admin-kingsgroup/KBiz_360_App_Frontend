// Pure due-time helpers for the reminder composer. No RN imports (tested with Jest).

export type WhenPresetKey = 'today_evening' | 'tomorrow_morning' | 'next_monday' | 'in_1_hour';

export const WHEN_PRESETS: { key: WhenPresetKey; label: string }[] = [
  { key: 'today_evening', label: 'Today 5:00 PM' },
  { key: 'tomorrow_morning', label: 'Tomorrow 9:00 AM' },
  { key: 'next_monday', label: 'Next Monday' },
  { key: 'in_1_hour', label: 'In 1 hour' },
];

// Resolve a preset to a real Date. "Today 5 PM" already past rolls to tomorrow 5 PM.
export function presetDue(key: WhenPresetKey, now: Date = new Date()): Date {
  const at = new Date(now);
  if (key === 'today_evening') {
    at.setHours(17, 0, 0, 0);
    if (at <= now) at.setDate(at.getDate() + 1);
  } else if (key === 'tomorrow_morning') {
    at.setDate(now.getDate() + 1);
    at.setHours(9, 0, 0, 0);
  } else if (key === 'next_monday') {
    const days = (8 - now.getDay()) % 7 || 7;
    at.setDate(now.getDate() + days);
    at.setHours(9, 0, 0, 0);
  } else {
    at.setTime(now.getTime() + 3600_000);
  }
  return at;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatTime(d: Date): string {
  const h24 = d.getHours();
  const h = h24 % 12 || 12;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  return `${h}:${d.getMinutes().toString().padStart(2, '0')} ${ampm}`;
}

// Human label for a due time, relative to `now`:
//   same day → "Today · 5:00 PM" · next day → "Tomorrow · 9:00 AM"
//   within 6 days → "Mon · 9:00 AM" · same year → "14 Jul · 9:00 AM" · else "14 Jul 2027 · 9:00 AM"
export function formatWhenLabel(due: Date, now: Date = new Date()): string {
  const startOf = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOf(due) - startOf(now)) / DAY_MS);
  const time = formatTime(due);
  if (dayDiff === 0) return `Today · ${time}`;
  if (dayDiff === 1) return `Tomorrow · ${time}`;
  if (dayDiff > 1 && dayDiff < 7) return `${WEEKDAYS[due.getDay()]} · ${time}`;
  const datePart = `${due.getDate()} ${MONTHS[due.getMonth()]}${due.getFullYear() !== now.getFullYear() ? ` ${due.getFullYear()}` : ''}`;
  return `${datePart} · ${time}`;
}

// Seconds from `now` until `due` (≥ 1) — for scheduling the local OS notification.
export function secondsUntil(due: Date, now: Date = new Date()): number {
  return Math.max(1, Math.round((due.getTime() - now.getTime()) / 1000));
}

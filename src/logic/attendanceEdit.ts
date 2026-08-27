import type { AttendanceHistoryEntry } from '../api/attendance';

// Pure helpers behind the super-admin "edit check-in / check-out" sheet (app/attendance.tsx).
// Times are edited on the DEVICE's clock — the clock every time in this app is displayed in — and
// sent to the server as ISO instants, so what the admin sees in the wheel is exactly what is saved.

export interface DayTimesDraft {
  inHour: number;
  inMinute: number;
  outHour: number;
  outMinute: number;
  hasOut: boolean; // false = leave the day open ("still in") — today only
}

// The one-tap "mark present" used to write 10:00–19:00; the sheet starts an absent day there.
export const DEFAULT_IN = { hour: 10, minute: 0 } as const;
export const DEFAULT_OUT = { hour: 19, minute: 0 } as const;

// 'YYYY-MM-DD' of an instant on the device clock (matches the screen's own day keys).
export const localDayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Device-clock instant for hh:mm on a 'YYYY-MM-DD' day key.
export function dayInstant(dateKey: string, hour: number, minute: number): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

// Seed the sheet from the day being edited: a recorded punch pre-fills its own times; an absent
// day starts at the defaults. A check-out is assumed unless the day is today and has none yet —
// today is the only day that may stay open (the 10pm sweep closes it).
export function seedDayTimes(entry: Pick<AttendanceHistoryEntry, 'date' | 'inTime' | 'outTime'>, now: Date): DayTimesDraft {
  const inD = entry.inTime ? new Date(entry.inTime) : null;
  const outD = entry.outTime ? new Date(entry.outTime) : null;
  return {
    inHour: inD ? inD.getHours() : DEFAULT_IN.hour,
    inMinute: inD ? inD.getMinutes() : DEFAULT_IN.minute,
    outHour: outD ? outD.getHours() : DEFAULT_OUT.hour,
    outMinute: outD ? outD.getMinutes() : DEFAULT_OUT.minute,
    hasOut: outD ? true : entry.date !== localDayKey(now),
  };
}

export type DayTimesResult =
  | { ok: true; checkInAt: string; checkOutAt: string | null }
  | { ok: false; error: string };

// The request body for the draft — or the reason it can't be saved yet. Mirrors the server's
// bounds (resolveAdminTimes) so the sheet explains the problem instead of bouncing off a 400.
export function buildDayTimes(dateKey: string, draft: DayTimesDraft, now: Date): DayTimesResult {
  const inAt = dayInstant(dateKey, draft.inHour, draft.inMinute);
  if (inAt.getTime() > now.getTime()) return { ok: false, error: 'Check-in can’t be in the future' };
  if (!draft.hasOut) {
    if (dateKey !== localDayKey(now)) return { ok: false, error: 'A past day needs a check-out time' };
    return { ok: true, checkInAt: inAt.toISOString(), checkOutAt: null };
  }
  const outAt = dayInstant(dateKey, draft.outHour, draft.outMinute);
  if (outAt.getTime() <= inAt.getTime()) return { ok: false, error: 'Check-out must be after check-in' };
  if (outAt.getTime() > now.getTime()) return { ok: false, error: 'Check-out can’t be in the future' };
  return { ok: true, checkInAt: inAt.toISOString(), checkOutAt: outAt.toISOString() };
}

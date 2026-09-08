// Pure helpers behind the paid-leave screen (app/hr/leave.tsx). Client-side mirrors of the
// server's leave-application bounds, so the form explains a problem instead of bouncing off a
// 400 — the server (and ultimately the ERP) stays the gate.

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_SPAN_DAYS = 31;
export const MAX_BACK_DAYS = 62;
export const MAX_AHEAD_DAYS = 370;

/** Pure: shift a 'YYYY-MM-DD' key by n days (UTC arithmetic on the key alone). */
export function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Pure: days in [from..to] inclusive (0 when malformed/reversed). ISO keys — string compare. */
export function spanCount(from: string, to: string): number {
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) return 0;
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** Pure: why this draft can't be submitted yet — or null when it can. Mirrors the server. */
export function leaveDraftError(draft: { from: string; to: string; reason: string }, today: string): string | null {
  if (!DAY_RE.test(draft.from)) return 'Pick the first day of the leave';
  if (!DAY_RE.test(draft.to)) return 'Pick the last day of the leave';
  if (draft.to < draft.from) return 'The last day can’t be before the first';
  if (!draft.reason.trim()) return 'Say why — the reason goes to HR';
  if (spanCount(draft.from, draft.to) > MAX_SPAN_DAYS) return `One application covers at most ${MAX_SPAN_DAYS} days`;
  if (draft.from < shiftDay(today, -MAX_BACK_DAYS)) return 'That is too far back — ask HR to record it';
  if (draft.to > shiftDay(today, MAX_AHEAD_DAYS)) return 'That is more than a year ahead';
  return null;
}

/** 'YYYY-MM-DD' → 'Mon 14 Sep' (device locale) for compact display. */
export function dayLabel(key: string): string {
  if (!DAY_RE.test(key)) return key;
  return new Date(`${key}T00:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

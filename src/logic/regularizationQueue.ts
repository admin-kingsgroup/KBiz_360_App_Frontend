// The approved Time-corrections queue groups requests under the person who asked, so a reviewer
// decides one colleague's week at a time instead of hopping between names down a flat list. That
// grouping, the ageing label and the month filter are pure so they can be argued about in tests
// (src/__tests__/regularizationQueue.test.ts) rather than by staring at a list.

/** The subset of a Regularization this module needs — keeps it usable from tests without fixtures. */
export interface QueueRow {
  id: string;
  userId: string;
  date: string; // 'YYYY-MM-DD'
  appliedAt: string; // ISO
  name?: string;
  branch?: string;
}

export interface PersonGroup<T extends QueueRow> {
  userId: string;
  name: string;
  branch: string;
  rows: T[];
}

/**
 * Group by person, keeping the SERVER's ordering: the first time a person appears fixes where their
 * block sits, and their requests stay in the order they arrived. The server sorts the pending queue
 * oldest-first, so the longest-waiting person stays at the top — re-sorting here would quietly undo
 * that and bury the request that has waited longest.
 */
export function groupByPerson<T extends QueueRow>(rows: T[]): PersonGroup<T>[] {
  const out: PersonGroup<T>[] = [];
  const byUser = new Map<string, PersonGroup<T>>();
  for (const r of rows) {
    let g = byUser.get(r.userId);
    if (!g) {
      g = { userId: r.userId, name: r.name ?? 'Unknown', branch: r.branch ?? '', rows: [] };
      byUser.set(r.userId, g);
      out.push(g);
    }
    g.rows.push(r);
  }
  return out;
}

/** Whole days between `iso` and `now`, floored at 0 — a clock skew must not read "-1 days ago". */
export function daysAgo(iso: string, now: Date = new Date()): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/** "today" / "yesterday" / "N days ago" — the age chip's text. */
export function ageLabel(iso: string, now: Date = new Date()): string {
  const d = daysAgo(iso, now);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

// A request that has waited this long is the one the queue exists to surface, so its chip turns
// amber. Below it the wait is ordinary and the chip stays grey — colour has to mean something.
export const STALE_AFTER_DAYS = 10;
export const isStale = (iso: string, now: Date = new Date()): boolean => daysAgo(iso, now) >= STALE_AFTER_DAYS;

/** 'YYYY-MM' keys present in the loaded rows, newest first — the month filter's options. */
export function monthsOf(rows: QueueRow[]): string[] {
  return [...new Set(rows.map((r) => r.date.slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort().reverse();
}

/** "Sep 2026" for a 'YYYY-MM' key. */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${y}`;
}

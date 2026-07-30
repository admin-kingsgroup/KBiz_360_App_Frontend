// Pending-exit marker — the instant the OS FIRST detected a geofence boundary exit that has not
// been resolved into an accepted check-out yet. The punch itself often can't fire at that moment
// (no GPS fix in a pocket/car, fix too coarse to confirm, network down, Doze deferring the
// reconcile for hours) — and the server stamps checkOutAt when the punch ARRIVES, so every such
// delay used to be recorded as a late checkout. The marker bridges that gap: when a later punch
// finally succeeds it carries the marker as `exitAt` and the server back-dates the check-out to
// the real departure instant (bounded server-side: same business day, after check-in, not future).
//
// Semantics:
//   - EARLIEST wins: repeated Exit noise after the real departure must not push the time later.
//   - Any evidence of being AT the office refutes the marker → clear it. Callers do this on: an
//     OS Enter event, a fresh fix INSIDE a fence, a successful check-in, foreground presence.
//   - An accepted punch (either direction) resolves the marker → clear it.
//   - Markers expire after MAX_AGE_MS (peek discards them) — a marker that old belongs to a day
//     the server would refuse to back-date into anyway.
//
// AsyncStorage is lazy-required exactly like the rest of the headless services: this module runs
// in the cold-start geofence task where no React tree exists, and must never crash Expo Go.
const KEY = 'kb360-pending-exit-at';
const MAX_AGE_MS = 18 * 60 * 60 * 1000; // stale markers can only belong to an already-lost day

type AS = typeof import('@react-native-async-storage/async-storage').default;
function storage(): AS {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@react-native-async-storage/async-storage') as typeof import('@react-native-async-storage/async-storage')).default;
}

// Record "the OS saw a boundary exit at `at`" (default: now). Keeps the EARLIEST live marker.
export async function notePendingExit(at: Date = new Date()): Promise<void> {
  try {
    const AS = storage();
    const cur = await AS.getItem(KEY);
    const curT = cur ? new Date(cur).getTime() : NaN;
    if (Number.isFinite(curT) && Date.now() - curT <= MAX_AGE_MS && curT <= at.getTime()) return; // earlier live marker stands
    await AS.setItem(KEY, at.toISOString());
  } catch { /* best-effort — without a marker the checkout just stamps arrival time (old behaviour) */ }
}

// The live marker's ISO instant, or null. Does NOT clear — the caller clears only after the
// punch that consumed it is actually accepted (a cleared-but-failed punch would lose the instant).
export async function peekPendingExit(): Promise<string | null> {
  try {
    const AS = storage();
    const v = await AS.getItem(KEY);
    if (!v) return null;
    const t = new Date(v).getTime();
    if (!Number.isFinite(t) || Date.now() - t > MAX_AGE_MS) { await AS.removeItem(KEY); return null; }
    return v;
  } catch { return null; }
}

export async function clearPendingExit(): Promise<void> {
  try { await storage().removeItem(KEY); } catch { /* best-effort */ }
}

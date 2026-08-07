// Jump-to-date (the calendar in the in-chat search, like WhatsApp's).
//
// Mongo ObjectIds embed their creation second in the first 4 bytes and the server's existing
// `?after=<id>` cursor is a plain `_id $gt` returning ascending — so a SYNTHETIC id built from a
// local date works as "give me the first message on/after this instant" with no backend change.

export const objectIdForTime = (ms: number): string =>
  Math.max(0, Math.floor(ms / 1000)).toString(16).padStart(8, '0') + '0000000000000000';

/** First message created on/after `ms` in a chronological (oldest→newest) list. */
export function firstOnOrAfter<T extends { createdAt: string }>(list: T[], ms: number): T | null {
  for (const m of list) {
    if (new Date(m.createdAt).getTime() >= ms) return m;
  }
  return null;
}

/** Of two candidates (either may be missing), the one closer to the target day's start. */
export function earlierCandidate<T extends { createdAt: string }>(a: T | null, b: T | null): T | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a.createdAt).getTime() <= new Date(b.createdAt).getTime() ? a : b;
}

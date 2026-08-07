// In-chat search combines three sources of matches: what is loaded in memory (includes optimistic
// just-sent rows), the device's own message database (full local history), and the server's index
// (history this device never downloaded). This merges them into the one list the ↑/↓ steppers walk.
//
// Every source is re-filtered against the CURRENT query — debounced async results can arrive for a
// query the user has already typed past, and re-filtering makes a stale-but-matching row harmless
// while a stale non-match simply drops out.

interface SearchableMessage {
  id: string;
  text: string;
  createdAt: string;
  deletedForEveryone: boolean;
}

export function mergeSearchHits<T extends SearchableMessage>(query: string, ...sources: T[][]): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const source of sources) {
    for (const m of source) {
      if (m.deletedForEveryone || seen.has(m.id)) continue;
      if (!(m.text ?? '').toLowerCase().includes(q)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  // Newest first — the order the steppers walk (↑ = older). Id tiebreak keeps the walk stable when
  // two messages share a millisecond.
  return out.sort((a, b) => {
    const d = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (d !== 0) return d;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

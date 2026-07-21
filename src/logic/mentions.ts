// @-mention parsing for the reminder composer: while typing, the token the caret sits inside
// ("@har") becomes a people-suggestion query; picking someone rewrites that token to "@Harshit Jha "
// AND assigns the reminder to them. Pure string math — no RN, no store.

export interface ActiveMention {
  query: string; // what the user has typed after the '@' (may be empty)
  start: number; // index OF the '@'
  end: number;   // exclusive end = the caret
}

// A mention query never runs past this; beyond it the user is writing prose, not picking a person.
const MAX_QUERY = 32;
const isSpace = (c: string): boolean => /\s/.test(c);

// The open @-token the caret is currently inside, or null. An '@' only opens a mention at a word
// boundary, so "mail me at anu@kingsgroupco.com" never turns into a picker.
export function activeMention(text: string, cursor: number): ActiveMention | null {
  if (cursor < 0 || cursor > text.length) return null;
  for (let i = cursor - 1; i >= 0 && cursor - i <= MAX_QUERY + 1; i--) {
    const ch = text[i];
    if (isSpace(ch)) return null; // hit whitespace before any '@' → no open mention
    if (ch !== '@') continue;
    const before = i > 0 ? text[i - 1] : '';
    if (before && !isSpace(before)) return null; // mid-word '@' (an email address)
    return { query: text.slice(i + 1, cursor), start: i, end: cursor };
  }
  return null;
}

// Replace the open token with the picked name. Returns the new text and where the caret goes
// (after the trailing space, so the user keeps typing their sentence).
export function applyMention(text: string, m: ActiveMention, name: string): { text: string; cursor: number } {
  const inserted = `@${name} `;
  return { text: text.slice(0, m.start) + inserted + text.slice(m.end), cursor: m.start + inserted.length };
}

// People matching the query, name-start matches first (typing "ja" surfaces "Jaydeep" above
// "Harshit Jha"). Empty query = the top of the list, so a bare "@" already shows the team.
export function rankMentionMatches<T extends { name: string }>(people: T[], query: string, limit = 6): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return people.slice(0, limit);
  return people
    .map((p) => ({ p, at: p.name.toLowerCase().indexOf(q) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at) // stable: ties keep directory order
    .slice(0, limit)
    .map((x) => x.p);
}

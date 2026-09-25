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

// ── chat-message mentions (matching "@Name" tokens against a member roster) ──

// The group-wide mention token ("@everyone", WhatsApp-style). Pure client-side sugar: the composer
// expands it to EVERY member's id at send time (admin-gated in the UI); the backend just sees a
// full mentions array. Bubbles highlight the token via splitMentions like any other name.
export const MENTION_EVERYONE = 'everyone';

// True when the text carries a clean "@everyone" token (same word-boundary rules as name mentions,
// case-insensitive — "me@everyone.com" or "@everyoneelse" never count).
export const hasEveryoneMention = (text: string): boolean =>
  splitMentions(text, [MENTION_EVERYONE]).some((s) => s.mention);

export interface MentionSegment { text: string; mention: boolean }

const boundaryBefore = (text: string, i: number): boolean => i === 0 || isSpace(text[i - 1]);
// The token must END cleanly too, so a member named "Al" never lights up inside "@Albert".
const boundaryAfter = (text: string, end: number): boolean => end >= text.length || !/[A-Za-z0-9]/.test(text[end]);

// Split message text into plain / mention segments for rendering. `names` is the roster of
// mentionable display names; matching is case-insensitive and longest-name-first, so
// "@Harshit Jha" wins over a member named "Harshit". Concatenating segments reproduces the input.
export function splitMentions(text: string, names: string[]): MentionSegment[] {
  const ranked = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!text || !ranked.length || !text.includes('@')) return [{ text, mention: false }];
  const lower = text.toLowerCase();
  const out: MentionSegment[] = [];
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@' || !boundaryBefore(text, i)) continue;
    const name = ranked.find((n) => lower.startsWith(n.toLowerCase(), i + 1) && boundaryAfter(text, i + 1 + n.length));
    if (!name) continue;
    if (i > last) out.push({ text: text.slice(last, i), mention: false });
    out.push({ text: text.slice(i, i + 1 + name.length), mention: true });
    last = i + 1 + name.length;
    i = last - 1;
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: false });
  return out.length ? out : [{ text, mention: false }];
}

// The ids whose "@Name" token appears in the text — computed at SEND time so the server gets a
// mentions array without the composer having to track picker state (manually typed exact names
// count too). Duplicate display names resolve to the first roster entry.
export function mentionIdsInText<T extends { id: string; name: string }>(text: string, people: T[]): string[] {
  const byName = new Map<string, string>();
  for (const p of people) { const k = p.name?.toLowerCase(); if (k && !byName.has(k)) byName.set(k, p.id); }
  const ids: string[] = [];
  for (const seg of splitMentions(text, people.map((p) => p.name))) {
    if (!seg.mention) continue;
    const id = byName.get(seg.text.slice(1).toLowerCase());
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
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

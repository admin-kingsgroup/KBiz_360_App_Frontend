// WhatsApp-style linkification for message text: split a string into plain segments and tappable
// URL segments. Pure — no RN imports — so the matching rules are unit-testable.
//
// What counts as a link: explicit http(s) URLs, www.-prefixed hosts, and bare domains with a
// common TLD ("kbiz360.duckdns.org", "example.com/path"). Sentence punctuation immediately after
// a URL ("see x.com.", "(x.com)") stays plain text. Email addresses are NOT linkified — the bare
// domain after "@" reads as part of the address, not a site.

export interface TextSegment {
  text: string;        // exactly what to render (concatenating all segments reproduces the input)
  url: string | null;  // openable https URL for link segments, null for plain text
}

const TLDS = 'com|net|org|io|in|co|app|dev|ai|me|info|biz|xyz|uk|us|ca|au|ae|pk|ke|tz|cd';
const URL_RE = new RegExp(
  'https?://[^\\s]+' +
  '|www\\.[^\\s]+\\.[^\\s]+' +
  `|[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})(?:/[^\\s]*)?`,
  'gi',
);

// Sentence punctuation peeled off the end of a match. Closers ( ) ] } are only peeled when
// unbalanced, so a Wikipedia-style "…/Foo_(bar)" keeps its final ")".
const PUNCT = '.,;:!?…\'"”’';
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
function trimTrailing(match: string): string {
  let u = match;
  for (;;) {
    const ch = u[u.length - 1];
    if (PUNCT.includes(ch)) { u = u.slice(0, -1); continue; }
    const opener = CLOSERS[ch];
    if (opener) {
      const opens = u.split(opener).length - 1;
      const closes = u.split(ch).length - 1;
      if (closes > opens) { u = u.slice(0, -1); continue; }
    }
    break;
  }
  return u;
}

export const linkTarget = (raw: string): string => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);

export function splitLinks(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  for (let m = URL_RE.exec(text); m; m = URL_RE.exec(text)) {
    const url = trimTrailing(m[0]);
    if (!url) continue;
    // A bare domain right after "@" is an email address, not a link.
    const isEmail = !/^(https?:\/\/|www\.)/i.test(url) && text[m.index - 1] === '@';
    if (!isEmail) {
      if (m.index > last) out.push({ text: text.slice(last, m.index), url: null });
      out.push({ text: url, url: linkTarget(url) });
      last = m.index + url.length;
    }
    // Re-scan right after the (possibly trimmed) match so peeled punctuation stays plain text.
    URL_RE.lastIndex = m.index + Math.max(url.length, 1);
  }
  if (last < text.length) out.push({ text: text.slice(last), url: null });
  return out.length ? out : [{ text, url: null }];
}

// Cheap pre-check so callers can skip the segment render entirely for link-less messages.
export const hasLink = (text: string): boolean => splitLinks(text).some((s) => s.url);

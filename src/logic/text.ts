import { stripFormatting } from './formatting';

// One-line rendering of a multi-line message for the places WhatsApp shows a single line — the
// chat-list preview, the "Draft:" line and the reply quote. Message bodies keep their newlines
// everywhere else (bullet lists, one sentence per line…); but a `numberOfLines={1}` Text cuts at
// the FIRST newline with no ellipsis, so "• Point one\n• Point two" would preview as just
// "• Point one". Folding the breaks into spaces lets the whole message be what gets truncated.
// WhatsApp markup (*bold* etc.) is stripped first — previews show the words, not the markers.
export function oneLine(text: string): string {
  return stripFormatting(text).replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

import type { Email, EmailAddress, EmailFolder } from '../types';

// Pure email helpers — no RN/store imports, fully unit-testable.

// Escape text so it's safe to embed inside an HTML email body.
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Rough HTML → readable plain text. Used when a stored draft body is HTML but we need to edit it in
// the plain-text composer (so the user sees clean text, not tag soup).
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ReplyParts { body: string; bodyType: 'html' | 'text' }

// Build a reply/forward body that QUOTES the original. When the original is HTML we send HTML (the
// user's typed text on top, escaped, then the original embedded in a blockquote) so the quote keeps
// its formatting instead of showing raw tags. Plain originals stay plain text.
export function buildReplyBody({ userText, original, mode }: { userText: string; original: Email; mode: 'reply' | 'replyAll' | 'forward' }): ReplyParts {
  const header = mode === 'forward' ? '---------- Forwarded message ----------' : '---------- Original message ----------';
  const fromLine = `From: ${original.from.name || original.from.email}${original.from.email ? ` <${original.from.email}>` : ''}`;
  const subjLine = `Subject: ${original.subject}`;
  const toLine = original.to.length ? `To: ${original.to.map((a) => a.name || a.email).join(', ')}` : '';
  const metaLines = [header, fromLine, ...(toLine ? [toLine] : []), subjLine];

  if (original.bodyType === 'html') {
    const meta = metaLines.map(escapeHtml).join('<br>');
    const top = escapeHtml(userText).replace(/\n/g, '<br>');
    return {
      bodyType: 'html',
      body: `<div>${top}</div><br><div style="color:#666;font-size:13px">${meta}</div><blockquote style="margin:0 0 0 8px;padding-left:10px;border-left:2px solid #ccc">${original.body}</blockquote>`,
    };
  }
  return { bodyType: 'text', body: `${userText}\n\n${metaLines.join('\n')}\n\n${original.body}` };
}

// Folder contents, newest first.
export function emailsInFolder(emails: Email[], folder: EmailFolder): Email[] {
  return emails.filter((e) => e.folder === folder).sort((a, b) => b.ts - a.ts);
}

// Case-insensitive search across sender, subject, preview and body.
export function searchEmails(emails: Email[], query: string): Email[] {
  const q = query.trim().toLowerCase();
  if (!q) return emails;
  return emails.filter((e) =>
    e.subject.toLowerCase().includes(q) ||
    e.from.name.toLowerCase().includes(q) ||
    e.from.email.toLowerCase().includes(q) ||
    e.preview.toLowerCase().includes(q) ||
    e.body.toLowerCase().includes(q),
  );
}

// Unread count for a folder (drives the Inbox tab badge).
export function unreadCount(emails: Email[], folder: EmailFolder): number {
  return emails.reduce((n, e) => n + (e.folder === folder && !e.read ? 1 : 0), 0);
}

// Parse a raw recipient string ("a@x.com, b@y.com; c@z.com") into addresses.
export function parseRecipients(raw: string): EmailAddress[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((email) => ({ email, name: email.split('@')[0] }));
}

// Initials for an avatar from a display name or email local-part.
export function initialsOf(addr: EmailAddress): string {
  const base = addr.name?.trim() || addr.email.split('@')[0];
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? base[0] ?? '?';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}

// Short, mail-app-style timestamp relative to `now`.
export function relativeTime(ts: number, now: number): string {
  const d = new Date(ts);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (sameDay) {
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((startToday.getTime() - d.getTime()) / dayMs);
  if (diffDays < 1) return 'Yesterday';
  if (diffDays < 6) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`;
}

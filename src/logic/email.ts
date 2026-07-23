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
// its formatting instead of showing raw tags. Plain originals stay plain text — unless a
// signatureHtml is provided, which upgrades the whole message to HTML (typed text escaped, quote
// escaped into the same blockquote) so the branded signature renders between the text and the quote.
export function buildReplyBody({ userText, original, mode, signatureHtml }: { userText: string; original: Email; mode: 'reply' | 'replyAll' | 'forward'; signatureHtml?: string }): ReplyParts {
  const header = mode === 'forward' ? '---------- Forwarded message ----------' : '---------- Original message ----------';
  const fromLine = `From: ${original.from.name || original.from.email}${original.from.email ? ` <${original.from.email}>` : ''}`;
  const subjLine = `Subject: ${original.subject}`;
  const toLine = original.to.length ? `To: ${original.to.map((a) => a.name || a.email).join(', ')}` : '';
  const metaLines = [header, fromLine, ...(toLine ? [toLine] : []), subjLine];

  if (original.bodyType === 'html' || signatureHtml) {
    const meta = metaLines.map(escapeHtml).join('<br>');
    const top = escapeHtml(userText).replace(/\n/g, '<br>');
    const quoted = original.bodyType === 'html' ? original.body : escapeHtml(original.body).replace(/\n/g, '<br>');
    return {
      bodyType: 'html',
      body: `<div>${top}</div>${signatureHtml ?? ''}<br><div style="color:#666;font-size:13px">${meta}</div><blockquote style="margin:0 0 0 8px;padding-left:10px;border-left:2px solid #ccc">${quoted}</blockquote>`,
    };
  }
  return { bodyType: 'text', body: `${userText}\n\n${metaLines.join('\n')}\n\n${original.body}` };
}

// A brand-new outgoing message: with a signature the mail goes out as HTML (typed text escaped on
// top, branded signature below); without one it stays plain text exactly as before.
export function buildNewBody(userText: string, signatureHtml?: string): ReplyParts {
  if (!signatureHtml) return { body: userText, bodyType: 'text' };
  return { bodyType: 'html', body: `<div>${escapeHtml(userText).replace(/\n/g, '<br>')}</div>${signatureHtml}` };
}

// Plain-text summary of the signature — shown as the composer's preview card (the real appended
// signature is the branded HTML from buildSignatureHtml below; Graph does not expose the user's
// Outlook client signature, so the app provides its own).
export function buildSignature(u: { name?: string | null; position?: string | null; roleName?: string | null; email?: string | null; phone?: string | null } | null | undefined): string {
  if (!u?.name) return '';
  const lines = [
    'Best regards,',
    u.name,
    u.position || u.roleName || '',
    'Travkings Tours & Travels Pvt. Ltd.',
    u.email || '',
  ].filter(Boolean);
  return lines.join('\n');
}

// Branded HTML signature appended to every outgoing mail (send-time, not typed into the editor) —
// a faithful, email-safe recreation of the official Travkings signature banner: name/title/email
// on the left, the Travkings logo right, the country strip, the Mumbai HQ address and the
// socials/phone column. The logo is referenced as `cid:tk-sig-logo`; the backend attaches the
// image bytes INLINE on send (same mechanism Outlook uses), so it renders in every mail client.
// FLAT markup only — one table, no nested <div>/<table> — so stripSignatureHtml's non-greedy
// regex can remove each `kb360-sig` block cleanly. Gold accent matches the Travkings brand.
const SIG_GOLD = '#B08D3E';
export const SIG_LOGO_CID = 'tk-sig-logo';
export function buildSignatureHtml(u: { name?: string | null; position?: string | null; roleName?: string | null; email?: string | null; phone?: string | null } | null | undefined): string {
  if (!u?.name) return '';
  const title = u.position || u.roleName || '';
  const font = 'font-family:Arial,Helvetica,sans-serif';
  return (
    `<div class="kb360-sig" style="margin-top:28px;${font};font-size:13.5px;color:#444">Best regards,</div>` +
    `<table class="kb360-sig" cellpadding="0" cellspacing="0" border="0" width="620" style="margin-top:10px;${font};border-collapse:collapse;max-width:620px">` +
    `<tr>` +
    `<td style="vertical-align:top;padding:0">` +
    `<span style="font-size:16px;font-weight:bold;color:#111;letter-spacing:0.5px">${escapeHtml(u.name.toUpperCase())}</span><br>` +
    (title ? `<span style="font-size:11.5px;color:#333">${escapeHtml(title)}</span><br>` : '') +
    (u.email ? `<span style="font-size:10.5px;color:#444;border-bottom:2px solid ${SIG_GOLD};padding-bottom:2px">${escapeHtml(u.email)}</span>` : '') +
    `</td>` +
    `<td style="vertical-align:top;text-align:right;padding:0"><img src="cid:${SIG_LOGO_CID}" width="220" alt="Travkings Tours &amp; Travels Pvt. Ltd." style="border:0;max-width:220px;height:auto"></td>` +
    `</tr>` +
    `<tr><td colspan="2" style="padding:14px 0 6px 0;border-bottom:1px solid ${SIG_GOLD}"><span style="font-size:11px;font-weight:bold;color:#111;letter-spacing:1.5px">INDIA&nbsp;&nbsp;&nbsp;&nbsp;D.R.CONGO&nbsp;&nbsp;&nbsp;&nbsp;KENYA&nbsp;&nbsp;&nbsp;&nbsp;TANZANIA&nbsp;&nbsp;&nbsp;&nbsp;DUBAI</span></td></tr>` +
    `<tr>` +
    `<td style="padding:8px 0 0 0;vertical-align:top"><span style="font-size:10.5px;color:#333;line-height:1.5">Venus Tower, B wing 603, Azad Nagar 2, Veera Desai Road,<br>Mhada Colony, Andheri West, Mumbai, Maharashtra 400053</span></td>` +
    `<td style="padding:8px 0 0 0;vertical-align:top;text-align:right"><span style="font-size:10.5px;color:#333;line-height:1.7">@travkings<br><a href="https://www.travkings.com" style="color:#333;text-decoration:none">www.travkings.com</a><br>+91 8828149960</span></td>` +
    `</tr>` +
    `</table>`
  );
}

// Remove the app-added signature blocks from an HTML body (used when resuming a draft into the
// plain-text editor, so the signature isn't editable text that would then be appended twice).
export function stripSignatureHtml(html: string): string {
  return html.replace(/\s*<(div|table)[^>]*class="kb360-sig"[\s\S]*?<\/\1>/g, '');
}

// Search view = server results (Graph $search spans the whole mailbox) UNIONED with client-side
// matches of already-loaded mail. The union matters twice over: while the server round-trip is in
// flight typing feels instant, and when Graph errors/misses (partial words, transient failures)
// locally loaded matches still show instead of a false "No matching mail".
export function mergeSearchResults(server: Email[], clientMatches: Email[]): Email[] {
  const seen = new Set(server.map((e) => e.id));
  return [...server, ...clientMatches.filter((e) => !seen.has(e.id))];
}

// Folder contents, newest first. Mail stamped with a graphFolderId lives in a USER folder — it's
// cached in the same array for offline reading but is NOT part of any standard folder's view.
export function emailsInFolder(emails: Email[], folder: EmailFolder): Email[] {
  return emails.filter((e) => e.folder === folder && !e.graphFolderId).sort((a, b) => b.ts - a.ts);
}

// Case-insensitive search across sender, subject and preview. Deliberately NOT the full body:
// loaded bodies can be multi-MB HTML (inlined images), and lowercasing them for every message on
// every keystroke froze the search box — full-content matching is the server's job (Graph $search,
// merged in via mergeSearchResults).
export function searchEmails(emails: Email[], query: string): Email[] {
  const q = query.trim().toLowerCase();
  if (!q) return emails;
  return emails.filter((e) =>
    e.subject.toLowerCase().includes(q) ||
    e.from.name.toLowerCase().includes(q) ||
    e.from.email.toLowerCase().includes(q) ||
    e.preview.toLowerCase().includes(q),
  );
}

// Unread count for a folder (drives the Inbox tab badge).
export function unreadCount(emails: Email[], folder: EmailFolder): number {
  return emails.reduce((n, e) => n + (e.folder === folder && !e.graphFolderId && !e.read ? 1 : 0), 0);
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

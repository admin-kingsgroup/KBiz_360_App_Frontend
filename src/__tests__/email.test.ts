import { emailsInFolder, searchEmails, unreadCount, parseRecipients, initialsOf, relativeTime, escapeHtml, htmlToText, buildReplyBody } from '../logic/email';
import type { Email } from '../types';

const base = (over: Partial<Email>): Email => ({
  id: 'x', folder: 'inbox', from: { name: 'A B', email: 'a@x.com' }, to: [{ name: 'Me', email: 'me@x.com' }],
  subject: 'Hello', preview: 'hi there', body: 'body text', ts: 0, read: false, color: '#000', ...over,
});

describe('email logic', () => {
  const emails: Email[] = [
    base({ id: '1', folder: 'inbox', subject: 'April MIS', ts: 300, read: false }),
    base({ id: '2', folder: 'inbox', subject: 'Refund', ts: 100, read: true }),
    base({ id: '3', folder: 'sent', subject: 'Re: April MIS', ts: 200, read: true }),
    base({ id: '4', folder: 'deleted', subject: 'Digest', ts: 50, read: true }),
  ];

  it('emailsInFolder filters and sorts newest first', () => {
    expect(emailsInFolder(emails, 'inbox').map((e) => e.id)).toEqual(['1', '2']);
    expect(emailsInFolder(emails, 'sent').map((e) => e.id)).toEqual(['3']);
  });

  it('searchEmails matches subject case-insensitively', () => {
    expect(searchEmails(emails, 'april').map((e) => e.id).sort()).toEqual(['1', '3']);
    expect(searchEmails(emails, '').length).toBe(emails.length);
  });

  it('unreadCount counts only unread in the folder', () => {
    expect(unreadCount(emails, 'inbox')).toBe(1);
    expect(unreadCount(emails, 'sent')).toBe(0);
  });

  it('parseRecipients splits on comma/semicolon and trims', () => {
    expect(parseRecipients('a@x.com, b@y.com; c@z.com')).toEqual([
      { email: 'a@x.com', name: 'a' },
      { email: 'b@y.com', name: 'b' },
      { email: 'c@z.com', name: 'c' },
    ]);
    expect(parseRecipients('   ')).toEqual([]);
  });

  it('initialsOf derives initials from name then email', () => {
    expect(initialsOf({ name: 'Faiz Khan', email: 'faiz@x.com' })).toBe('FK');
    expect(initialsOf({ name: '', email: 'mehul@x.com' })).toBe('M');
  });

  it('relativeTime: same day shows time, prior day shows Yesterday', () => {
    const now = new Date('2026-06-11T15:00:00').getTime();
    const today = new Date('2026-06-11T09:05:00').getTime();
    const yest = new Date('2026-06-10T09:05:00').getTime();
    expect(relativeTime(today, now)).toBe('9:05 AM');
    expect(relativeTime(yest, now)).toBe('Yesterday');
  });

  it('escapeHtml escapes the dangerous characters', () => {
    expect(escapeHtml('<b>Tom & "Jerry"</b>')).toBe('&lt;b&gt;Tom &amp; "Jerry"&lt;/b&gt;');
  });

  it('htmlToText strips tags, drops style/script, keeps line breaks', () => {
    const html = '<p>Hello</p><div>World</div>Bye<script>x()</script>';
    expect(htmlToText(html)).toBe('Hello\nWorld\nBye');
    expect(htmlToText('<style>p{color:red}</style>Visible')).toBe('Visible');
    expect(htmlToText('A&nbsp;&amp;&nbsp;B')).toBe('A & B');
  });

  it('buildReplyBody quotes a plain-text original as text', () => {
    const original = base({ subject: 'Q3 numbers', body: 'see attached', bodyType: 'text', from: { name: 'Faiz', email: 'faiz@x.com' } });
    const { body, bodyType } = buildReplyBody({ userText: 'Thanks!', original, mode: 'reply' });
    expect(bodyType).toBe('text');
    expect(body).toContain('Thanks!');
    expect(body).toContain('---------- Original message ----------');
    expect(body).toContain('From: Faiz <faiz@x.com>');
    expect(body).toContain('see attached');
  });

  it('buildReplyBody quotes an HTML original as HTML in a blockquote (no raw tags leaking from user text)', () => {
    const original = base({ subject: 'Invoice', body: '<p>Please pay</p>', bodyType: 'html', from: { name: 'Acct', email: 'ar@x.com' } });
    const { body, bodyType } = buildReplyBody({ userText: 'Got it <thanks>', original, mode: 'forward' });
    expect(bodyType).toBe('html');
    expect(body).toContain('Got it &lt;thanks&gt;'); // user text escaped
    expect(body).toContain('<blockquote');
    expect(body).toContain('<p>Please pay</p>'); // original HTML preserved
    expect(body).toContain('---------- Forwarded message ----------');
  });
});

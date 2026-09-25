import { emailsInFolder, searchEmails, unreadCount, parseRecipients, initialsOf, relativeTime, escapeHtml, htmlToText, buildReplyBody, buildSignature, buildSignatureHtml, buildNewBody, stripSignatureHtml, mergeSearchResults } from '../logic/email';
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

  it('mail cached from a user folder (graphFolderId) is excluded from standard views and counts', () => {
    const withFolderMail = [...emails, base({ id: '5', folder: 'inbox', graphFolderId: 'gf1', ts: 400, read: false })];
    expect(emailsInFolder(withFolderMail, 'inbox').map((e) => e.id)).toEqual(['1', '2']); // no '5'
    expect(unreadCount(withFolderMail, 'inbox')).toBe(1); // '5' unread but not in inbox
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

  it('buildSignature: full profile → name, title, company, email', () => {
    const sig = buildSignature({ name: 'Sujeet Kumar', position: 'Travel Consultant', email: 'sujeet@travkings.com', phone: '+91 98x' });
    expect(sig).toBe('Best regards,\nSujeet Kumar\nTravel Consultant\nTravkings Tours & Travels Pvt. Ltd.\nsujeet@travkings.com');
  });
  it('buildSignature: falls back to roleName, skips missing fields, empty without a name', () => {
    expect(buildSignature({ name: 'A', roleName: 'Company Manager' })).toBe('Best regards,\nA\nCompany Manager\nTravkings Tours & Travels Pvt. Ltd.');
    expect(buildSignature({ name: 'B' })).toBe('Best regards,\nB\nTravkings Tours & Travels Pvt. Ltd.');
    expect(buildSignature(null)).toBe('');
    expect(buildSignature({ name: '' })).toBe('');
  });

  it('buildSignatureHtml: Travkings banner with uppercased name, title, email, cid logo, countries', () => {
    const sig = buildSignatureHtml({ name: 'Sujeet <K>', position: 'Travel Consultant', email: 'sujeet@travkings.com', phone: '+91 98x' });
    expect(sig).toContain('class="kb360-sig"');
    expect(sig).toContain('SUJEET &lt;K&gt;'); // name uppercased + escaped
    expect(sig).toContain('Travel Consultant');
    expect(sig).toContain('cid:tk-sig-logo'); // logo attached inline by the backend on send
    expect(sig).toContain('INDIA'); // country strip
    expect(sig).toContain('www.travkings.com');
    expect(sig).toContain('sujeet@travkings.com');
    expect(buildSignatureHtml(null)).toBe('');
    expect(buildSignatureHtml({ name: '' })).toBe('');
  });

  it('stripSignatureHtml removes every kb360-sig block and nothing else', () => {
    const sig = buildSignatureHtml({ name: 'A', roleName: 'Manager' });
    const body = `<div>hello</div>${sig}<br><div>quote</div>`;
    const stripped = stripSignatureHtml(body);
    expect(stripped).not.toContain('kb360-sig');
    expect(stripped).toContain('<div>hello</div>');
    expect(stripped).toContain('<div>quote</div>');
    expect(stripSignatureHtml('<div>plain</div>')).toBe('<div>plain</div>');
  });

  it('buildNewBody: plain text without a signature, HTML (escaped text + signature) with one', () => {
    expect(buildNewBody('hi\nthere')).toEqual({ body: 'hi\nthere', bodyType: 'text' });
    const sig = buildSignatureHtml({ name: 'A' });
    const { body, bodyType } = buildNewBody('hi <all>\nteam', sig);
    expect(bodyType).toBe('html');
    expect(body).toContain('hi &lt;all&gt;<br>team');
    expect(body).toContain('kb360-sig');
  });

  it('buildReplyBody with signatureHtml: signature sits between the typed text and the quote', () => {
    const sig = buildSignatureHtml({ name: 'A' });
    const original = base({ subject: 'Inv', body: '<p>Pay</p>', bodyType: 'html', from: { name: 'Acct', email: 'ar@x.com' } });
    const { body, bodyType } = buildReplyBody({ userText: 'Done', original, mode: 'reply', signatureHtml: sig });
    expect(bodyType).toBe('html');
    expect(body.indexOf('Done')).toBeLessThan(body.indexOf('kb360-sig'));
    expect(body.indexOf('kb360-sig')).toBeLessThan(body.indexOf('<blockquote'));
  });

  it('buildReplyBody with signatureHtml upgrades a text original to HTML with an escaped quote', () => {
    const sig = buildSignatureHtml({ name: 'A' });
    const original = base({ subject: 'Q', body: 'line1\nline2 <raw>', bodyType: 'text', from: { name: 'F', email: 'f@x.com' } });
    const { body, bodyType } = buildReplyBody({ userText: 'ok', original, mode: 'reply', signatureHtml: sig });
    expect(bodyType).toBe('html');
    expect(body).toContain('line1<br>line2 &lt;raw&gt;'); // quoted text escaped, breaks kept
    expect(body).toContain('kb360-sig');
  });

  it('mergeSearchResults: server hits first, client-only matches appended, no duplicates', () => {
    const server = [base({ id: 's1' }), base({ id: 'both' })];
    const client = [base({ id: 'both' }), base({ id: 'c1' })];
    expect(mergeSearchResults(server, client).map((e) => e.id)).toEqual(['s1', 'both', 'c1']);
    expect(mergeSearchResults([], client).map((e) => e.id)).toEqual(['both', 'c1']); // server miss/failure → client still shows
  });

  it('searchEmails matches sender name prefix (contact-style search)', () => {
    const mail = [base({ id: 'm1', from: { name: 'Sujeet Kumar Maurya', email: 'sujeet@travkings.com' } }), base({ id: 'm2' })];
    expect(searchEmails(mail, 'sujeet').map((e) => e.id)).toEqual(['m1']);
    expect(searchEmails(mail, 'suj').map((e) => e.id)).toEqual(['m1']);
  });
});

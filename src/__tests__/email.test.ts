import { emailsInFolder, searchEmails, unreadCount, parseRecipients, initialsOf, relativeTime } from '../logic/email';
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
});

import type { ChatConversation } from '../api/chat';
import type { ReminderRecord } from '../data/reminders';
import { buildWidgetSnapshot, chatPreview, type WidgetInputs } from '../logic/widgetSnapshot';
import { toTopItem } from '../store/reminderBadgeStore';

const conv = (over: Partial<ChatConversation>): ChatConversation => ({
  id: 'c', type: 'direct', name: 'Someone', image: null, memberCount: 2, unread: 0, muted: false, archived: false,
  lastMessage: null, lastActivityAt: '2026-10-29T06:00:00.000Z', ...over,
});

const last = (text: string, type = 'text') => ({ messageId: 'm', text, type, senderId: 'u', at: '2026-10-29T06:00:00.000Z' });

const inputs = (over: Partial<WidgetInputs> = {}): WidgetInputs => ({
  userName: 'Anubhav Maurya',
  conversations: [],
  reminders: { count: 0, forMe: 0, top: [] },
  approvals: 0,
  att: { inTime: null, outTime: null, via: null },
  now: 1_761_717_600_000,
  ...over,
});

describe('buildWidgetSnapshot', () => {
  it('counts unread chats like the app badge and lists the newest unmuted ones', () => {
    const s = buildWidgetSnapshot(inputs({
      conversations: [
        conv({ id: 'old', name: 'Old', unread: 1, lastActivityAt: '2026-10-29T05:00:00.000Z', lastMessage: last('hi') }),
        conv({ id: 'new', name: 'MHUB - Branch Accounts', type: 'group', unread: 4, lastActivityAt: '2026-10-29T06:30:00.000Z', lastMessage: last('BSP\nuploaded') }),
        conv({ id: 'muted', unread: 9, muted: true }),
        conv({ id: 'read', unread: 0 }),
      ],
    }));
    expect(s.unreadChats).toBe(2);
    expect(s.unreadMessages).toBe(5);
    expect(s.chats.map((c) => c.id)).toEqual(['new', 'old']);
    expect(s.chats[0]).toMatchObject({ name: 'MHUB - Branch Accounts', preview: 'BSP uploaded', unread: 4, group: true, at: Date.parse('2026-10-29T06:30:00.000Z') });
  });

  it('keeps at most four chats and leaves archived ones off the list (but in the count)', () => {
    const many = Array.from({ length: 6 }, (_, i) => conv({ id: `c${i}`, unread: 1, lastActivityAt: `2026-10-29T0${i}:00:00.000Z` }));
    const s = buildWidgetSnapshot(inputs({ conversations: [...many, conv({ id: 'arch', unread: 2, archived: true })] }));
    expect(s.chats).toHaveLength(4);
    expect(s.chats.some((c) => c.id === 'arch')).toBe(false);
    expect(s.unreadChats).toBe(7);
  });

  it('passes reminders, approvals and the punch through, with epoch times for the widget clock', () => {
    const inTime = new Date('2026-10-29T03:42:00.000Z');
    const s = buildWidgetSnapshot(inputs({
      reminders: { count: 8, forMe: 7, top: [{ id: 'r1', text: 'Send snapshot', when: '', dueAt: 123, by: 'Farhan' }] },
      approvals: 5,
      att: { inTime, outTime: null, via: 'Face' },
    }));
    expect(s).toMatchObject({
      signedIn: true, userName: 'Anubhav Maurya',
      // The widgets' Reminders number = the app's Reminders badge (owner, 2026-10-30), not "for me" alone.
      reminderCount: 8, reminderForMe: 8, approvals: 5,
      attendanceInAt: inTime.getTime(), attendanceOutAt: null, attendanceOut: null,
    });
    expect(s.attendanceIn).toEqual(expect.any(String));
    expect(s.reminders[0].dueAt).toBe(123);
    // Not the Owner: no review fields, so the widget keeps Late.
    expect('review' in s).toBe(false);
    expect('reviewItems' in s).toBe(false);
  });

  it('the Owner: Review count and rows ride along (owner, 2026-10-30)', () => {
    const items = [{ id: 'cr:1', title: 'Payment · Dream Holidays · advance', branch: 'HFBM', amount: '$5,000', at: 1000 }];
    const s = buildWidgetSnapshot(inputs({ review: { count: 3, items } }));
    expect(s.review).toBe(3);
    expect(s.reviewItems).toEqual(items);
    expect(JSON.parse(JSON.stringify(buildWidgetSnapshot(inputs({ review: null }))))).not.toHaveProperty('review');
  });
});

describe('chatPreview', () => {
  it('names media instead of showing an empty line', () => {
    expect(chatPreview(conv({ lastMessage: last('', 'image') }))).toBe('Photo');
    expect(chatPreview(conv({ lastMessage: last('', 'audio') }))).toBe('Voice message');
    expect(chatPreview(conv({ lastMessage: null }))).toBe('');
  });
});

describe('toTopItem', () => {
  const base = { id: 'r', text: 'Do it', section: 'today', forId: 'me', forName: 'Me', state: 'pending' } as ReminderRecord;

  it('turns the ISO due date into epoch ms and names who set it', () => {
    const t = toTopItem({ ...base, byId: 'fa', byName: 'Farhan Aga', dueAt: '2026-10-29T09:30:00.000Z', when: 'Today · 3:00 PM' });
    expect(t).toEqual({ id: 'r', text: 'Do it', when: 'Today · 3:00 PM', dueAt: Date.parse('2026-10-29T09:30:00.000Z'), by: 'Farhan Aga' });
  });

  it('leaves "by" empty for my own reminder and the due time null when missing or invalid', () => {
    expect(toTopItem({ ...base, byId: 'me', byName: 'Me' })).toMatchObject({ by: '', dueAt: null });
    expect(toTopItem({ ...base, byId: 'me', dueAt: 'not a date' }).dueAt).toBeNull();
  });
});

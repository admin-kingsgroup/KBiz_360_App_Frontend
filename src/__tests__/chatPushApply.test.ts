import { applyChatPush, type ChatPushData } from '../logic/chatPushApply';
import type { ChatConversation } from '../api/chat';

const conv = (over: Partial<ChatConversation>): ChatConversation => ({
  id: 'c1',
  type: 'direct',
  name: 'Faiz Patel',
  image: null,
  memberCount: 2,
  unread: 0,
  muted: false,
  archived: false,
  lastMessage: null,
  lastActivityAt: '2026-07-20T10:00:00.000Z',
  ...over,
});

const push = (over: Partial<ChatPushData>): ChatPushData => ({
  conversationId: 'c1',
  messageId: 'm2',
  senderId: 'u9',
  senderName: 'Faiz Patel',
  convType: 'direct',
  preview: 'hello there',
  msgType: 'text',
  sentAt: '2026-07-21T09:00:00.000Z',
  ...over,
});

describe('applyChatPush (background push → persisted snapshot)', () => {
  it('increments unread, sets lastMessage, and resorts the touched conversation to the top', () => {
    const state = [conv({ id: 'other', lastActivityAt: '2026-07-21T08:00:00.000Z' }), conv({ id: 'c1', unread: 2 })];
    const res = applyChatPush(state, push({}));
    expect(res.changed).toBe(true);
    expect(res.conversations[0].id).toBe('c1');
    expect(res.conversations[0].unread).toBe(3);
    expect(res.conversations[0].lastMessage?.text).toBe('hello there');
    expect(res.conversations[0].lastActivityAt).toBe('2026-07-21T09:00:00.000Z');
    // WhatsApp-style badge: 3 unread messages but only 1 chat with unread.
    expect(res.unreadChats).toBe(1);
  });

  it('is idempotent for a redelivered message (same messageId)', () => {
    const first = applyChatPush([conv({})], push({}));
    const second = applyChatPush(first.conversations, push({}));
    expect(second.changed).toBe(false);
    expect(second.conversations[0].unread).toBe(1);
  });

  it('stubs an unknown conversation so it renders on cold open (direct → sender name)', () => {
    const res = applyChatPush([], push({ conversationId: 'new1' }));
    expect(res.changed).toBe(true);
    expect(res.conversations[0]).toMatchObject({ id: 'new1', type: 'direct', name: 'Faiz Patel', unread: 1, otherUserId: 'u9' });
    expect(res.unreadChats).toBe(1);
  });

  it('stubs a group conversation with the group name', () => {
    const res = applyChatPush([], push({ conversationId: 'g1', convType: 'group', convName: 'BOM Ops' }));
    expect(res.conversations[0]).toMatchObject({ id: 'g1', type: 'group', name: 'BOM Ops', unread: 1 });
  });

  it('ignores a payload without a conversationId', () => {
    const res = applyChatPush([conv({ unread: 1 })], push({ conversationId: undefined }));
    expect(res.changed).toBe(false);
    expect(res.unreadChats).toBe(1);
  });

  it('counts chats with unread, not unread messages (two chats, five messages → 2)', () => {
    const state = [conv({ id: 'c1', unread: 4 }), conv({ id: 'c2' })];
    const res = applyChatPush(state, push({ conversationId: 'c2', messageId: 'm9' }));
    expect(res.unreadChats).toBe(2);
  });

  it('excludes muted chats from the badge count (WhatsApp mute semantics)', () => {
    const state = [conv({ id: 'c1', unread: 4, muted: true }), conv({ id: 'c2' })];
    const res = applyChatPush(state, push({ conversationId: 'c2', messageId: 'm9' }));
    expect(res.conversations.find((c) => c.id === 'c2')?.unread).toBe(1);
    expect(res.unreadChats).toBe(1); // muted c1 still holds its unread in the list, but never badges
  });
});

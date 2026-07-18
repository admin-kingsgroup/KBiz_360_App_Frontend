import { useMessagingStore, toEpochMs, type StoredMessage } from '../store/messagingStore';
import type { ChatConversation } from '../api/chat';

const ISO = '2026-07-15T10:00:00.000Z';
const msg = (id: string, over: Partial<StoredMessage> = {}): StoredMessage => ({
  id, conversationId: 'c1', senderId: 'me', type: 'text', text: 'hi',
  deletedForEveryone: false, attachments: [], replyTo: null, forwardedFrom: null, reactions: [],
  status: 'sent', sentAt: ISO, deliveredAt: null, readAt: null, pinned: false, edited: false, editedAt: null,
  createdAt: ISO, mine: true, starred: false, ...over,
});
const conv = (over: Partial<ChatConversation> = {}): ChatConversation => ({
  id: 'c1', type: 'direct', name: 'Riya', image: null, otherUserId: 'u2', memberCount: 2, unread: 0,
  muted: false, archived: false, lastActivityAt: ISO,
  lastMessage: { messageId: 'm2', id: 'm2', text: 'hi', type: 'text', senderId: 'me', at: ISO, status: 'sent' },
  ...over,
});
const msgStatus = (id: string) => useMessagingStore.getState().messages['c1']?.find((m) => m.id === id)?.status;
const lastStatus = () => useMessagingStore.getState().conversations[0]?.lastMessage?.status;

beforeEach(() => {
  useMessagingStore.setState({ myUserId: 'me', conversations: [conv()], messages: { c1: [msg('m1'), msg('m2')] }, presence: {} });
});

describe('messagingStore — receipt events (authoritative statuses + monotonic guard)', () => {
  it('applies the aggregate statuses from the payload (only listed messages change)', () => {
    useMessagingStore.getState().onDelivered({ conversationId: 'c1', by: 'u2', messageIds: ['m1'], at: Date.now(), statuses: [{ id: 'm1', status: 'delivered' }] });
    expect(msgStatus('m1')).toBe('delivered');
    expect(msgStatus('m2')).toBe('sent');
  });

  it('never downgrades: a delivered event arriving after read keeps the read tick', () => {
    useMessagingStore.getState().onRead({ conversationId: 'c1', messageIds: ['m1'], statuses: [{ id: 'm1', status: 'read' }] });
    expect(msgStatus('m1')).toBe('read');
    useMessagingStore.getState().onDelivered({ conversationId: 'c1', messageIds: ['m1'], statuses: [{ id: 'm1', status: 'delivered' }] });
    expect(msgStatus('m1')).toBe('read'); // out-of-order socket delivery must not move a tick down
  });

  it('falls back to messageIds when statuses is absent (legacy payload), still monotonic', () => {
    useMessagingStore.getState().onDelivered({ conversationId: 'c1', messageIds: ['m1'] });
    expect(msgStatus('m1')).toBe('delivered');
    useMessagingStore.getState().onRead({ conversationId: 'c1', messageIds: ['m1'] });
    expect(msgStatus('m1')).toBe('read');
    useMessagingStore.getState().onDelivered({ conversationId: 'c1', messageIds: ['m1'] }); // stale replay
    expect(msgStatus('m1')).toBe('read');
  });

  it('updates the conversation lastMessage.status live (list ticks), matching by id or legacy messageId', () => {
    useMessagingStore.getState().onDelivered({ conversationId: 'c1', messageIds: ['m1', 'm2'], statuses: [{ id: 'm1', status: 'delivered' }, { id: 'm2', status: 'delivered' }] });
    expect(lastStatus()).toBe('delivered');
    // legacy-shaped lastMessage (messageId only, no id/status) + legacy payload → still flips
    useMessagingStore.setState({ conversations: [conv({ lastMessage: { messageId: 'm2', text: 'hi', type: 'text', senderId: 'me', at: ISO } })] });
    useMessagingStore.getState().onRead({ conversationId: 'c1', messageIds: ['m2'] });
    expect(lastStatus()).toBe('read');
  });
});

describe('messagingStore — onPresence normalization', () => {
  it('accepts lastSeen as epoch-ms number or ISO string', () => {
    useMessagingStore.getState().onPresence({ userId: 'u1', status: 'offline', lastSeen: 1750000000000 });
    expect(useMessagingStore.getState().presence['u1']).toEqual({ status: 'offline', lastSeen: 1750000000000 });
    useMessagingStore.getState().onPresence({ userId: 'u1', status: 'offline', lastSeen: ISO });
    expect(useMessagingStore.getState().presence['u1']?.lastSeen).toBe(Date.parse(ISO));
  });

  it('coerces unknown status strings to offline; legacy online flag and in_call still work', () => {
    useMessagingStore.getState().onPresence({ userId: 'u1', status: 'away' });
    expect(useMessagingStore.getState().presence['u1']?.status).toBe('offline');
    useMessagingStore.getState().onPresence({ userId: 'u1', online: true });
    expect(useMessagingStore.getState().presence['u1']?.status).toBe('online');
    useMessagingStore.getState().onPresence({ userId: 'u1', status: 'in_call' });
    expect(useMessagingStore.getState().presence['u1']?.status).toBe('in_call');
  });
});

describe('toEpochMs', () => {
  it('normalizes epoch/ISO and rejects null/garbage', () => {
    expect(toEpochMs(123)).toBe(123);
    expect(toEpochMs(ISO)).toBe(Date.parse(ISO));
    expect(toEpochMs(null)).toBeNull();
    expect(toEpochMs(undefined)).toBeNull();
    expect(toEpochMs('not-a-date')).toBeNull();
    expect(toEpochMs(NaN)).toBeNull();
  });
});

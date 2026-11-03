import type { ChatConversation } from '../api/chat';
import type { StoredMessage, OutboxItem } from '../store/messagingStore';

// "Delete chat" on a one-to-one chat (owner, 2026-11-03): the server first, then this device forgets
// the chat; and a deletion made on ANOTHER of my devices drops what this one stored before it.
jest.mock('../api/chat', () => ({
  deleteChat: jest.fn(),
  listConversations: jest.fn(),
  getMessages: jest.fn(),
  syncSince: jest.fn(),
}));
jest.mock('../services/chatDb', () => ({
  readRecent: jest.fn(async () => []),
  readOlder: jest.fn(async () => []),
  upsert: jest.fn(async () => undefined),
  removeMessages: jest.fn(async () => undefined),
  clearAll: jest.fn(async () => undefined),
  clearConversation: jest.fn(async () => undefined),
}));

import * as chatApi from '../api/chat';
import * as chatDb from '../services/chatDb';
import { useMessagingStore } from '../store/messagingStore';

const at = (min: number): string => new Date(Date.UTC(2026, 10, 3, 10, min)).toISOString();
const msg = (id: string, cid: string, min: number, over: Partial<StoredMessage> = {}): StoredMessage => ({
  id, conversationId: cid, senderId: 'other', type: 'text', text: id,
  deletedForEveryone: false, attachments: [], replyTo: null, forwardedFrom: null, reactions: [],
  status: 'sent', sentAt: at(min), deliveredAt: null, readAt: null, pinned: false, edited: false, editedAt: null,
  createdAt: at(min), mine: false, starred: false, ...over,
});
const conv = (id: string, over: Partial<ChatConversation> = {}): ChatConversation => ({
  id, type: 'direct', name: id, image: null, otherUserId: `u-${id}`, memberCount: 2, unread: 0,
  muted: false, archived: false, lastActivityAt: at(0), lastMessage: null, ...over,
});
const outboxItem = (clientId: string, conversationId: string): OutboxItem => ({ clientId, conversationId, type: 'text', text: 'queued', createdAt: 0 });

const deleteChat = chatApi.deleteChat as jest.MockedFunction<typeof chatApi.deleteChat>;
const listConversations = chatApi.listConversations as jest.MockedFunction<typeof chatApi.listConversations>;
const clearConversation = chatDb.clearConversation as jest.MockedFunction<typeof chatDb.clearConversation>;
const dbUpsert = chatDb.upsert as jest.MockedFunction<typeof chatDb.upsert>;
const state = () => useMessagingStore.getState();
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  useMessagingStore.setState({
    myUserId: 'me',
    conversations: [conv('c1'), conv('c2')],
    messages: { c1: [msg('m1', 'c1', 1)], c2: [msg('k1', 'c2', 1)] },
    outbox: [outboxItem('o1', 'c1'), outboxItem('o2', 'c2')],
    drafts: { c1: 'half typed', c2: 'keep me' },
    activeConversationId: null,
    loadingConversations: false,
  });
});

describe('deleteChat — this device', () => {
  it('asks the server, then forgets the chat, its stored messages, draft and queued sends', async () => {
    deleteChat.mockResolvedValue({ ok: true });

    await expect(state().deleteChat('c1')).resolves.toBe(true);

    expect(deleteChat).toHaveBeenCalledWith('c1');
    expect(state().conversations.map((c) => c.id)).toEqual(['c2']);
    expect(state().messages.c1).toBeUndefined();
    expect(clearConversation).toHaveBeenCalledWith('c1');
    expect(state().drafts).toEqual({ c2: 'keep me' });
    expect(state().outbox.map((o) => o.clientId)).toEqual(['o2']);
    // the other chat is untouched
    expect(state().messages.c2.map((m) => m.id)).toEqual(['k1']);
  });

  it('changes nothing when the server cannot be reached', async () => {
    deleteChat.mockRejectedValue(new Error('offline'));

    await expect(state().deleteChat('c1')).resolves.toBe(false);

    expect(state().conversations.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(state().messages.c1.map((m) => m.id)).toEqual(['m1']);
    expect(state().drafts.c1).toBe('half typed');
    expect(state().outbox).toHaveLength(2);
    expect(clearConversation).not.toHaveBeenCalled();
  });
});

describe('deleted on another of my devices', () => {
  it('drops what was stored before the deletion and keeps what came after', async () => {
    const cleared = at(5);
    useMessagingStore.setState({ messages: { c1: [msg('old', 'c1', 1), msg('new', 'c1', 9)], c2: [msg('k1', 'c2', 1)] } });
    listConversations.mockResolvedValue([conv('c1', { clearedAt: cleared }), conv('c2')]);

    await state().loadConversations();
    await flush();

    expect(state().messages.c1.map((m) => m.id)).toEqual(['new']);
    expect(clearConversation).toHaveBeenCalledWith('c1');
    expect(dbUpsert).toHaveBeenCalledWith('c1', [expect.objectContaining({ id: 'new' })]);
    expect(state().messages.c2.map((m) => m.id)).toEqual(['k1']);
  });

  it('does it once — a deletion already applied is not applied again', async () => {
    const cleared = at(5);
    useMessagingStore.setState({ conversations: [conv('c1', { clearedAt: cleared })], messages: { c1: [msg('new', 'c1', 9)] } });
    listConversations.mockResolvedValue([conv('c1', { clearedAt: cleared })]);

    await state().loadConversations();
    await flush();

    expect(clearConversation).not.toHaveBeenCalled();
    expect(state().messages.c1.map((m) => m.id)).toEqual(['new']);
  });

  it('keeps my unsent messages', async () => {
    const cleared = at(5);
    useMessagingStore.setState({ messages: { c1: [msg('old', 'c1', 1), msg('c-1', 'c1', 1, { pending: true, mine: true })] } });
    listConversations.mockResolvedValue([conv('c1', { clearedAt: cleared })]);

    await state().loadConversations();
    await flush();

    expect(state().messages.c1.map((m) => m.id)).toEqual(['c-1']);
    expect(dbUpsert).not.toHaveBeenCalled(); // nothing sent survives, and pending rows live in the outbox
  });
});

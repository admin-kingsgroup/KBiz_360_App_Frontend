import type { ChatConversation } from '../api/chat';
import type { StoredMessage, OutboxItem } from '../store/messagingStore';

// A task's chat when its task is closed or cancelled (owner, 2026-11-17): the server takes it off the
// list and answers a send with 423. That send fails for good — it never sits in the outbox to be
// retried on every reconnect — and a chat open on screen keeps its messages and turns read-only.
jest.mock('../api/chat', () => ({
  sendMessage: jest.fn(),
  listConversations: jest.fn(async () => []),
  getMessages: jest.fn(async () => []),
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
import { ApiError } from '../api/client';
import { useMessagingStore, TASK_CHAT_CLOSED_TOAST, isTaskChatClosedError } from '../store/messagingStore';
import { useUiStore } from '../store/uiStore';

const sendMessage = chatApi.sendMessage as jest.MockedFunction<typeof chatApi.sendMessage>;
const clearConversation = chatDb.clearConversation as jest.MockedFunction<typeof chatDb.clearConversation>;
const state = () => useMessagingStore.getState();
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const closed = (): ApiError => new ApiError(423, 'This task is closed — its chat is read-only');

const at = (min: number): string => new Date(Date.UTC(2026, 10, 17, 10, min)).toISOString();
const msg = (id: string, cid: string, over: Partial<StoredMessage> = {}): StoredMessage => ({
  id, conversationId: cid, senderId: 'other', type: 'text', text: id,
  deletedForEveryone: false, attachments: [], replyTo: null, forwardedFrom: null, reactions: [],
  status: 'sent', sentAt: at(1), deliveredAt: null, readAt: null, pinned: false, edited: false, editedAt: null,
  createdAt: at(1), mine: false, starred: false, ...over,
});
const taskConv = (id: string): ChatConversation => ({
  id, type: 'task', taskId: `task-${id}`, name: 'Bank reco', image: null, memberCount: 2, unread: 0,
  muted: false, archived: false, lastActivityAt: at(0), lastMessage: null,
});
const outboxItem = (clientId: string, conversationId: string): OutboxItem => ({ clientId, conversationId, type: 'text', text: 'queued', createdAt: 0 });

beforeEach(() => {
  jest.clearAllMocks();
  useUiStore.setState({ toast: null });
  useMessagingStore.setState({
    myUserId: 'me',
    conversations: [taskConv('t1'), taskConv('t2')],
    messages: { t1: [msg('m1', 't1')], t2: [msg('k1', 't2')] },
    outbox: [],
    readOnlyChats: {},
    activeConversationId: 't1',
    loadingConversations: false,
  });
});

describe('sending into a closed task chat (423)', () => {
  it('recognises the 423 and nothing else', () => {
    expect(isTaskChatClosedError(closed())).toBe(true);
    expect(isTaskChatClosedError(new ApiError(403, 'no'))).toBe(false);
    expect(isTaskChatClosedError(new Error('offline'))).toBe(false);
  });

  it('fails for good: out of the outbox, marked not sent, the chat read-only, and says why', async () => {
    sendMessage.mockRejectedValue(closed());
    await state().send('t1', 'Done with the bank reco?');
    expect(state().outbox).toHaveLength(0);
    const bubble = state().messages.t1.find((m) => m.text === 'Done with the bank reco?');
    expect(bubble).toMatchObject({ pending: false, failed: true });
    expect(state().readOnlyChats.t1).toBe(true);
    await tick();
    expect(useUiStore.getState().toast).toBe(TASK_CHAT_CLOSED_TOAST);

    // A reconnect flushes the outbox — nothing is sent again.
    await state().flushOutbox();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('tapping retry on it sends nothing and leaves it not sent', async () => {
    sendMessage.mockRejectedValue(closed());
    await state().send('t1', 'hello');
    const clientId = state().messages.t1.find((m) => m.text === 'hello')!.clientId!;
    await state().retry(clientId);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(state().messages.t1.find((m) => m.clientId === clientId)).toMatchObject({ pending: false, failed: true });
  });

  it('an ordinary network failure still stays queued for a retry', async () => {
    sendMessage.mockRejectedValue(new Error('Network request failed'));
    await state().send('t1', 'later');
    expect(state().outbox).toHaveLength(1);
    expect(state().readOnlyChats.t1).toBeUndefined();
  });

  it('a photo or voice note into a closed task chat marks it read-only and reports the 423', async () => {
    sendMessage.mockRejectedValue(closed());
    await expect(state().sendMedia('t1', { type: 'image', attachments: [] })).rejects.toThrow();
    expect(state().readOnlyChats.t1).toBe(true);
  });
});

describe('the server closing a task chat (conversationDeleted)', () => {
  it('open on screen: off the list, messages kept, unsent messages fail, read-only', () => {
    useMessagingStore.setState({ outbox: [outboxItem('o1', 't1'), outboxItem('o2', 't2')], messages: { t1: [msg('m1', 't1'), msg('o1', 't1', { clientId: 'o1', pending: true })], t2: [msg('k1', 't2')] } });
    state().closeTaskChat('t1');
    expect(state().conversations.map((c) => c.id)).toEqual(['t2']);
    expect(state().messages.t1.map((m) => m.id)).toEqual(['m1', 'o1']);
    expect(state().messages.t1[1]).toMatchObject({ pending: false, failed: true });
    expect(state().outbox.map((o) => o.clientId)).toEqual(['o2']);
    expect(state().readOnlyChats.t1).toBe(true);
    expect(clearConversation).not.toHaveBeenCalled();
  });

  it('not on screen: forgotten like any chat that left the list', async () => {
    state().closeTaskChat('t2');
    await tick();
    expect(state().messages.t2).toBeUndefined();
    expect(clearConversation).toHaveBeenCalledWith('t2');
  });

  it('the chat coming back (task reopened) clears the read-only marks', () => {
    state().closeTaskChat('t1');
    state().clearReadOnlyChats();
    expect(state().readOnlyChats).toEqual({});
  });
});

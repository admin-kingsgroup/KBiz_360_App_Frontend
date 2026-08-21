import type { ChatConversation, ChatMessage } from '../api/chat';
import type { StoredMessage } from '../store/messagingStore';

// The store talks to the network through one module and to the device through the other — stub both
// so the local-first flow (read disk → paint → delta sync) is testable in Node.
jest.mock('../api/chat', () => ({
  getMessages: jest.fn(),
  syncSince: jest.fn(),
  listConversations: jest.fn(),
  getPresence: jest.fn(),
  sendMessage: jest.fn(),
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

const at = (min: number): string => new Date(Date.UTC(2026, 6, 15, 10, min)).toISOString();
const msg = (id: string, min: number, over: Partial<StoredMessage> = {}): StoredMessage => ({
  id, conversationId: 'c1', senderId: 'me', type: 'text', text: id,
  deletedForEveryone: false, attachments: [], replyTo: null, forwardedFrom: null, reactions: [],
  status: 'sent', sentAt: at(min), deliveredAt: null, readAt: null, pinned: false, edited: false, editedAt: null,
  createdAt: at(min), mine: true, starred: false, ...over,
});
const conv = (id: string, lastId: string, over: Partial<ChatConversation> = {}): ChatConversation => ({
  id, type: 'direct', name: id, image: null, otherUserId: `u-${id}`, memberCount: 2, unread: 0,
  muted: false, archived: false, lastActivityAt: at(0),
  lastMessage: { messageId: lastId, id: lastId, text: 'hi', type: 'text', senderId: 'me', at: at(0), status: 'sent' },
  ...over,
});
const getMessages = chatApi.getMessages as jest.MockedFunction<typeof chatApi.getMessages>;
const syncSince = chatApi.syncSince as jest.MockedFunction<typeof chatApi.syncSince>;
const readRecent = chatDb.readRecent as jest.MockedFunction<typeof chatDb.readRecent>;
const readOlder = chatDb.readOlder as jest.MockedFunction<typeof chatDb.readOlder>;
const dbUpsert = chatDb.upsert as jest.MockedFunction<typeof chatDb.upsert>;
const dbRemove = chatDb.removeMessages as jest.MockedFunction<typeof chatDb.removeMessages>;
const ids = (cid: string): string[] => (useMessagingStore.getState().messages[cid] ?? []).map((m) => m.id);

beforeEach(() => {
  jest.clearAllMocks();
  readRecent.mockResolvedValue([]);
  readOlder.mockResolvedValue([]);
  dbUpsert.mockResolvedValue(undefined);
  useMessagingStore.setState({ myUserId: 'me', conversations: [], messages: {}, outbox: [], activeConversationId: null, lastSyncAt: null });
});

describe('opening a chat — off the device, no request', () => {
  it('opens a stored thread with ZERO network calls', async () => {
    readRecent.mockResolvedValue([msg('m1', 1), msg('m2', 2)]);

    await useMessagingStore.getState().loadMessages('c1');

    expect(ids('c1')).toEqual(['m1', 'm2']);
    expect(readRecent).toHaveBeenCalledWith('c1', 60);
    expect(getMessages).not.toHaveBeenCalled(); // catchUp + the socket keep it current, not this
  });

  it('opens with no connection at all', async () => {
    readRecent.mockResolvedValue([msg('m1', 1)]);
    getMessages.mockRejectedValue(new Error('offline'));

    await useMessagingStore.getState().loadMessages('c1');

    expect(ids('c1')).toEqual(['m1']);
  });

  it('does not re-read the device when the thread is already in memory', async () => {
    useMessagingStore.setState({ messages: { c1: [msg('m1', 1)] } });

    await useMessagingStore.getState().loadMessages('c1');

    expect(readRecent).not.toHaveBeenCalled();
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('backfills once for a thread this device has never stored, and keeps what it fetched', async () => {
    readRecent.mockResolvedValue([]); // fresh install / chat started on another device
    getMessages.mockResolvedValue([msg('m1', 1)] as ChatMessage[]);

    await useMessagingStore.getState().loadMessages('c1');

    expect(getMessages).toHaveBeenCalledWith('c1', { limit: 40 });
    expect(dbUpsert).toHaveBeenCalledWith('c1', [expect.objectContaining({ id: 'm1' })]);
  });

  it('does not mistake an unsent draft for stored history', async () => {
    useMessagingStore.setState({ messages: { c1: [msg('draft', 9, { pending: true, clientId: 'c-1' })] } });
    readRecent.mockResolvedValue([]);
    getMessages.mockResolvedValue([]);

    await useMessagingStore.getState().loadMessages('c1');

    expect(getMessages).toHaveBeenCalled(); // a pending bubble is not history — still backfills
  });
});

describe('catch-up sync — one request for everything that changed', () => {
  it('only starts the clock on a fresh install (never drags down all history)', async () => {
    await useMessagingStore.getState().catchUp();

    expect(syncSince).not.toHaveBeenCalled();
    expect(useMessagingStore.getState().lastSyncAt).not.toBeNull();
  });

  it('pages until the server says it is done, advancing the watermark', async () => {
    useMessagingStore.setState({ lastSyncAt: at(0), conversations: [conv('c1', 'x')] });
    syncSince
      .mockResolvedValueOnce({ messages: [msg('m1', 1)] as ChatMessage[], until: at(1), untilId: 'm1', more: true })
      .mockResolvedValueOnce({ messages: [msg('m2', 2)] as ChatMessage[], until: at(2), untilId: 'm2', more: false });

    await useMessagingStore.getState().catchUp();

    expect(syncSince).toHaveBeenCalledTimes(2);
    // The second page resumes from the PAIR — timestamp plus the last id seen at it, so a batch of
    // messages sharing one millisecond can never be half-skipped.
    expect(syncSince).toHaveBeenNthCalledWith(2, at(1), 'm1');
    expect(useMessagingStore.getState().lastSyncAt).toBe(at(2));
    expect(useMessagingStore.getState().lastSyncId).toBe('m2');
    expect(ids('c1')).toEqual(['m1', 'm2']);
  });

  it('stores changes for chats that are not open without pulling them into memory', async () => {
    useMessagingStore.setState({ lastSyncAt: at(0), conversations: [] }); // c1 unknown to this session
    syncSince.mockResolvedValue({ messages: [msg('m1', 1)] as ChatMessage[], until: at(1), untilId: 'm1', more: false });

    await useMessagingStore.getState().catchUp();

    expect(dbUpsert).toHaveBeenCalledWith('c1', [expect.objectContaining({ id: 'm1' })]);
    expect(useMessagingStore.getState().messages['c1']).toBeUndefined();
  });

  it('keeps the watermark put when offline, so nothing is skipped on the retry', async () => {
    useMessagingStore.setState({ lastSyncAt: at(0) });
    syncSince.mockRejectedValue(new Error('offline'));

    await useMessagingStore.getState().catchUp();

    expect(useMessagingStore.getState().lastSyncAt).toBe(at(0));
  });

  it('does not stack on a reconnect storm', async () => {
    useMessagingStore.setState({ lastSyncAt: at(0) });
    syncSince.mockImplementation(async () => ({ messages: [], until: at(1), untilId: null, more: false }));

    await Promise.all([
      useMessagingStore.getState().catchUp(),
      useMessagingStore.getState().catchUp(),
      useMessagingStore.getState().catchUp(),
    ]);

    expect(syncSince).toHaveBeenCalledTimes(1);
  });
});

describe('freeing space', () => {
  it('clears one thread from the device but keeps unsent messages', async () => {
    useMessagingStore.setState({ messages: { c1: [msg('m1', 1), msg('draft', 9, { pending: true, clientId: 'c-1' })] } });

    await useMessagingStore.getState().clearLocalThread('c1');

    expect(ids('c1')).toEqual(['draft']);
    expect(chatDb.clearConversation).toHaveBeenCalledWith('c1');
  });
});

describe('delta sync — only what happened since', () => {
  it('asks once when the newest page already contains our latest message', async () => {
    useMessagingStore.setState({ messages: { c1: [msg('m1', 1), msg('m2', 2)] } });
    getMessages.mockResolvedValue([msg('m2', 2), msg('m3', 3)] as ChatMessage[]);

    await useMessagingStore.getState().syncMessages('c1');

    expect(getMessages).toHaveBeenCalledTimes(1);
    expect(ids('c1')).toEqual(['m1', 'm2', 'm3']);
  });

  it('fills the gap forward when the device fell behind, then stops', async () => {
    useMessagingStore.setState({ messages: { c1: [msg('old', 0)] } });
    // Newest page has no overlap with what we hold → there is a hole between them.
    getMessages.mockImplementation(async (_id, opts) => {
      if (!opts?.after) return [msg('head', 90)] as ChatMessage[];
      if (opts.after === 'old') return [msg('gap1', 10), msg('gap2', 20)] as ChatMessage[];
      return [];
    });

    await useMessagingStore.getState().syncMessages('c1');

    expect(ids('c1')).toEqual(['old', 'gap1', 'gap2', 'head']); // chronological, hole closed
    expect(getMessages).toHaveBeenCalledWith('c1', { after: 'old', limit: 100 });
  });

  it('keeps unsent messages at the bottom while syncing', async () => {
    useMessagingStore.setState({ messages: { c1: [msg('m1', 1), msg('draft', 99, { pending: true, clientId: 'c-1' })] } });
    getMessages.mockResolvedValue([msg('m1', 1), msg('m2', 2)] as ChatMessage[]);

    await useMessagingStore.getState().syncMessages('c1');

    expect(ids('c1')).toEqual(['m1', 'm2', 'draft']);
    expect(dbUpsert).not.toHaveBeenCalledWith('c1', expect.arrayContaining([expect.objectContaining({ id: 'draft' })]));
  });
});

describe('messages deleted on the server', () => {
  // A page is a contiguous slice, so a gap in it is the ONLY way the server can tell a local-first
  // device that something is gone — the catch-up feed carries changes, never absences.
  it('drops a message the newest page no longer carries, on screen and on disk', async () => {
    useMessagingStore.setState({ messages: { c1: [msg('m1', 1), msg('m3', 3), msg('m5', 5), msg('m9', 9)] } });
    getMessages.mockResolvedValue([msg('m1', 1), msg('m5', 5), msg('m9', 9)] as ChatMessage[]);

    await useMessagingStore.getState().syncMessages('c1');

    expect(ids('c1')).toEqual(['m1', 'm5', 'm9']);
    expect(dbRemove).toHaveBeenCalledWith('c1', ['m3']);
  });

  it('leaves alone what the page never covered — older history, and arrivals behind it', async () => {
    useMessagingStore.setState({ messages: { c1: [msg('m0', 0), msg('m1', 1), msg('m5', 5), msg('m9', 9)] } });
    getMessages.mockResolvedValue([msg('m1', 1), msg('m5', 5)] as ChatMessage[]); // m0 is below it, m9 landed after it

    await useMessagingStore.getState().syncMessages('c1');

    expect(ids('c1')).toEqual(['m0', 'm1', 'm5', 'm9']);
    expect(dbRemove).not.toHaveBeenCalled();
  });

  it('never prunes an unsent message sitting inside the page range', async () => {
    useMessagingStore.setState({
      messages: { c1: [msg('m1', 1), msg('m5-unsent', 5, { pending: true, clientId: 'c-1' }), msg('m9', 9)] },
    });
    getMessages.mockResolvedValue([msg('m1', 1), msg('m9', 9)] as ChatMessage[]);

    await useMessagingStore.getState().syncMessages('c1');

    expect(ids('c1')).toEqual(['m1', 'm9', 'm5-unsent']); // unsent stays pinned to the bottom
    expect(dbRemove).not.toHaveBeenCalled();
  });
});

describe('scrollback — history comes off the device', () => {
  it('serves the previous page locally without touching the network', async () => {
    useMessagingStore.setState({ messages: { c1: [msg('m5', 5)] } });
    readOlder.mockResolvedValue([msg('m3', 3), msg('m4', 4)]);

    const n = await useMessagingStore.getState().loadOlderMessages('c1');

    expect(n).toBe(2);
    expect(ids('c1')).toEqual(['m3', 'm4', 'm5']);
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('falls back to the server only when local history runs out — and stores what it gets', async () => {
    useMessagingStore.setState({ messages: { c1: [msg('m5', 5)] } });
    readOlder.mockResolvedValue([]);
    getMessages.mockResolvedValue([msg('m4', 4)] as ChatMessage[]);

    const n = await useMessagingStore.getState().loadOlderMessages('c1');

    expect(n).toBe(1);
    expect(getMessages).toHaveBeenCalledWith('c1', { before: 'm5', limit: 40 });
    expect(dbUpsert).toHaveBeenCalledWith('c1', [expect.objectContaining({ id: 'm4' })]);
  });

  it('reports 0 at the top of the thread so the screen stops asking', async () => {
    useMessagingStore.setState({ messages: { c1: [msg('m1', 1)] } });
    getMessages.mockResolvedValue([]);

    expect(await useMessagingStore.getState().loadOlderMessages('c1')).toBe(0);
  });
});

describe('warming the recent chats', () => {
  it('hydrates from the device without any network calls', async () => {
    useMessagingStore.setState({ conversations: [conv('a', 'x1'), conv('b', 'x2')] });
    readRecent.mockResolvedValue([msg('m1', 1)]);

    await useMessagingStore.getState().hydrateLocal();

    expect(ids('a')).toEqual(['m1']);
    expect(ids('b')).toEqual(['m1']);
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('syncs only the threads the chat list says are behind, never the open one', async () => {
    useMessagingStore.setState({
      conversations: [
        conv('cold', 'x1'),
        conv('behind', 'x2'),
        conv('current', 'x3'),
        conv('open', 'x4'),
        conv('gone', 'x5', { archived: true }),
      ],
      messages: { behind: [msg('older', 1)], current: [msg('x3', 1)], open: [msg('x4', 1)] },
      activeConversationId: 'open',
    });
    getMessages.mockResolvedValue([]);

    await useMessagingStore.getState().prefetchMessages();

    expect(getMessages.mock.calls.map((c) => c[0])).toEqual(['cold', 'behind']);
  });
});

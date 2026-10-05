import type { ChatConversation } from '../api/chat';
import type { StoredMessage } from '../store/messagingStore';

// What keeps the chat feeling instant: taps are answered before the server is (optimistic react /
// star / edit / delete, with a rollback when it refuses), a refetch that brings back the same list
// changes nothing, and the store only writes itself to disk when something persisted changed.
jest.mock('../api/chat', () => ({
  listConversations: jest.fn(),
  reactMessage: jest.fn(),
  starMessage: jest.fn(),
  editMessage: jest.fn(),
  deleteMessage: jest.fn(),
  getPrivacy: jest.fn(),
}));
jest.mock('../services/chatDb', () => ({
  readRecent: jest.fn(async () => []),
  upsert: jest.fn(async () => undefined),
  removeMessages: jest.fn(async () => undefined),
  clearAll: jest.fn(async () => undefined),
}));

import * as chatApi from '../api/chat';
import * as chatDb from '../services/chatDb';
import { useMessagingStore } from '../store/messagingStore';
import { coalescedStorage, persistStorage, flushPersist } from '../store/persistStorage';

const api = chatApi as jest.Mocked<typeof chatApi>;
const at = (min: number): string => new Date(Date.UTC(2026, 6, 15, 10, min)).toISOString();
const msg = (id: string, min: number, over: Partial<StoredMessage> = {}): StoredMessage => ({
  id, conversationId: 'c1', senderId: 'them', type: 'text', text: id,
  deletedForEveryone: false, attachments: [], replyTo: null, forwardedFrom: null, reactions: [],
  status: 'sent', sentAt: at(min), deliveredAt: null, readAt: null, pinned: false, edited: false, editedAt: null,
  createdAt: at(min), mine: false, starred: false, ...over,
});
const conv = (id: string, over: Partial<ChatConversation> = {}): ChatConversation => ({
  id, type: 'direct', name: id, image: null, otherUserId: `u-${id}`, memberCount: 2, unread: 0,
  muted: false, archived: false, lastActivityAt: at(0), lastMessage: null, ...over,
});
const thread = (): StoredMessage[] => useMessagingStore.getState().messages.c1;
const deferred = <T,>() => {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  jest.clearAllMocks();
  useMessagingStore.setState({ myUserId: 'me', conversations: [], messages: { c1: [msg('m1', 1), msg('m2', 2)] }, activeConversationId: null });
});

describe('optimistic message actions', () => {
  it('shows my reaction before the server answers', async () => {
    const d = deferred<{ ok: boolean }>();
    api.reactMessage.mockReturnValue(d.promise);
    const done = useMessagingStore.getState().react('m1', '👍');
    expect(thread()[0].reactions).toEqual([{ userId: 'me', emoji: '👍' }]);
    d.resolve({ ok: true });
    await done;
  });

  it('applies the server rule: same emoji removes mine, another replaces it, others stay', async () => {
    api.reactMessage.mockResolvedValue({ ok: true });
    useMessagingStore.setState({ messages: { c1: [msg('m1', 1, { reactions: [{ userId: 'them', emoji: '❤️' }, { userId: 'me', emoji: '👍' }] })] } });
    await useMessagingStore.getState().react('m1', '😂');
    expect(thread()[0].reactions).toEqual([{ userId: 'them', emoji: '❤️' }, { userId: 'me', emoji: '😂' }]);
    await useMessagingStore.getState().react('m1', '😂');
    expect(thread()[0].reactions).toEqual([{ userId: 'them', emoji: '❤️' }]);
  });

  it('puts the reaction back the way it was when the server refuses', async () => {
    api.reactMessage.mockRejectedValue(new Error('offline'));
    await expect(useMessagingStore.getState().react('m1', '👍')).rejects.toThrow('offline');
    expect(thread()[0].reactions).toEqual([]);
  });

  it('leaves every other message object untouched, so memoised rows do not repaint', async () => {
    api.reactMessage.mockResolvedValue({ ok: true });
    const other = thread()[1];
    await useMessagingStore.getState().react('m1', '👍');
    expect(thread()[1]).toBe(other);
  });

  it('stars at once and rolls back on failure', async () => {
    const d = deferred<{ starred: boolean }>();
    api.starMessage.mockReturnValue(d.promise);
    const done = useMessagingStore.getState().star('m1', 'c1');
    expect(thread()[0].starred).toBe(true);
    d.reject(new Error('offline'));
    await expect(done).rejects.toThrow('offline');
    expect(thread()[0].starred).toBe(false);
  });

  it('edits at once and restores the old text on failure', async () => {
    const d = deferred<never>();
    api.editMessage.mockReturnValue(d.promise);
    const done = useMessagingStore.getState().edit('m1', 'c1', 'changed');
    expect(thread()[0]).toMatchObject({ text: 'changed', edited: true });
    d.reject(new Error('offline'));
    await expect(done).rejects.toThrow('offline');
    expect(thread()[0]).toMatchObject({ text: 'm1', edited: false });
  });

  it('delete-for-me drops the bubble at once and restores it in place on failure', async () => {
    const d = deferred<never>();
    api.deleteMessage.mockReturnValue(d.promise);
    const done = useMessagingStore.getState().remove('m1', 'c1', 'me');
    expect(thread().map((m) => m.id)).toEqual(['m2']);
    d.reject(new Error('offline'));
    await expect(done).rejects.toThrow('offline');
    expect(thread().map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(chatDb.removeMessages).not.toHaveBeenCalled();
  });
});

describe('refetches that change nothing', () => {
  it('keeps the same list and row objects when the server sends back identical conversations', async () => {
    api.listConversations.mockResolvedValue([conv('a'), conv('b')]);
    await useMessagingStore.getState().loadConversations();
    const first = useMessagingStore.getState().conversations;
    api.listConversations.mockResolvedValue([conv('a'), conv('b')]); // fresh objects, same content
    await useMessagingStore.getState().loadConversations();
    expect(useMessagingStore.getState().conversations).toBe(first);
  });

  it('replaces only the conversation that changed', async () => {
    api.listConversations.mockResolvedValue([conv('a'), conv('b')]);
    await useMessagingStore.getState().loadConversations();
    const [a, b] = useMessagingStore.getState().conversations;
    api.listConversations.mockResolvedValue([conv('a'), conv('b', { unread: 3 })]);
    await useMessagingStore.getState().loadConversations();
    const next = useMessagingStore.getState().conversations;
    expect(next[0]).toBe(a);
    expect(next[1]).not.toBe(b);
    expect(next[1].unread).toBe(3);
  });

  it('repeated typing pings and presence echoes do not notify subscribers', () => {
    const seen = jest.fn();
    useMessagingStore.getState().onTyping('c1', 'them', true);
    useMessagingStore.getState().onPresence({ userId: 'them', status: 'online', lastSeen: null });
    const unsub = useMessagingStore.subscribe(seen);
    useMessagingStore.getState().onTyping('c1', 'them', true);
    useMessagingStore.getState().onPresence({ userId: 'them', status: 'online', lastSeen: null });
    unsub();
    useMessagingStore.getState().onTyping('c1', 'them', false); // clears the 5s auto-stop timer
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('coalescedStorage', () => {
  type Slice = { list: string[]; outbox: string[] };
  let setItem: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    setItem = jest.spyOn(persistStorage, 'setItem').mockImplementation(async () => undefined);
    flushPersist(); // drain what the messaging store itself queued above, so only this suite's writes count
    setItem.mockClear();
  });
  afterEach(() => { jest.useRealTimers(); setItem.mockRestore(); });

  it('collapses a burst into one write carrying the latest state, in createJSONStorage shape', () => {
    const s = coalescedStorage<Slice>({ delayMs: 500 });
    const outbox: string[] = [];
    void s.setItem('k', { state: { list: ['a'], outbox }, version: 3 });
    void s.setItem('k', { state: { list: ['a', 'b'], outbox }, version: 3 });
    expect(setItem).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith('k', JSON.stringify({ state: { list: ['a', 'b'], outbox: [] }, version: 3 }));
  });

  it('writes nothing when no persisted field changed identity', () => {
    const s = coalescedStorage<Slice>({ delayMs: 500 });
    const list = ['a']; const outbox: string[] = [];
    void s.setItem('k', { state: { list, outbox }, version: 1 });
    jest.advanceTimersByTime(500);
    void s.setItem('k', { state: { list, outbox }, version: 1 }); // e.g. a typing event
    jest.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('writes immediately when the change is urgent, and on flushPersist', () => {
    const s = coalescedStorage<Slice>({ delayMs: 500, urgent: (prev, next) => prev?.outbox !== next.outbox });
    const list = ['a']; const outbox: string[] = [];
    void s.setItem('k', { state: { list, outbox }, version: 1 }); // first write: prev is undefined ⇒ urgent
    expect(setItem).toHaveBeenCalledTimes(1);
    void s.setItem('k', { state: { list, outbox: ['unsent'] }, version: 1 });
    expect(setItem).toHaveBeenCalledTimes(2);
    void s.setItem('k', { state: { list: ['a', 'b'], outbox: ['unsent'] }, version: 1 });
    expect(setItem).toHaveBeenCalledTimes(3); // a new outbox array again ⇒ still urgent
    const kept = ['unsent'];
    void s.setItem('k', { state: { list: ['x'], outbox: kept }, version: 1 });
    void s.setItem('k', { state: { list: ['y'], outbox: kept }, version: 1 });
    expect(setItem).toHaveBeenCalledTimes(4); // outbox identity held ⇒ queued
    flushPersist();
    expect(setItem).toHaveBeenCalledTimes(5);
    expect(setItem).toHaveBeenLastCalledWith('k', JSON.stringify({ state: { list: ['y'], outbox: ['unsent'] }, version: 1 }));
  });
});

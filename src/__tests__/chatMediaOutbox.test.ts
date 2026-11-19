import type { ChatConversation, ChatMessage, ChatAttachment } from '../api/chat';
import type { StoredMessage, OutboxItem } from '../store/messagingStore';

// Afshin, 2026-11-19 (voice note): "When I send a voice message it says check your network
// connection. In WhatsApp the voice message goes, and when the internet is back it gets delivered."
// Files now ride the same outbox as text: shown at once with a clock, uploaded and sent when there is
// a connection, in order, never twice — and only a refusal from the server shows "not sent".
jest.mock('../api/chat', () => ({
  sendMessage: jest.fn(),
  deleteChat: jest.fn(async () => undefined),
  listConversations: jest.fn(async () => []),
  getMessages: jest.fn(async () => []),
  syncSince: jest.fn(),
}));
jest.mock('../api/media', () => ({ ...jest.requireActual('../api/media'), uploadFile: jest.fn() }));
jest.mock('../services/outboxMedia', () => ({
  keepForOutbox: jest.fn(async (clientId: string, f: { name: string }) => `chat-outbox/${clientId}${f.name.slice(f.name.lastIndexOf('.'))}`),
  outboxFileUri: jest.fn(async (p: string) => `file:///docs/${p}`),
  settleOutboxFile: jest.fn(async () => undefined),
  dropOutboxFile: jest.fn(async () => undefined),
  clearOutboxFiles: jest.fn(async () => undefined),
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
import * as media from '../api/media';
import * as outboxMedia from '../services/outboxMedia';
import * as chatDb from '../services/chatDb';
import { ApiError } from '../api/client';
import { useMessagingStore, waitsForNetwork } from '../store/messagingStore';
import { useUiStore } from '../store/uiStore';

const sendMessage = chatApi.sendMessage as jest.MockedFunction<typeof chatApi.sendMessage>;
const uploadFile = media.uploadFile as jest.MockedFunction<typeof media.uploadFile>;
const settleOutboxFile = outboxMedia.settleOutboxFile as jest.MockedFunction<typeof outboxMedia.settleOutboxFile>;
const dropOutboxFile = outboxMedia.dropOutboxFile as jest.MockedFunction<typeof outboxMedia.dropOutboxFile>;
const readRecent = chatDb.readRecent as jest.MockedFunction<typeof chatDb.readRecent>;
const state = () => useMessagingStore.getState();

const AT = new Date(Date.UTC(2026, 10, 19, 6, 8)).toISOString();
const offline = (): Error => new Error('Upload network error');
const conv = (id: string): ChatConversation => ({
  id, type: 'group', name: 'BOM - Branch Accounts', image: null, memberCount: 13, unread: 0,
  muted: false, archived: false, lastActivityAt: AT, lastMessage: null,
});
const msg = (id: string, over: Partial<StoredMessage> = {}): StoredMessage => ({
  id, conversationId: 'c1', senderId: 'other', type: 'text', text: id,
  deletedForEveryone: false, attachments: [], replyTo: null, forwardedFrom: null, mentions: [], reactions: [],
  status: 'sent', sentAt: AT, deliveredAt: null, readAt: null, pinned: false, edited: false, editedAt: null,
  createdAt: AT, mine: false, starred: false, ...over,
});
// The server's copy of whatever was sent (it echoes the input, with its own id).
const echo = async (input: Parameters<typeof chatApi.sendMessage>[0]): Promise<ChatMessage> =>
  msg(`srv-${input.clientId}`, { conversationId: input.conversationId, senderId: 'me', type: input.type ?? 'text', text: input.text ?? '', attachments: input.attachments ?? [], mine: true }) as ChatMessage;
const uploaded = { url: '/uploads/abc.m4a', key: 'abc.m4a', name: 'voice.m4a', size: 5120, mime: 'audio/m4a' };
const voice = { type: 'voice' as const, file: { uri: 'file:///cache/rec-1.m4a', name: 'voice.m4a', mime: 'audio/m4a' }, extra: { durationMs: 7000 } };
const bubbles = (): StoredMessage[] => state().messages.c1 ?? [];

beforeEach(() => {
  jest.clearAllMocks();
  state().reset();
  useUiStore.setState({ toast: null });
  useMessagingStore.setState({ myUserId: 'me', conversations: [conv('c1')], messages: { c1: [msg('m1')] }, activeConversationId: 'c1' });
  sendMessage.mockImplementation(echo);
});

describe('a voice note with no connection', () => {
  it('shows at once with a clock, plays from the phone, and waits in the outbox — no error', async () => {
    uploadFile.mockRejectedValue(offline());
    await state().sendFile('c1', voice);

    const b = bubbles().find((m) => m.type === 'voice')!;
    expect(b).toMatchObject({ mine: true, pending: true, failed: false });
    expect(b.attachments[0]).toMatchObject({ url: `file:///docs/chat-outbox/${b.clientId}.m4a`, mime: 'audio/m4a', durationMs: 7000 });
    expect(state().outbox).toHaveLength(1);
    expect(state().outbox[0].file).toMatchObject({ path: `chat-outbox/${b.clientId}.m4a`, name: 'voice.m4a' });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(useUiStore.getState().toast).toBeNull();
    expect(state().conversations[0].lastMessage).toMatchObject({ type: 'voice', senderId: 'me' });
  });

  it('goes by itself when the connection is back, and becomes the sent message', async () => {
    uploadFile.mockRejectedValueOnce(offline());
    await state().sendFile('c1', voice);
    const clientId = state().outbox[0].clientId;

    uploadFile.mockResolvedValue(uploaded);
    await state().flushOutbox(); // what a socket reconnect does

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toMatchObject({ conversationId: 'c1', type: 'voice', clientId, attachments: [{ ...uploaded, durationMs: 7000 }] });
    // The sender's copy is kept as the downloaded copy of the server file (no download back).
    expect(settleOutboxFile).toHaveBeenCalledWith(`chat-outbox/${clientId}.m4a`, expect.objectContaining({ url: uploaded.url }));
    expect(state().outbox).toHaveLength(0);
    const b = bubbles().find((m) => m.clientId === clientId)!;
    expect(b).toMatchObject({ id: `srv-${clientId}`, pending: false, failed: false });
    expect(state().uploadProgress).toEqual({});
  });

  it('a send cut off after the upload does not upload the file again', async () => {
    uploadFile.mockResolvedValue(uploaded);
    sendMessage.mockRejectedValueOnce(new TypeError('Network request failed'));
    await state().sendFile('c1', voice);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(state().outbox[0].attachments).toEqual([{ ...uploaded, durationMs: 7000 }]);
    expect(bubbles().find((m) => m.type === 'voice')).toMatchObject({ pending: true, failed: false });

    await state().flushOutbox();
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(state().outbox).toHaveLength(0);
  });

  it('keeps the order: a reply typed while the voice note waits goes after it', async () => {
    uploadFile.mockRejectedValue(offline());
    await state().sendFile('c1', voice);
    await state().send('c1', 'Ok');
    expect(sendMessage).not.toHaveBeenCalled(); // nothing overtakes the waiting voice note
    expect(bubbles().filter((m) => m.mine).map((m) => [m.type, m.pending])).toEqual([['voice', true], ['text', true]]);

    uploadFile.mockResolvedValue(uploaded);
    await state().flushOutbox();
    expect(sendMessage.mock.calls.map((c) => c[0].type)).toEqual(['voice', 'text']);
    expect(state().outbox).toHaveLength(0);
  });

  it('two flushes at once (reconnect + retry timer) send it once', async () => {
    uploadFile.mockRejectedValueOnce(offline());
    await state().sendFile('c1', voice);
    let finish!: (r: typeof uploaded) => void;
    uploadFile.mockImplementation(() => new Promise((r) => { finish = r; }));
    const a = state().flushOutbox();
    const b = state().flushOutbox();
    await Promise.resolve();
    finish(uploaded);
    await Promise.all([a, b]);
    expect(uploadFile).toHaveBeenCalledTimes(2); // the first offline try + this one
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('tries again by itself while the socket stays connected', async () => {
    jest.useFakeTimers();
    try {
      uploadFile.mockRejectedValueOnce(offline());
      await state().sendFile('c1', voice);
      uploadFile.mockResolvedValue(uploaded);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(state().outbox).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a flush with nothing to send never blocks the next message', async () => {
    useMessagingStore.setState({ outbox: [] });
    await state().flushOutbox(); // e.g. a reconnect with an empty outbox
    await state().send('c1', 'next');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('shows its progress while it uploads', async () => {
    let progress!: (f: number) => void;
    let finish!: (r: typeof uploaded) => void;
    uploadFile.mockImplementation((_f, onProgress) => new Promise((r) => { progress = onProgress!; finish = r; }));
    const sending = state().sendFile('c1', voice);
    await new Promise((r) => setTimeout(r, 0));
    progress(0.4);
    expect(Object.values(state().uploadProgress)).toEqual([0.4]);
    finish(uploaded);
    await sending;
    expect(state().uploadProgress).toEqual({});
  });
});

describe('what counts as "no connection"', () => {
  it('network errors, timeouts and server trouble wait; refusals do not', () => {
    expect(waitsForNetwork(new TypeError('Network request failed'))).toBe(true);
    expect(waitsForNetwork(offline())).toBe(true);
    expect(waitsForNetwork(new ApiError(502, 'Bad gateway'))).toBe(true);
    expect(waitsForNetwork(new ApiError(429, 'Slow down'))).toBe(true);
    expect(waitsForNetwork(new ApiError(413, 'Too large'))).toBe(false);
    expect(waitsForNetwork(new ApiError(403, 'Not a member'))).toBe(false);
  });

  it('a text sent offline keeps its clock too (no "Failed" while it waits)', async () => {
    sendMessage.mockRejectedValue(new TypeError('Network request failed'));
    await state().send('c1', 'hi');
    expect(bubbles().find((m) => m.text === 'hi')).toMatchObject({ pending: true, failed: false });
    expect(state().outbox).toHaveLength(1);
  });

  it('a refused file says not sent, is not re-uploaded on every reconnect, and goes on "retry"', async () => {
    uploadFile.mockRejectedValue(new ApiError(413, 'File too large'));
    await state().sendFile('c1', voice);
    const clientId = state().outbox[0].clientId;
    expect(bubbles().find((m) => m.clientId === clientId)).toMatchObject({ pending: false, failed: true });
    expect(state().outbox[0].held).toBe(true);

    await state().flushOutbox();
    expect(uploadFile).toHaveBeenCalledTimes(1);

    uploadFile.mockResolvedValue(uploaded);
    await state().retry(clientId);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(state().outbox).toHaveLength(0);
  });
});

describe('after the app restarts', () => {
  it('the waiting voice note is back on screen, still with its clock', async () => {
    const queued: OutboxItem = { clientId: 'c-9', conversationId: 'c1', type: 'voice', createdAt: Date.parse(AT), file: { path: 'chat-outbox/c-9.m4a', name: 'voice.m4a', mime: 'audio/m4a', extra: { durationMs: 9000 } } };
    useMessagingStore.setState({ messages: {}, outbox: [queued] });
    readRecent.mockResolvedValue([msg('m1')]);
    await state().loadMessages('c1');
    const b = bubbles().find((m) => m.clientId === 'c-9')!;
    expect(b).toMatchObject({ type: 'voice', mine: true, pending: true, failed: false });
    expect(b.attachments[0] as ChatAttachment).toMatchObject({ url: 'file:///docs/chat-outbox/c-9.m4a', durationMs: 9000 });
    expect(bubbles().map((m) => m.id)).toEqual(['m1', 'c-9']);
  });
});

describe('a queued file that can never go', () => {
  it('is freed when its task chat closes', async () => {
    uploadFile.mockRejectedValue(offline());
    await state().sendFile('c1', voice);
    const path = state().outbox[0].file!.path;
    state().closeTaskChat('c1');
    expect(dropOutboxFile).toHaveBeenCalledWith(path);
  });

  it('is freed when the chat is deleted', async () => {
    uploadFile.mockRejectedValue(offline());
    await state().sendFile('c1', voice);
    const path = state().outbox[0].file!.path;
    await state().deleteChat('c1');
    expect(dropOutboxFile).toHaveBeenCalledWith(path);
    expect(state().outbox).toHaveLength(0);
  });
});

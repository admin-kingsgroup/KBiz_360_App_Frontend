import type { ChatConversation } from '../api/chat';

jest.mock('../api/chat', () => ({
  getMessages: jest.fn(),
  syncSince: jest.fn(),
  listConversations: jest.fn(),
  getPresence: jest.fn(),
  sendMessage: jest.fn(),
  setConversationSettings: jest.fn(),
  setDisappearing: jest.fn(),
  getPrivacy: jest.fn(),
  updatePrivacy: jest.fn(),
  blockUser: jest.fn(),
  unblockUser: jest.fn(),
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
import { useMessagingStore } from '../store/messagingStore';

const conv = (over: Partial<ChatConversation> = {}): ChatConversation => ({
  id: 'c1', type: 'direct', name: 'Riya', image: null, otherUserId: 'u2', memberCount: 2, unread: 0,
  muted: false, archived: false, pinned: false, lastActivityAt: '2026-07-15T10:00:00.000Z',
  lastMessage: { messageId: 'm1', text: 'hi', type: 'text', senderId: 'u2', at: '2026-07-15T10:00:00.000Z' },
  ...over,
});
const setSettings = chatApi.setConversationSettings as jest.MockedFunction<typeof chatApi.setConversationSettings>;
const updatePrivacy = chatApi.updatePrivacy as jest.MockedFunction<typeof chatApi.updatePrivacy>;
const blockUser = chatApi.blockUser as jest.MockedFunction<typeof chatApi.blockUser>;
const listConversations = chatApi.listConversations as jest.MockedFunction<typeof chatApi.listConversations>;
const at = (id: string) => useMessagingStore.getState().conversations.find((c) => c.id === id);

beforeEach(() => {
  jest.clearAllMocks();
  useMessagingStore.setState({
    myUserId: 'me', conversations: [conv()], messages: {}, outbox: [], drafts: {}, wallpapers: {},
    privacy: { readReceipts: true, lastSeen: 'everyone', blocked: [] },
  });
});

describe('mute / archive / pin', () => {
  it('applies the change instantly, before the server answers', async () => {
    let seenDuringRequest: ChatConversation | undefined;
    setSettings.mockImplementation(async () => { seenDuringRequest = at('c1'); return conv({ muted: true }); });

    await useMessagingStore.getState().setConversationSettings('c1', { muted: true, muteHours: 8 });

    expect(seenDuringRequest?.muted).toBe(true); // optimistic — the row reacted on the tap
    expect(at('c1')?.muted).toBe(true);
  });

  it('stamps an expiry for a timed mute and clears it for "Always"', async () => {
    setSettings.mockResolvedValue(conv({ muted: true }));

    await useMessagingStore.getState().setConversationSettings('c1', { muted: true, muteHours: 8 });
    expect(setSettings).toHaveBeenCalledWith('c1', { muted: true, muteHours: 8 });

    useMessagingStore.setState({ conversations: [conv()] });
    await useMessagingStore.getState().setConversationSettings('c1', { muted: true, muteHours: null });
    // No expiry set ⇒ muted until explicitly unmuted.
    expect(at('c1')?.mutedUntil ?? null).toBeNull();
  });

  it('reverts to the server truth when the change is refused', async () => {
    setSettings.mockRejectedValue(new Error('nope'));
    listConversations.mockResolvedValue([conv({ pinned: false })]);

    await useMessagingStore.getState().setConversationSettings('c1', { pinned: true });

    expect(listConversations).toHaveBeenCalled(); // resynced rather than left showing a lie
  });
});

describe('drafts', () => {
  it('keeps what was typed, per conversation, and drops it when emptied', () => {
    const store = useMessagingStore.getState();
    store.setDraft('c1', 'half a thought');
    expect(useMessagingStore.getState().drafts.c1).toBe('half a thought');

    store.setDraft('c2', 'other chat');
    expect(useMessagingStore.getState().drafts).toEqual({ c1: 'half a thought', c2: 'other chat' });

    store.setDraft('c1', '   '); // whitespace is not a draft
    expect(useMessagingStore.getState().drafts.c1).toBeUndefined();
  });
});

describe('wallpaper', () => {
  it('remembers a choice per chat', () => {
    useMessagingStore.getState().setWallpaper('c1', 'mint');
    expect(useMessagingStore.getState().wallpapers).toEqual({ c1: 'mint' });
  });
});

describe('privacy + blocking', () => {
  it('toggles instantly and keeps the server copy', async () => {
    updatePrivacy.mockResolvedValue({ readReceipts: false, lastSeen: 'everyone', blocked: [] });

    await useMessagingStore.getState().updatePrivacy({ readReceipts: false });

    expect(useMessagingStore.getState().privacy.readReceipts).toBe(false);
  });

  it('stores the block list the server returns', async () => {
    blockUser.mockResolvedValue({ readReceipts: true, lastSeen: 'everyone', blocked: ['u2'] });

    await useMessagingStore.getState().setBlocked('u2', true);

    expect(useMessagingStore.getState().privacy.blocked).toEqual(['u2']);
  });
});

describe('sign-out', () => {
  it('clears drafts, wallpapers and privacy along with the chats', () => {
    useMessagingStore.getState().setDraft('c1', 'unsent');
    useMessagingStore.getState().setWallpaper('c1', 'rose');

    useMessagingStore.getState().reset();

    const s = useMessagingStore.getState();
    expect(s.drafts).toEqual({});
    expect(s.wallpapers).toEqual({});
    expect(s.privacy.blocked).toEqual([]);
  });
});

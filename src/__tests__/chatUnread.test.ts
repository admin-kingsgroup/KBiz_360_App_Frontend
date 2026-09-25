import { useChatStore } from '../store/chatStore';
import { directChatsAsChats, directChats } from '../data/chats';

describe('Chat — unread marking integration', () => {
  beforeEach(() => useChatStore.getState().setChats(directChatsAsChats()));

  it('seeds chats from the DM list with unread carried over', () => {
    const chats = useChatStore.getState().chats;
    expect(chats.length).toBe(directChats.length);
    const u3 = chats.find((c) => c.id === 'u3');
    expect(u3?.unread).toBe(1); // Faiz Khan has 1 unread in seed
  });

  it('opening a chat (markRead) clears its unread', () => {
    expect(useChatStore.getState().chats.find((c) => c.id === 'u1')?.unread).toBe(2);
    useChatStore.getState().markRead('u1');
    expect(useChatStore.getState().chats.find((c) => c.id === 'u1')?.unread).toBe(0);
  });

  it('unreadTotal reflects marking read', () => {
    const before = useChatStore.getState().unreadTotal();
    useChatStore.getState().markRead('u1'); // clears 2
    expect(useChatStore.getState().unreadTotal()).toBe(before - 2);
  });
});

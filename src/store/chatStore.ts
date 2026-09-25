import { create } from 'zustand';
import type { Chat, Message } from '../types';

// Chat is mock today; realtime transport (send/receive, receipts, presence) is [NEEDS BACKEND].
// Store shape is transport-agnostic so a live client can replace the actions later.
export interface ChatState {
  chats: Chat[];
  messagesByChat: Record<string, Message[]>;
  setChats: (chats: Chat[]) => void;
  setMessages: (chatId: string, messages: Message[]) => void;
  appendMessage: (msg: Message) => void;
  markRead: (chatId: string) => void;
  unreadTotal: () => number;
  sortedChats: () => Chat[];      // unread-first, then most recent (mirrors current sort)
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messagesByChat: {},
  setChats: (chats) => set({ chats }),
  setMessages: (chatId, messages) =>
    set((s) => ({ messagesByChat: { ...s.messagesByChat, [chatId]: messages } })),
  appendMessage: (msg) =>
    set((s) => ({
      messagesByChat: {
        ...s.messagesByChat,
        [msg.chatId]: [...(s.messagesByChat[msg.chatId] || []), msg],
      },
    })),
  markRead: (chatId) =>
    set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? { ...c, unread: 0 } : c)) })),
  unreadTotal: () => get().chats.reduce((n, c) => n + (c.unread || 0), 0),
  sortedChats: () =>
    [...get().chats].sort((a, b) => ((b.unread || 0) > 0 ? 1 : 0) - ((a.unread || 0) > 0 ? 1 : 0) || (b.ts || 0) - (a.ts || 0)),
}));

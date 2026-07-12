import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import * as chatApi from '../api/chat';
import type { ChatConversation, ChatMessage, ChatReaction, ChatAttachment } from '../api/chat';

export type StoredMessage = ChatMessage & { pending?: boolean; failed?: boolean };
export interface PresenceInfo { status: 'online' | 'offline' | 'in_call'; lastSeen: number | null }
export interface OutboxItem {
  clientId: string;
  conversationId: string;
  type: ChatMessage['type'];
  text?: string;
  attachments?: ChatAttachment[];
  replyToId?: string;
  createdAt: number;
}

// Lazy + fail-safe AsyncStorage: dynamic-imported inside each method so importing this store in a
// plain Node/jest context never loads the native module (calls just no-op there).
const asyncStorage: StateStorage = {
  getItem: async (name) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; return await AS.getItem(name); } catch { return null; } },
  setItem: async (name, value) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; await AS.setItem(name, value); } catch { /* no-op */ } },
  removeItem: async (name) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; await AS.removeItem(name); } catch { /* no-op */ } },
};

interface MessagingState {
  myUserId: string | null;
  conversations: ChatConversation[];
  messages: Record<string, StoredMessage[]>;
  outbox: OutboxItem[];
  typing: Record<string, string[]>;
  presence: Record<string, PresenceInfo>;
  activeConversationId: string | null;
  loadingConversations: boolean;

  setMyUserId: (id: string | null) => void;
  reset: () => void;

  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  openDirect: (otherUserId: string) => Promise<string>;
  setActive: (conversationId: string | null) => void;
  loadPresence: (userIds: string[]) => Promise<void>;
  send: (conversationId: string, text: string, replyToId?: string) => Promise<void>;
  sendMedia: (conversationId: string, input: { type: ChatMessage['type']; attachments: ChatAttachment[]; text?: string }) => Promise<void>;
  retry: (clientId: string) => Promise<void>;
  flushOutbox: () => Promise<void>;
  edit: (messageId: string, conversationId: string, text: string) => Promise<void>;
  remove: (messageId: string, conversationId: string, scope: 'me' | 'everyone') => Promise<void>;
  react: (messageId: string, emoji: string) => Promise<void>;
  star: (messageId: string, conversationId: string) => Promise<void>;
  pin: (messageId: string, conversationId: string) => Promise<void>;
  markRead: (conversationId: string) => Promise<void>;

  onReceive: (m: ChatMessage & { clientId?: string }) => void;
  onDelivered: (p: { conversationId: string; messageIds: string[] }) => void;
  onRead: (p: { conversationId: string; messageIds: string[] }) => void;
  onEdit: (p: { id: string; conversationId: string; text: string; editedAt: string }) => void;
  onDelete: (p: { id: string; conversationId: string }) => void;
  onReaction: (p: { id: string; conversationId: string; reactions: ChatReaction[] }) => void;
  onTyping: (conversationId: string, userId: string, typing: boolean) => void;
  onPresence: (p: { userId: string; status?: string; lastSeen?: number | null; online?: boolean }) => void;

  _upsert: (conversationId: string, msg: StoredMessage) => void;
  _flush: (clientId: string) => Promise<void>;
}

const sortConvs = (cs: ChatConversation[]): ChatConversation[] =>
  [...cs].sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
const newClientId = (): string => `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export const useMessagingStore = create<MessagingState>()(
  persist(
    (set, get) => ({
      myUserId: null,
      conversations: [],
      messages: {},
      outbox: [],
      typing: {},
      presence: {},
      activeConversationId: null,
      loadingConversations: false,

      setMyUserId: (myUserId) => set({ myUserId }),
      reset: () => set({ conversations: [], messages: {}, outbox: [], typing: {}, presence: {}, activeConversationId: null }),

      loadConversations: async () => {
        if (get().loadingConversations) return; // coalesce the burst (focus + foreground + socket events)
        set({ loadingConversations: true });
        try {
          const fresh = sortConvs(await chatApi.listConversations());
          // Never let a refetch re-raise the badge for the chat the user is currently viewing
          // (avoids a race where loadConversations on socket-connect clobbers a just-marked-read 0).
          const active = get().activeConversationId;
          set({ conversations: active ? fresh.map((c) => (c.id === active ? { ...c, unread: 0 } : c)) : fresh });
        } catch { /* offline — keep cached */ } finally { set({ loadingConversations: false }); }
      },

      loadMessages: async (conversationId) => {
        try {
          const msgs = (await chatApi.getMessages(conversationId, { limit: 40 })) as StoredMessage[];
          // keep any still-pending outbox messages for this conversation appended after the server set
          set((s) => {
            const pending = (s.messages[conversationId] ?? []).filter((m) => m.pending || m.failed);
            return { messages: { ...s.messages, [conversationId]: [...msgs, ...pending] } };
          });
        } catch { /* offline — keep cached */ }
      },

      openDirect: async (otherUserId) => {
        const conv = await chatApi.getOrCreateDirect(otherUserId);
        set((s) => ({ conversations: sortConvs([conv, ...s.conversations.filter((c) => c.id !== conv.id)]) }));
        return conv.id;
      },

      setActive: (activeConversationId) => set({ activeConversationId }),

      loadPresence: async (userIds) => {
        const ids = [...new Set(userIds)].filter(Boolean);
        if (!ids.length) return;
        try {
          const map = await chatApi.getPresence(ids);
          set((s) => {
            const presence = { ...s.presence };
            for (const [id, p] of Object.entries(map)) presence[id] = { status: (p.status as PresenceInfo['status']) ?? 'offline', lastSeen: p.lastSeen ?? null };
            return { presence };
          });
        } catch { /* offline — keep what we have */ }
      },

      // Optimistic + queued: the message shows instantly and is persisted to the outbox; if the
      // send fails (offline), it stays queued and is retried on reconnect (flushOutbox).
      send: async (conversationId, text, replyToId) => {
        const body = text.trim();
        if (!body) return;
        const clientId = newClientId();
        const myUserId = get().myUserId ?? '';
        const nowIso = new Date().toISOString();
        const optimistic: StoredMessage = {
          id: clientId, clientId, conversationId, senderId: myUserId, type: 'text', text: body,
          deletedForEveryone: false, attachments: [], replyTo: null, forwardedFrom: null, reactions: [],
          status: 'sent', sentAt: nowIso, deliveredAt: null, readAt: null, pinned: false, edited: false, editedAt: null,
          createdAt: nowIso, mine: true, starred: false, pending: true, failed: false,
        };
        set((s) => ({
          messages: { ...s.messages, [conversationId]: [...(s.messages[conversationId] ?? []), optimistic] },
          outbox: [...s.outbox, { clientId, conversationId, type: 'text', text: body, replyToId, createdAt: Date.now() }],
          // Optimistically surface the conversation (with a lastMessage) so it appears at the top of
          // the chat list immediately — even before the server confirms (real-app behaviour).
          conversations: sortConvs(s.conversations.map((c) => (c.id === conversationId
            ? { ...c, lastMessage: { messageId: clientId, text: body, type: 'text', senderId: myUserId, at: nowIso }, lastActivityAt: nowIso }
            : c))),
        }));
        await get()._flush(clientId);
      },

      sendMedia: async (conversationId, input) => {
        // Media requires connectivity to upload; the chat screen handles upload + offline errors.
        const saved = await chatApi.sendMessage({ conversationId, type: input.type, text: input.text, attachments: input.attachments });
        get()._upsert(conversationId, { ...saved, pending: false });
        set((s) => ({ conversations: sortConvs(s.conversations.map((c) => (c.id === conversationId ? { ...c, lastMessage: { messageId: saved.id, text: saved.text || `[${saved.type}]`, type: saved.type, senderId: saved.senderId, at: saved.createdAt }, lastActivityAt: saved.createdAt } : c))) }));
      },

      retry: async (clientId) => {
        set((s) => ({ messages: Object.fromEntries(Object.entries(s.messages).map(([k, list]) => [k, list.map((m) => (m.clientId === clientId ? { ...m, pending: true, failed: false } : m))])) }));
        await get()._flush(clientId);
      },

      flushOutbox: async () => {
        for (const item of [...get().outbox]) { await get()._flush(item.clientId); }
      },

      edit: async (messageId, conversationId, text) => { const saved = await chatApi.editMessage(messageId, text); get()._upsert(conversationId, saved as StoredMessage); },
      remove: async (messageId, conversationId, scope) => {
        await chatApi.deleteMessage(messageId, scope);
        if (scope === 'me') set((s) => ({ messages: { ...s.messages, [conversationId]: (s.messages[conversationId] ?? []).filter((m) => m.id !== messageId) } }));
      },
      react: async (messageId, emoji) => { await chatApi.reactMessage(messageId, emoji); },
      star: async (messageId, conversationId) => {
        const { starred } = await chatApi.starMessage(messageId);
        set((s) => ({ messages: { ...s.messages, [conversationId]: (s.messages[conversationId] ?? []).map((m) => (m.id === messageId ? { ...m, starred } : m)) } }));
      },
      pin: async (messageId, conversationId) => { await chatApi.pinMessage(messageId); void conversationId; },
      markRead: async (conversationId) => {
        set((s) => ({ conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)) }));
        await chatApi.markConversationRead(conversationId).catch(() => undefined);
      },

      onReceive: (m) => {
        const my = get().myUserId;
        const stored: StoredMessage = { ...m, mine: m.senderId === my, starred: false, pending: false, failed: false };
        get()._upsert(m.conversationId, stored);
        // First message of a brand-new conversation → we don't have it yet. Refetch so it appears
        // in the list with the right name/metadata (real-app behaviour, not a silent drop).
        if (!get().conversations.some((c) => c.id === m.conversationId)) {
          void get().loadConversations();
        } else {
          set((s) => {
            const active = s.activeConversationId;
            const conversations = s.conversations.map((c) =>
              c.id === m.conversationId
                ? { ...c, lastMessage: { messageId: m.id, text: m.text, type: m.type, senderId: m.senderId, at: m.createdAt }, lastActivityAt: m.createdAt, unread: m.senderId === my || active === m.conversationId ? c.unread : c.unread + 1 }
                : c,
            );
            return { conversations: sortConvs(conversations) };
          });
        }
        if (get().activeConversationId === m.conversationId && m.senderId !== my) void get().markRead(m.conversationId);
      },
      onDelivered: (p) => set((s) => ({ messages: { ...s.messages, [p.conversationId]: (s.messages[p.conversationId] ?? []).map((m) => (p.messageIds.includes(m.id) && m.status === 'sent' ? { ...m, status: 'delivered' } : m)) } })),
      onRead: (p) => set((s) => ({ messages: { ...s.messages, [p.conversationId]: (s.messages[p.conversationId] ?? []).map((m) => (p.messageIds.includes(m.id) ? { ...m, status: 'read' } : m)) } })),
      onEdit: (p) => set((s) => ({ messages: { ...s.messages, [p.conversationId]: (s.messages[p.conversationId] ?? []).map((m) => (m.id === p.id ? { ...m, text: p.text, edited: true, editedAt: p.editedAt } : m)) } })),
      onDelete: (p) => set((s) => ({ messages: { ...s.messages, [p.conversationId]: (s.messages[p.conversationId] ?? []).map((m) => (m.id === p.id ? { ...m, deletedForEveryone: true, text: '', attachments: [] } : m)) } })),
      onReaction: (p) => set((s) => ({ messages: { ...s.messages, [p.conversationId]: (s.messages[p.conversationId] ?? []).map((m) => (m.id === p.id ? { ...m, reactions: p.reactions } : m)) } })),
      onTyping: (conversationId, userId, typing) => {
        const key = `${conversationId}:${userId}`;
        if (typingTimers[key]) { clearTimeout(typingTimers[key]); delete typingTimers[key]; }
        set((s) => { const cur = new Set(s.typing[conversationId] ?? []); if (typing) cur.add(userId); else cur.delete(userId); return { typing: { ...s.typing, [conversationId]: [...cur] } }; });
        if (typing) typingTimers[key] = setTimeout(() => get().onTyping(conversationId, userId, false), 5000);
      },
      onPresence: (p) => set((s) => ({ presence: { ...s.presence, [p.userId]: { status: (p.status as PresenceInfo['status']) ?? (p.online ? 'online' : 'offline'), lastSeen: p.lastSeen ?? null } } })),

      _upsert: (conversationId, msg) => {
        set((s) => {
          const list = s.messages[conversationId] ?? [];
          const byClient = msg.clientId ? list.findIndex((m) => m.clientId === msg.clientId) : -1;
          const byId = list.findIndex((m) => m.id === msg.id);
          let next: StoredMessage[];
          if (byClient >= 0) { next = [...list]; next[byClient] = { ...next[byClient], ...msg }; }
          else if (byId >= 0) { next = [...list]; next[byId] = { ...next[byId], ...msg }; }
          else next = [...list, msg];
          return { messages: { ...s.messages, [conversationId]: next } };
        });
      },

      _flush: async (clientId) => {
        const item = get().outbox.find((o) => o.clientId === clientId);
        if (!item) return;
        try {
          const saved = await chatApi.sendMessage({ conversationId: item.conversationId, text: item.text, type: item.type, attachments: item.attachments, replyToId: item.replyToId, clientId });
          set((s) => ({ outbox: s.outbox.filter((o) => o.clientId !== clientId) }));
          // Carry the clientId so _upsert REPLACES the optimistic row (the REST response omits it) —
          // otherwise the saved message is appended as a duplicate bubble with a clashing key.
          get()._upsert(item.conversationId, { ...saved, clientId, pending: false, failed: false });
          set((s) => ({ conversations: sortConvs(s.conversations.map((c) => (c.id === item.conversationId ? { ...c, lastMessage: { messageId: saved.id, text: saved.text || `[${saved.type}]`, type: saved.type, senderId: saved.senderId, at: saved.createdAt }, lastActivityAt: saved.createdAt } : c))) }));
        } catch {
          // keep queued; mark the optimistic bubble failed so the user can retry
          set((s) => ({ messages: { ...s.messages, [item.conversationId]: (s.messages[item.conversationId] ?? []).map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)) } }));
        }
      },
    }),
    {
      name: 'kb360-messaging',
      // v2: one-time reset of the cached chat list/messages so the server DB wipe (fresh demo) and
      // the duplicate-message fix start from a clean slate instead of stale persisted data.
      version: 2,
      migrate: () => ({ conversations: [], messages: {}, outbox: [] }),
      storage: createJSONStorage(() => asyncStorage),
      // Cache conversations/messages/outbox for offline; transient state (typing/presence/active) is not persisted.
      partialize: (s) => ({ conversations: s.conversations, messages: s.messages, outbox: s.outbox }),
    },
  ),
);

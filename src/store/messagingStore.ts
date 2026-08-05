import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import * as chatApi from '../api/chat';
import * as chatDb from '../services/chatDb';
import type { ChatConversation, ChatMessage, ChatReaction, ChatAttachment } from '../api/chat';

export type StoredMessage = ChatMessage & { pending?: boolean; failed?: boolean };
export interface PresenceInfo { status: 'online' | 'offline' | 'in_call'; lastSeen: number | null }
// Receipt events: `statuses` (new contract) carries the server's authoritative aggregate status per
// affected message; `messageIds` alone is the legacy fallback (mixed-deploy safety).
export interface ReceiptPayload { conversationId: string; by?: string; messageIds: string[]; at?: number; statuses?: { id: string; status: 'sent' | 'delivered' | 'read' }[] }
export interface OutboxItem {
  clientId: string;
  conversationId: string;
  type: ChatMessage['type'];
  text?: string;
  attachments?: ChatAttachment[];
  replyToId?: string;
  mentions?: string[];
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
  /** Catch-up watermark: everything changed up to (lastSyncAt, lastSyncId) is already on this device. */
  lastSyncAt: string | null;
  lastSyncId: string | null;
  /** Unsent composer text per conversation — WhatsApp keeps what you typed when you back out. */
  drafts: Record<string, string>;
  /** Per-chat wallpaper choice (a key from theme/wallpapers). Local to this device, like WhatsApp's. */
  wallpapers: Record<string, string>;
  /** Account-level privacy + block list, mirrored from the server. */
  privacy: { readReceipts: boolean; lastSeen: 'everyone' | 'nobody'; blocked: string[] };

  setMyUserId: (id: string | null) => void;
  reset: () => void;

  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  syncMessages: (conversationId: string) => Promise<void>;
  catchUp: () => Promise<void>;
  hydrateLocal: (limit?: number) => Promise<void>;
  prefetchMessages: (limit?: number) => Promise<void>;
  forgetConversation: (conversationId: string) => Promise<void>;
  setDraft: (conversationId: string, text: string) => void;
  setWallpaper: (conversationId: string, key: string) => void;
  setConversationSettings: (conversationId: string, patch: { muted?: boolean; muteHours?: number | null; archived?: boolean; pinned?: boolean }) => Promise<void>;
  setDisappearing: (conversationId: string, seconds: number | null) => Promise<void>;
  loadPrivacy: () => Promise<void>;
  updatePrivacy: (patch: { readReceipts?: boolean; lastSeen?: 'everyone' | 'nobody' }) => Promise<void>;
  setBlocked: (userId: string, blocked: boolean) => Promise<void>;
  clearLocalThread: (conversationId: string) => Promise<void>;
  loadOlderMessages: (conversationId: string) => Promise<number>;
  openDirect: (otherUserId: string) => Promise<string>;
  setActive: (conversationId: string | null) => void;
  loadPresence: (userIds: string[]) => Promise<void>;
  send: (conversationId: string, text: string, replyToId?: string, mentions?: string[]) => Promise<void>;
  sendMedia: (conversationId: string, input: { type: ChatMessage['type']; attachments: ChatAttachment[]; text?: string }) => Promise<void>;
  forward: (messageId: string, conversationIds: string[]) => Promise<number>;
  retry: (clientId: string) => Promise<void>;
  flushOutbox: () => Promise<void>;
  edit: (messageId: string, conversationId: string, text: string) => Promise<void>;
  remove: (messageId: string, conversationId: string, scope: 'me' | 'everyone') => Promise<void>;
  react: (messageId: string, emoji: string) => Promise<void>;
  star: (messageId: string, conversationId: string) => Promise<void>;
  pin: (messageId: string, conversationId: string) => Promise<void>;
  markRead: (conversationId: string) => Promise<void>;

  onReceive: (m: ChatMessage & { clientId?: string }) => void;
  onDelivered: (p: ReceiptPayload) => void;
  onRead: (p: ReceiptPayload) => void;
  onEdit: (p: { id: string; conversationId: string; text: string; editedAt: string }) => void;
  onDelete: (p: { id: string; conversationId: string }) => void;
  onReaction: (p: { id: string; conversationId: string; reactions: ChatReaction[] }) => void;
  onTyping: (conversationId: string, userId: string, typing: boolean) => void;
  onPresence: (p: { userId: string; status?: string; lastSeen?: number | string | null; online?: boolean }) => void;

  _upsert: (conversationId: string, msg: StoredMessage) => void;
  _ingest: (conversationId: string, msgs: StoredMessage[]) => void;
  _persistIds: (conversationId: string, ids: string[]) => void;
  _flush: (clientId: string) => Promise<void>;
}

// Chronological order, id as the tie-break so two messages in the same millisecond never swap places
// between renders (an unstable sort would make bubbles jitter).
const byTime = (a: StoredMessage, b: StoredMessage): number => {
  const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

const sortConvs = (cs: ChatConversation[]): ChatConversation[] =>
  [...cs].sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
const newClientId = (): string => `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};
// Conversations whose prefetch is in flight — keeps a re-focus of the chat list from re-firing the
// same background fetches (module-level: transient, never persisted).
const prefetching = new Set<string>();
let catchingUp = false;

const groupByConversation = (msgs: StoredMessage[]): Map<string, StoredMessage[]> => {
  const out = new Map<string, StoredMessage[]>();
  for (const m of msgs) out.set(m.conversationId, [...(out.get(m.conversationId) ?? []), m]);
  return out;
};

// lastSeen arrives as epoch ms (contract) but older servers leaked ISO strings — normalize to epoch ms.
export const toEpochMs = (v: number | string | null | undefined): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
  return null;
};

// Every message id a receipt event touched (new contract carries `statuses`, legacy only `messageIds`).
const receiptIds = (p: ReceiptPayload): string[] => [...new Set([...(p.statuses ?? []).map((e) => e.id), ...p.messageIds])];

const STATUS_RANK = { sent: 0, delivered: 1, read: 2 } as const;
// Apply a receipt event. New contract: `statuses` is the server's authoritative aggregate per message,
// applied with a monotonic guard (a tick never moves down — protects against out-of-order sockets).
// Legacy fallback (no statuses): upgrade the listed messageIds to `fallback`, same guard.
// The matching conversation's lastMessage.status is upgraded too so list ticks flip live.
const applyReceipt = (
  s: Pick<MessagingState, 'messages' | 'conversations'>,
  p: ReceiptPayload,
  fallback: 'delivered' | 'read',
): Pick<MessagingState, 'messages' | 'conversations'> => {
  const byId = new Map((p.statuses ?? []).map((e) => [e.id, e.status]));
  const next = (id: string): 'sent' | 'delivered' | 'read' | undefined =>
    byId.size ? byId.get(id) : p.messageIds.includes(id) ? fallback : undefined;
  const messages = {
    ...s.messages,
    [p.conversationId]: (s.messages[p.conversationId] ?? []).map((m) => {
      const st = next(m.id);
      return st && STATUS_RANK[st] > STATUS_RANK[m.status] ? { ...m, status: st } : m;
    }),
  };
  const conversations = s.conversations.map((c) => {
    if (c.id !== p.conversationId || !c.lastMessage) return c;
    const st = next(c.lastMessage.id ?? c.lastMessage.messageId ?? '');
    const cur = c.lastMessage.status;
    return st && STATUS_RANK[st] > (cur ? STATUS_RANK[cur] : -1) ? { ...c, lastMessage: { ...c.lastMessage, status: st } } : c;
  });
  return { messages, conversations };
};

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
      lastSyncAt: null,
      lastSyncId: null,
      drafts: {},
      wallpapers: {},
      privacy: { readReceipts: true, lastSeen: 'everyone', blocked: [] },

      setMyUserId: (myUserId) => set({ myUserId }),
      // Sign-out wipes the on-device history too — the next account on this handset must not inherit
      // the previous one's chats (WhatsApp does the same when you unlink).
      reset: () => { void chatDb.clearAll(); set({ conversations: [], messages: {}, outbox: [], typing: {}, presence: {}, activeConversationId: null, lastSyncAt: null, lastSyncId: null, drafts: {}, wallpapers: {}, privacy: { readReceipts: true, lastSeen: 'everyone', blocked: [] } }); },

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

      // Open a thread: DISK ONLY. The local database (services/chatDb) holds every message this
      // device has seen, and catchUp()/the socket keep it current — so a chat that has been opened
      // before makes NO request at all. The one exception is a thread this device has never stored
      // (fresh install, or a chat started elsewhere): that one backfills its newest page once.
      loadMessages: async (conversationId) => {
        if (!(get().messages[conversationId] ?? []).length) {
          const local = await chatDb.readRecent<StoredMessage>(conversationId, 60);
          if (local.length) {
            set((s) => {
              const pending = (s.messages[conversationId] ?? []).filter((m) => m.pending || m.failed);
              const have = new Set(local.map((m) => m.id));
              const kept = (s.messages[conversationId] ?? []).filter((m) => !have.has(m.id) && !m.pending && !m.failed);
              return { messages: { ...s.messages, [conversationId]: [...[...kept, ...local].sort(byTime), ...pending] } };
            });
          }
        }
        if (!(get().messages[conversationId] ?? []).some((m) => !m.pending && !m.failed)) {
          await get().syncMessages(conversationId); // nothing stored for this thread yet — first fill
        }
      },

      // The account-wide catch-up that replaces per-chat refetching: one request for everything that
      // changed anywhere since the watermark — messages, edits, deletions, reactions, ticks. Runs when
      // the socket connects and when the app returns to the foreground; the socket handles the rest
      // while running. With no watermark yet (fresh install) it only starts the clock: history then
      // arrives per-thread on first open, rather than dragging every conversation down at once.
      catchUp: async () => {
        const since = get().lastSyncAt;
        if (!since) { set({ lastSyncAt: new Date().toISOString(), lastSyncId: null }); return; }
        if (catchingUp) return; // reconnect storms must not stack these
        catchingUp = true;
        try {
          let cursor = since;
          let cursorId = get().lastSyncId;
          for (let page = 0; page < 25; page++) { // bounded: 25 × 200 messages per catch-up
            const res = await chatApi.syncSince(cursor, cursorId);
            for (const [cid, msgs] of groupByConversation(res.messages as StoredMessage[])) {
              if (get().conversations.some((c) => c.id === cid) || (get().messages[cid] ?? []).length) {
                get()._ingest(cid, msgs);
              } else {
                void chatDb.upsert(cid, msgs); // thread we have not opened yet — store, don't render
              }
            }
            cursor = res.until;
            cursorId = res.untilId;
            set({ lastSyncAt: cursor, lastSyncId: cursorId });
            if (!res.more) break;
          }
        } catch { /* offline — the watermark stays put and the next connect retries */ } finally { catchingUp = false; }
      },

      // Delta sync. Asks for the newest page (which also refreshes edits/deletes/reaction/tick changes
      // on recent messages), then — only if there is a hole between that page and what we already had —
      // walks FORWARD from our newest local message until the gap is closed. A device that is up to
      // date transfers one small page; a device that was offline for a week fills the whole gap once
      // and then never re-downloads it.
      syncMessages: async (conversationId) => {
        const newestLocal = [...(get().messages[conversationId] ?? [])].reverse().find((m) => !m.pending && !m.failed);
        try {
          const head = (await chatApi.getMessages(conversationId, { limit: 40 })) as StoredMessage[];
          get()._ingest(conversationId, head);
          if (!newestLocal || !head.length || head.some((m) => m.id === newestLocal.id)) return;
          let after = newestLocal.id;
          for (let hops = 0; hops < 20; hops++) { // bounded: ~2000 messages of catch-up per open
            const page = (await chatApi.getMessages(conversationId, { after, limit: 100 })) as StoredMessage[];
            if (!page.length) break;
            get()._ingest(conversationId, page);
            after = page[page.length - 1].id;
            if (page.length < 100) break;
          }
        } catch { /* offline — the local thread is already on screen */ }
      },

      // Pull the recent threads off disk into memory at startup, so the FIRST tap on a chat is instant
      // too. Local reads only — no network, no spinner, cheap enough to run on every chat-list focus.
      hydrateLocal: async (limit = 12) => {
        const targets = get().conversations.filter((c) => !c.archived && !(get().messages[c.id] ?? []).length).slice(0, limit);
        for (const c of targets) {
          const local = await chatDb.readRecent<StoredMessage>(c.id, 60);
          if (!local.length) continue;
          set((s) => (s.messages[c.id]?.length ? s : { messages: { ...s.messages, [c.id]: local } }));
        }
      },

      // Background catch-up for the conversations the user is most likely to open next: hydrate from
      // disk first (instant), then delta-sync the ones the chat list says are behind. One at a time,
      // never the open chat (it syncs itself), and silent on failure.
      prefetchMessages: async (limit = 8) => {
        await get().hydrateLocal(limit);
        const { conversations, messages, activeConversationId } = get();
        const behind = (c: ChatConversation): boolean => {
          const local = messages[c.id];
          if (!local?.length) return true;
          const lastId = c.lastMessage?.messageId ?? c.lastMessage?.id;
          return !!lastId && !local.some((m) => m.id === lastId);
        };
        const targets = conversations
          .filter((c) => !c.archived && c.id !== activeConversationId && c.lastMessage && behind(c))
          .slice(0, limit);
        for (const c of targets) {
          if (prefetching.has(c.id)) continue;
          prefetching.add(c.id);
          try { await get().syncMessages(c.id); } finally { prefetching.delete(c.id); }
        }
      },

      // A conversation that no longer exists for this user (deleted, or removed from the group):
      // forget it in memory and on disk.
      forgetConversation: async (conversationId) => {
        set((s) => {
          const messages = { ...s.messages };
          delete messages[conversationId];
          return { messages, conversations: s.conversations.filter((c) => c.id !== conversationId) };
        });
        await chatDb.clearConversation(conversationId);
      },

      // A draft is whatever is in the composer when you leave — kept per chat and shown in the chat
      // list, so backing out of a half-written message never loses it.
      setDraft: (conversationId, text) => set((s) => {
        const drafts = { ...s.drafts };
        if (text.trim()) drafts[conversationId] = text; else delete drafts[conversationId];
        return { drafts };
      }),

      setWallpaper: (conversationId, key) => set((s) => ({ wallpapers: { ...s.wallpapers, [conversationId]: key } })),

      // Mute / archive / pin. Applied optimistically so the row reacts instantly, then reconciled
      // with the server's copy of the conversation.
      setConversationSettings: async (conversationId, patch) => {
        const optimistic: Partial<ChatConversation> = {};
        if (patch.muted !== undefined) {
          optimistic.muted = patch.muted;
          optimistic.mutedUntil = patch.muted && patch.muteHours ? new Date(Date.now() + patch.muteHours * 3600_000).toISOString() : null;
        }
        if (patch.archived !== undefined) optimistic.archived = patch.archived;
        if (patch.pinned !== undefined) optimistic.pinned = patch.pinned;
        set((s) => ({ conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, ...optimistic } : c)) }));
        try {
          const fresh = await chatApi.setConversationSettings(conversationId, patch);
          set((s) => ({ conversations: sortConvs(s.conversations.map((c) => (c.id === conversationId ? fresh : c))) }));
        } catch {
          void get().loadConversations(); // server refused — snap back to the truth
        }
      },

      setDisappearing: async (conversationId, seconds) => {
        await chatApi.setDisappearing(conversationId, seconds);
        set((s) => ({ conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, disappearAfterSec: seconds } : c)) }));
      },

      loadPrivacy: async () => {
        try { set({ privacy: await chatApi.getPrivacy() }); } catch { /* offline — keep what we have */ }
      },
      updatePrivacy: async (patch) => {
        set((s) => ({ privacy: { ...s.privacy, ...patch } })); // instant toggle
        try { set({ privacy: await chatApi.updatePrivacy(patch) }); } catch { void get().loadPrivacy(); }
      },
      setBlocked: async (userId, blocked) => {
        set({ privacy: await (blocked ? chatApi.blockUser(userId) : chatApi.unblockUser(userId)) });
      },

      // Free the space one chat's stored history occupies, WITHOUT leaving the conversation: the
      // thread is dropped from memory and disk, and refills from the server on next open (which is
      // why unsent outbox rows are kept — they have nowhere else to live).
      clearLocalThread: async (conversationId) => {
        set((s) => ({ messages: { ...s.messages, [conversationId]: (s.messages[conversationId] ?? []).filter((m) => m.pending || m.failed) } }));
        await chatDb.clearConversation(conversationId);
      },

      // Scrollback. Reads the previous page out of local storage — which is where history the device
      // has already downloaded lives, so paging back through old chats is instant and works offline.
      // Only when the local thread runs out does this reach for the server (and stores what it gets).
      loadOlderMessages: async (conversationId) => {
        const oldest = (get().messages[conversationId] ?? []).find((m) => !m.pending && !m.failed);
        if (!oldest) return 0;
        const local = await chatDb.readOlder<StoredMessage>(conversationId, oldest.id, 40);
        if (local.length) {
          set((s) => ({ messages: { ...s.messages, [conversationId]: [...local, ...(s.messages[conversationId] ?? [])] } }));
          return local.length;
        }
        try {
          const older = (await chatApi.getMessages(conversationId, { before: oldest.id, limit: 40 })) as StoredMessage[];
          if (older.length) {
            set((s) => ({ messages: { ...s.messages, [conversationId]: [...older, ...(s.messages[conversationId] ?? [])] } }));
            void chatDb.upsert(conversationId, older); // downloaded once, on the device for good
          }
          return older.length;
        } catch { return 0; }
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
            for (const [id, p] of Object.entries(map)) presence[id] = { status: p.status === 'online' || p.status === 'in_call' ? p.status : 'offline', lastSeen: toEpochMs(p.lastSeen) };
            return { presence };
          });
        } catch { /* offline — keep what we have */ }
      },

      // Optimistic + queued: the message shows instantly and is persisted to the outbox; if the
      // send fails (offline), it stays queued and is retried on reconnect (flushOutbox).
      send: async (conversationId, text, replyToId, mentions) => {
        const body = text.trim();
        if (!body) return;
        const clientId = newClientId();
        const myUserId = get().myUserId ?? '';
        const nowIso = new Date().toISOString();
        const optimistic: StoredMessage = {
          id: clientId, clientId, conversationId, senderId: myUserId, type: 'text', text: body,
          deletedForEveryone: false, attachments: [], replyTo: null, forwardedFrom: null, mentions: mentions ?? [], reactions: [],
          status: 'sent', sentAt: nowIso, deliveredAt: null, readAt: null, pinned: false, edited: false, editedAt: null,
          createdAt: nowIso, mine: true, starred: false, pending: true, failed: false,
        };
        set((s) => ({
          messages: { ...s.messages, [conversationId]: [...(s.messages[conversationId] ?? []), optimistic] },
          outbox: [...s.outbox, { clientId, conversationId, type: 'text', text: body, replyToId, mentions, createdAt: Date.now() }],
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
        set((s) => ({ conversations: sortConvs(s.conversations.map((c) => (c.id === conversationId ? { ...c, lastMessage: { messageId: saved.id, id: saved.id, text: saved.text || `[${saved.type}]`, type: saved.type, senderId: saved.senderId, at: saved.createdAt, status: saved.status ?? 'sent' }, lastActivityAt: saved.createdAt } : c))) }));
      },

      // Forward an existing message to other conversations. The server copies text/attachments and
      // stamps forwardedFrom; results are upserted here so they appear even if the socket echo is
      // late/down (the socket's chat:receive then dedupes by id). Returns how many actually sent —
      // the server silently skips destinations the user is no longer a member of.
      forward: async (messageId, conversationIds) => {
        const sent = await chatApi.forwardMessage(messageId, conversationIds);
        for (const saved of sent) {
          get()._upsert(saved.conversationId, { ...saved, pending: false, failed: false });
          set((s) => ({ conversations: sortConvs(s.conversations.map((c) => (c.id === saved.conversationId ? { ...c, lastMessage: { messageId: saved.id, id: saved.id, text: saved.text || `[${saved.type}]`, type: saved.type, senderId: saved.senderId, at: saved.createdAt, status: saved.status ?? 'sent' }, lastActivityAt: saved.createdAt } : c))) }));
        }
        return sent.length;
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
        if (scope === 'me') {
          set((s) => ({ messages: { ...s.messages, [conversationId]: (s.messages[conversationId] ?? []).filter((m) => m.id !== messageId) } }));
          void chatDb.removeMessages(conversationId, [messageId]); // gone from this device for good
        }
      },
      react: async (messageId, emoji) => { await chatApi.reactMessage(messageId, emoji); },
      star: async (messageId, conversationId) => {
        const { starred } = await chatApi.starMessage(messageId);
        set((s) => ({ messages: { ...s.messages, [conversationId]: (s.messages[conversationId] ?? []).map((m) => (m.id === messageId ? { ...m, starred } : m)) } }));
        get()._persistIds(conversationId, [messageId]);
      },
      pin: async (messageId, conversationId) => {
        const { pinned } = await chatApi.pinMessage(messageId);
        set((s) => ({ messages: { ...s.messages, [conversationId]: (s.messages[conversationId] ?? []).map((m) => (m.id === messageId ? { ...m, pinned } : m)) } }));
        get()._persistIds(conversationId, [messageId]);
      },
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
                ? { ...c, lastMessage: { messageId: m.id, id: m.id, text: m.text, type: m.type, senderId: m.senderId, at: m.createdAt, status: m.status ?? 'sent' }, lastActivityAt: m.createdAt, unread: m.senderId === my || active === m.conversationId ? c.unread : c.unread + 1 }
                : c,
            );
            return { conversations: sortConvs(conversations) };
          });
        }
        if (get().activeConversationId === m.conversationId && m.senderId !== my) void get().markRead(m.conversationId);
      },
      // Every live event writes through to local storage: the next open reads the DEVICE, so a tick,
      // an edit or a reaction that only landed in memory would silently roll back after a restart.
      onDelivered: (p) => { set((s) => applyReceipt(s, p, 'delivered')); get()._persistIds(p.conversationId, receiptIds(p)); },
      onRead: (p) => { set((s) => applyReceipt(s, p, 'read')); get()._persistIds(p.conversationId, receiptIds(p)); },
      onEdit: (p) => {
        set((s) => ({ messages: { ...s.messages, [p.conversationId]: (s.messages[p.conversationId] ?? []).map((m) => (m.id === p.id ? { ...m, text: p.text, edited: true, editedAt: p.editedAt } : m)) } }));
        get()._persistIds(p.conversationId, [p.id]);
      },
      onDelete: (p) => {
        set((s) => ({ messages: { ...s.messages, [p.conversationId]: (s.messages[p.conversationId] ?? []).map((m) => (m.id === p.id ? { ...m, deletedForEveryone: true, text: '', attachments: [] } : m)) } }));
        get()._persistIds(p.conversationId, [p.id]);
      },
      onReaction: (p) => {
        set((s) => ({ messages: { ...s.messages, [p.conversationId]: (s.messages[p.conversationId] ?? []).map((m) => (m.id === p.id ? { ...m, reactions: p.reactions } : m)) } }));
        get()._persistIds(p.conversationId, [p.id]);
      },
      onTyping: (conversationId, userId, typing) => {
        const key = `${conversationId}:${userId}`;
        if (typingTimers[key]) { clearTimeout(typingTimers[key]); delete typingTimers[key]; }
        set((s) => { const cur = new Set(s.typing[conversationId] ?? []); if (typing) cur.add(userId); else cur.delete(userId); return { typing: { ...s.typing, [conversationId]: [...cur] } }; });
        if (typing) typingTimers[key] = setTimeout(() => get().onTyping(conversationId, userId, false), 5000);
      },
      onPresence: (p) => set((s) => {
        // Guard the status cast (unknown strings → offline unless the legacy `online` flag says otherwise).
        const status: PresenceInfo['status'] = p.status === 'online' || p.status === 'offline' || p.status === 'in_call' ? p.status : p.online ? 'online' : 'offline';
        return { presence: { ...s.presence, [p.userId]: { status, lastSeen: toEpochMs(p.lastSeen) } } };
      }),

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
        // Write through to local storage. In-flight bubbles are skipped on purpose: they live under a
        // clientId, the outbox already persists them, and storing one would leave an orphan on disk
        // once the server assigns the real id. So nothing here ever needs cleaning up afterwards.
        if (msg.pending || msg.failed) return;
        void chatDb.upsert(conversationId, [msg]);
      },

      // Merge a server page into memory and onto disk. Sorted by time (not arrival) so a gap-fill page
      // lands in the right place, and pending outbox bubbles always stay at the bottom.
      _ingest: (conversationId, msgs) => {
        if (!msgs.length) return;
        set((s) => {
          const list = s.messages[conversationId] ?? [];
          const pending = list.filter((m) => m.pending || m.failed);
          const byId = new Map(list.filter((m) => !m.pending && !m.failed).map((m) => [m.id, m]));
          // The server copy wins for shared fields; `starred` and clientId survive from what we hold.
          for (const m of msgs) byId.set(m.id, { ...byId.get(m.id), ...m, pending: false, failed: false });
          // A confirmed message arriving from the server replaces its own optimistic twin.
          const confirmedClientIds = new Set(msgs.map((m) => m.clientId).filter(Boolean));
          const stillPending = pending.filter((m) => !m.clientId || !confirmedClientIds.has(m.clientId));
          return { messages: { ...s.messages, [conversationId]: [...[...byId.values()].sort(byTime), ...stillPending] } };
        });
        void chatDb.upsert(conversationId, msgs);
      },

      // Persist messages that were changed in place (edits, reactions, ticks, star/pin) so the change
      // survives a restart — the local database, not the server, is what the next open reads.
      _persistIds: (conversationId, ids) => {
        const changed = (get().messages[conversationId] ?? []).filter((m) => ids.includes(m.id) && !m.pending && !m.failed);
        if (changed.length) void chatDb.upsert(conversationId, changed);
      },

      _flush: async (clientId) => {
        const item = get().outbox.find((o) => o.clientId === clientId);
        if (!item) return;
        try {
          const saved = await chatApi.sendMessage({ conversationId: item.conversationId, text: item.text, type: item.type, attachments: item.attachments, replyToId: item.replyToId, mentions: item.mentions, clientId });
          set((s) => ({ outbox: s.outbox.filter((o) => o.clientId !== clientId) }));
          // Carry the clientId so _upsert REPLACES the optimistic row (the REST response omits it) —
          // otherwise the saved message is appended as a duplicate bubble with a clashing key.
          get()._upsert(item.conversationId, { ...saved, clientId, pending: false, failed: false });
          set((s) => ({ conversations: sortConvs(s.conversations.map((c) => (c.id === item.conversationId ? { ...c, lastMessage: { messageId: saved.id, id: saved.id, text: saved.text || `[${saved.type}]`, type: saved.type, senderId: saved.senderId, at: saved.createdAt, status: saved.status ?? 'sent' }, lastActivityAt: saved.createdAt } : c))) }));
        } catch {
          // keep queued; mark the optimistic bubble failed so the user can retry
          set((s) => ({ messages: { ...s.messages, [item.conversationId]: (s.messages[item.conversationId] ?? []).map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)) } }));
        }
      },
    }),
    {
      name: 'kb360-messaging',
      // v2: one-time reset of the cached chat list/messages so the server DB wipe (fresh demo) and
      //     the duplicate-message fix start from a clean slate instead of stale persisted data.
      // v3: MESSAGES MOVED OUT of AsyncStorage into the on-device message database (services/chatDb).
      //     AsyncStorage is one JSON blob under one key — capped at ~6 MB on Android and reparsed in
      //     full on every write — which is no place for "every chat, forever". Only the conversation
      //     list and the unsent outbox stay here; threads live in chat-db/ and are read per chunk.
      version: 3,
      migrate: (state, from) => {
        const s = (state ?? {}) as Partial<MessagingState>;
        // Keep the chat list + outbox across the upgrade; threads refill from chat-db/ and delta sync.
        return from >= 2
          ? { conversations: s.conversations ?? [], messages: {}, outbox: s.outbox ?? [] }
          : { conversations: [], messages: {}, outbox: [] };
      },
      storage: createJSONStorage(() => asyncStorage),
      partialize: (s) => ({ conversations: s.conversations, outbox: s.outbox, lastSyncAt: s.lastSyncAt, lastSyncId: s.lastSyncId, drafts: s.drafts, wallpapers: s.wallpapers, privacy: s.privacy }),
    },
  ),
);

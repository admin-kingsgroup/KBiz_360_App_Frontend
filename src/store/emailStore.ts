import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { Email, EmailDraft, EmailFolder, SmartFolder } from '../types';
import * as emailApi from '../api/email';
import { hydrateBodies, saveBody, loadBody, clearBodies } from '../services/emailBodyCache';

// File-backed storage for the mailbox cache (documentDirectory/<name>.json). A file instead of
// AsyncStorage because the whole mailbox is persisted and Android caps an AsyncStorage entry at
// ~2MB. Lazy + fail-safe: dynamic-imported per call so Node/jest contexts no-op.
const fileStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const FS = await import('expo-file-system/legacy');
      const f = `${FS.documentDirectory}${name}.json`;
      return (await FS.getInfoAsync(f)).exists ? await FS.readAsStringAsync(f) : null;
    } catch { return null; }
  },
  setItem: async (name, value) => {
    try { const FS = await import('expo-file-system/legacy'); await FS.writeAsStringAsync(`${FS.documentDirectory}${name}.json`, value); } catch { /* no-op */ }
  },
  removeItem: async (name) => {
    try { const FS = await import('expo-file-system/legacy'); await FS.deleteAsync(`${FS.documentDirectory}${name}.json`, { idempotent: true }); } catch { /* no-op */ }
  },
};

// Mailbox state backed by the backend Microsoft Graph proxy (src/api/email.ts). Folders load on
// demand; mutating actions update locally (optimistic) and fire the matching Graph call.
// The mailbox (messages, folder, account, unread) is persisted to AsyncStorage so mail loads
// instantly on relaunch and stays readable offline; refreshes reconcile it when back online.
export interface EmailState {
  emails: Email[];
  folder: EmailFolder;
  search: string;
  connected: boolean | null; // null = not checked yet
  account: string | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: Partial<Record<EmailFolder, boolean>>; // per-folder: is there another page to fetch?
  inboxUnread: number; // real Graph unreadItemCount → Email tab badge
  searchResults: Email[]; // server-side ($search) results for the current query
  searching: boolean;
  smartFolders: SmartFolder[]; // user-created auto-categorize folders

  loadSmartFolders: () => Promise<void>;
  createSmartFolder: (name: string, from: string[]) => Promise<SmartFolder | null>;
  deleteSmartFolder: (id: string) => Promise<void>;
  setFolder: (folder: EmailFolder) => void;
  setSearch: (q: string) => void;
  setEmails: (emails: Email[]) => void;
  byId: (id: string) => Email | undefined;

  checkStatus: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  loadFolder: (folder?: EmailFolder) => Promise<void>;
  silentRefresh: (folder?: EmailFolder) => Promise<void>; // re-fetch newest page, merge in new mail, no spinner
  loadMore: (folder?: EmailFolder) => Promise<void>;
  runSearch: (q: string) => Promise<void>;
  loadMessage: (id: string) => Promise<void>;
  disconnect: () => Promise<void>;

  markRead: (id: string) => void;
  markAllRead: (folder?: EmailFolder) => Promise<void>;
  toggleRead: (id: string) => void;
  toggleStar: (id: string) => void;
  moveToFolder: (id: string, folder: EmailFolder) => void;
  deleteForever: (id: string) => void;
  send: (draft: EmailDraft) => Promise<void>;
  saveDraft: (draft: EmailDraft) => Promise<void>;
}

const patch = (emails: Email[], id: string, set: Partial<Email>): Email[] => emails.map((e) => (e.id === id ? { ...e, ...set } : e));

// Kick the background body cache after a page lands: fetch full bodies for the new messages and
// prune cached bodies for mail the store no longer tracks.
const hydrate = (fresh: Email[], all: Email[]): void => { void hydrateBodies(fresh, all.map((e) => e.id)); };

export const useEmailStore = create<EmailState>()(persist((set, get) => ({
  emails: [],
  folder: 'inbox',
  search: '',
  connected: null,
  account: null,
  loading: false,
  loadingMore: false,
  hasMore: {},
  inboxUnread: 0,
  searchResults: [],
  searching: false,
  smartFolders: [],

  loadSmartFolders: async () => {
    try { set({ smartFolders: await emailApi.listSmartFolders() }); } catch { /* keep last */ }
  },
  createSmartFolder: async (name, from) => {
    try {
      const sf = await emailApi.createSmartFolder(name, from, true);
      set((st) => ({ smartFolders: [...st.smartFolders, sf] }));
      return sf;
    } catch { return null; }
  },
  deleteSmartFolder: async (id) => {
    set((st) => ({ smartFolders: st.smartFolders.filter((f) => f.id !== id) })); // optimistic
    try { await emailApi.deleteSmartFolder(id); } catch { void get().loadSmartFolders(); }
  },
  setFolder: (folder) => { set({ folder, search: '', searchResults: [], searching: false }); void get().loadFolder(folder); },
  setSearch: (search) => set({ search }),
  setEmails: (emails) => set({ emails }),
  byId: (id) => get().emails.find((e) => e.id === id),

  checkStatus: async () => {
    try {
      const s = await emailApi.getStatus();
      if (s.connected) {
        set({ connected: true, account: s.email });
        void get().loadFolder(get().folder); void get().refreshUnread(); void get().loadSmartFolders();
      } else {
        // The server says the mailbox is genuinely disconnected — clear the cached session too.
        set({ connected: false, account: null, emails: [], inboxUnread: 0, smartFolders: [] });
        void clearBodies();
      }
    } catch {
      // Network error (offline / backend unreachable): keep the cached mailbox so mail stays
      // readable offline. Only fall to the connect screen if there was never a session here.
      set((st) => (st.account ? {} : { connected: false }));
    }
  },

  // Real Inbox unread count from Graph (exact). Safe to call any time; no-op cost if not connected.
  refreshUnread: async () => {
    if (get().connected === false) { set({ inboxUnread: 0 }); return; }
    try {
      const { inbox } = await emailApi.getUnread();
      set({ inboxUnread: Math.max(0, inbox || 0) });
    } catch { /* keep last value */ }
  },

  loadFolder: async (folder) => {
    const f = folder ?? get().folder;
    if (get().connected === false) return;
    set({ loading: true });
    try {
      const list = await emailApi.listMessages(f, 0);
      // Merge the fresh page over what we have; KEEP older/scrolled-past messages (don't replace the
      // folder) so the offline cache accumulates the whole mailbox as the user reads it. A message
      // deleted/moved server-side lingers until acted on here — accepted trade-off for offline-first.
      set((st) => {
        const freshIds = new Set(list.map((e) => e.id));
        const keptOlder = st.emails.filter((e) => e.folder === f && !freshIds.has(e.id));
        return {
          emails: [...st.emails.filter((e) => e.folder !== f), ...list, ...keptOlder],
          hasMore: { ...st.hasMore, [f]: st.hasMore[f] ?? list.length >= emailApi.EMAIL_PAGE },
          loading: false,
        };
      });
      hydrate(list, get().emails);
    } catch {
      set({ loading: false });
    }
  },

  // Background refresh of the newest page — no spinner, preserves already-loaded older pages and
  // the user's scroll. Used on focus / app-foreground / a light poll so new mail appears in the
  // list automatically (the badge alone updating, but the list staying stale, was the bug).
  silentRefresh: async (folder) => {
    const f = folder ?? get().folder;
    if (get().connected === false) return;
    try {
      const page0 = await emailApi.listMessages(f, 0);
      set((st) => {
        const freshIds = new Set(page0.map((e) => e.id));
        const keptOlder = st.emails.filter((e) => e.folder === f && !freshIds.has(e.id)); // pages already scrolled past
        const others = st.emails.filter((e) => e.folder !== f); // other folders' cached mail
        return {
          emails: [...others, ...page0, ...keptOlder],
          hasMore: { ...st.hasMore, [f]: st.hasMore[f] ?? page0.length >= emailApi.EMAIL_PAGE },
        };
      });
      hydrate(page0, get().emails);
    } catch { /* keep last */ }
  },

  // Server-side search across the whole current folder. Guards against stale results from a
  // superseded query (only applies if it's still the current search text).
  runSearch: async (q) => {
    const query = q.trim();
    if (!query) { set({ searchResults: [], searching: false }); return; }
    if (get().connected === false) return;
    set({ searching: true });
    try {
      const res = await emailApi.searchMessages(query); // all folders
      if (get().search.trim() === query) set({ searchResults: res, searching: false });
      else set({ searching: false });
    } catch {
      set({ searching: false });
    }
  },

  // Infinite scroll: fetch the next page for the folder and append it (de-duplicated).
  loadMore: async (folder) => {
    const f = folder ?? get().folder;
    if (get().connected === false || get().loading || get().loadingMore || get().hasMore[f] === false) return;
    const skip = get().emails.filter((e) => e.folder === f).length;
    set({ loadingMore: true });
    try {
      const more = await emailApi.listMessages(f, skip);
      set((st) => {
        const have = new Set(st.emails.map((e) => e.id));
        const fresh = more.filter((e) => !have.has(e.id));
        return {
          emails: [...st.emails, ...fresh],
          hasMore: { ...st.hasMore, [f]: more.length >= emailApi.EMAIL_PAGE },
          loadingMore: false,
        };
      });
      hydrate(more, get().emails);
    } catch {
      set({ loadingMore: false });
    }
  },

  loadMessage: async (id) => {
    const existing = get().byId(id);
    try {
      const full = await emailApi.getMessage(id, existing?.folder);
      // Preserve the message's real folder (the detail fetch defaults to inbox) so Sent/Drafts/Trash
      // items keep their folder-scoped actions and don't jump into the inbox list.
      const merged = { ...(existing ? { ...full, folder: existing.folder } : full), bodyFull: true };
      set((st) => ({ emails: st.emails.some((e) => e.id === id) ? patch(st.emails, id, merged) : [...st.emails, merged] }));
      void saveBody(id, { body: full.body, bodyType: full.bodyType });
    } catch {
      // Offline: fall back to the cached full body (from a previous open or background hydration).
      const cached = await loadBody(id);
      if (cached && existing) set((st) => ({ emails: patch(st.emails, id, { body: cached.body, bodyType: cached.bodyType, bodyFull: true }) }));
    }
  },

  disconnect: async () => {
    await emailApi.disconnect().catch(() => undefined);
    set({ connected: false, account: null, emails: [], inboxUnread: 0 });
    void clearBodies();
  },

  // Mutations adjust the Inbox badge optimistically, then reconcile with Graph's real count.
  // They update `searchResults` alongside `emails`: a search hit may not be in the loaded list at
  // all (server-side search spans the whole mailbox), and the search view renders searchResults —
  // without this, acting on a result (read/star/delete) never changed what the user was looking at.
  markRead: (id) => {
    const e = get().byId(id) ?? get().searchResults.find((x) => x.id === id);
    const wasUnreadInbox = !!e && !e.read && e.folder === 'inbox';
    set((st) => ({ emails: patch(st.emails, id, { read: true }), searchResults: patch(st.searchResults, id, { read: true }), inboxUnread: wasUnreadInbox ? Math.max(0, st.inboxUnread - 1) : st.inboxUnread }));
    void emailApi.setRead(id, true).then(() => get().refreshUnread()).catch(() => undefined);
  },
  // Mark every message in a folder read — optimistic locally, then the server, then reconcile count.
  // Prefers the bulk endpoint (marks the WHOLE folder server-side); if that isn't available yet, falls
  // back to marking each currently-loaded unread message via the per-message endpoint.
  markAllRead: async (folder) => {
    const f = folder ?? get().folder;
    // Optimistically clear the whole folder's badge immediately (user asked to mark ALL read) — the
    // server work below runs in the background and refreshUnread reconciles the true count at the end.
    set((st) => ({
      emails: st.emails.map((e) => (e.folder === f && !e.read ? { ...e, read: true } : e)),
      inboxUnread: f === 'inbox' ? 0 : st.inboxUnread,
    }));
    try {
      await emailApi.markAllRead(f); // bulk: marks every unread in the folder server-side (one shot)
    } catch {
      // Fallback (bulk endpoint not deployed yet): page through the WHOLE folder and mark every unread
      // via the per-message endpoint — so it covers mail that wasn't loaded into the list, not just the
      // visible page. Capped to avoid a runaway on very large mailboxes.
      try {
        for (let skip = 0; skip < 4000; skip += emailApi.EMAIL_PAGE) {
          const page = await emailApi.listMessages(f, skip);
          const unread = page.filter((e) => !e.read);
          if (unread.length) await Promise.all(unread.map((e) => emailApi.setRead(e.id, true).catch(() => undefined)));
          if (page.length < emailApi.EMAIL_PAGE) break; // last page reached
        }
      } catch { /* best-effort */ }
    }
    void get().refreshUnread();
  },
  toggleRead: (id) => {
    const e = get().byId(id) ?? get().searchResults.find((x) => x.id === id); if (!e) return;
    const read = !e.read;
    const delta = e.folder === 'inbox' ? (read ? -1 : 1) : 0;
    set((st) => ({ emails: patch(st.emails, id, { read }), searchResults: patch(st.searchResults, id, { read }), inboxUnread: Math.max(0, st.inboxUnread + delta) }));
    void emailApi.setRead(id, read).then(() => get().refreshUnread()).catch(() => undefined);
  },
  toggleStar: (id) => {
    const e = get().byId(id) ?? get().searchResults.find((x) => x.id === id); if (!e) return;
    const starred = !e.starred;
    set((st) => ({ emails: patch(st.emails, id, { starred }), searchResults: patch(st.searchResults, id, { starred }) }));
    void emailApi.setStarred(id, starred).catch(() => undefined);
  },
  moveToFolder: (id, folder) => {
    const e = get().byId(id) ?? get().searchResults.find((x) => x.id === id);
    const leftInbox = !!e && !e.read && e.folder === 'inbox' && folder !== 'inbox';
    set((st) => ({
      emails: patch(st.emails, id, { folder }),
      // Moving to Deleted from search = "delete this": drop the row so the result list reflects it.
      searchResults: folder === 'deleted' ? st.searchResults.filter((x) => x.id !== id) : patch(st.searchResults, id, { folder }),
      inboxUnread: leftInbox ? Math.max(0, st.inboxUnread - 1) : st.inboxUnread,
    }));
    void emailApi.moveMessage(id, folder).then((moved) => {
      // Graph re-keys the message on move — adopt the new id so later actions (open, delete
      // forever) address the real message instead of 404ing on the stale id.
      if (moved?.id && moved.id !== id) set((st) => ({ emails: patch(st.emails, id, { id: moved.id }), searchResults: patch(st.searchResults, id, { id: moved.id }) }));
      return get().refreshUnread();
    }).catch(() => undefined);
  },
  deleteForever: (id) => {
    const e = get().byId(id) ?? get().searchResults.find((x) => x.id === id);
    const wasUnreadInbox = !!e && !e.read && e.folder === 'inbox';
    set((st) => ({ emails: st.emails.filter((x) => x.id !== id), searchResults: st.searchResults.filter((x) => x.id !== id), inboxUnread: wasUnreadInbox ? Math.max(0, st.inboxUnread - 1) : st.inboxUnread }));
    void emailApi.deleteMessage(id).then(() => get().refreshUnread()).catch(() => undefined);
  },

  send: async (draft) => {
    try {
      const sent = await emailApi.sendMail(draft);
      // Drop the resumed draft (it moved to Sent server-side) and surface the sent item.
      set((st) => ({ emails: [sent, ...st.emails.filter((e) => e.id !== draft.id)] }));
    } catch { /* caller toasts */ }
  },
  saveDraft: async (draft) => {
    try {
      const d = await emailApi.saveDraft(draft);
      // Replace the existing draft in place when updating; otherwise add the new one.
      set((st) => (draft.id ? { emails: st.emails.map((e) => (e.id === draft.id ? d : e)) } : { emails: [d, ...st.emails] }));
    } catch { /* ignore */ }
  },
}), {
  name: 'kbiz360-email-cache',
  storage: createJSONStorage(() => fileStorage),
  version: 2,
  // Persist EVERY loaded message (no cap — the user should see all their mail offline), plus the
  // current folder, session, unread badge and smart folders. Full bodies live in the per-message
  // file cache (emailBodyCache), so here they collapse back to the preview snippet — that keeps
  // each state write small no matter how large the mailbox grows. Transient flags start fresh.
  partialize: (s) => ({
    emails: s.emails.map((e) => (e.bodyFull ? { ...e, body: e.preview } : e)),
    folder: s.folder,
    connected: s.connected,
    account: s.account,
    inboxUnread: s.inboxUnread,
    hasMore: s.hasMore,
    smartFolders: s.smartFolders,
  }),
}));

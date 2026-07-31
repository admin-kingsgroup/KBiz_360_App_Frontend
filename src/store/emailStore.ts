import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import type { Email, EmailDraft, EmailFolder, SmartFolder, OutlookFolder } from '../types';
import * as emailApi from '../api/email';
import { hydrateBodies, saveBody, loadBody, clearBodies } from '../services/emailBodyCache';

// The slice of EmailState that survives relaunch (see partialize below).
interface PersistedEmailState {
  emails: Email[];
  folder: EmailFolder;
  connected: boolean | null;
  account: string | null;
  inboxUnread: number;
  hasMore: Partial<Record<EmailFolder, boolean>>;
  smartFolders: SmartFolder[];
  outlookFolders: OutlookFolder[];
  lastFullSyncAt: number;
  folderSyncDone: Record<string, boolean>;
  lastSyncAttemptAt: number;
}

// File-backed storage for the mailbox cache (documentDirectory/<name>.json). A file instead of
// AsyncStorage because the whole mailbox is persisted and Android caps an AsyncStorage entry at
// ~2MB. Lazy + fail-safe: dynamic-imported per call so Node/jest contexts no-op.
//
// Writes are DEBOUNCED and serialized at flush time: zustand persist fires setItem on EVERY store
// change (each search keystroke, every read/star toggle, each poll merge). Stringifying the whole
// mailbox on each of those blocked the JS thread — one of the app-wide lag sources. Now bursts of
// changes collapse into one stringify+write, 1.5s after the burst quiets down.
const WRITE_DEBOUNCE_MS = 1500;
let pendingWrite: StorageValue<PersistedEmailState> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const fileStorage: PersistStorage<PersistedEmailState> = {
  getItem: async (name) => {
    try {
      const FS = await import('expo-file-system/legacy');
      const f = `${FS.documentDirectory}${name}.json`;
      if (!(await FS.getInfoAsync(f)).exists) return null;
      return JSON.parse(await FS.readAsStringAsync(f)) as StorageValue<PersistedEmailState>;
    } catch { return null; }
  },
  setItem: (name, value) => {
    pendingWrite = value;
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      const v = pendingWrite;
      pendingWrite = null;
      writeTimer = null;
      if (!v) return;
      void (async () => {
        try { const FS = await import('expo-file-system/legacy'); await FS.writeAsStringAsync(`${FS.documentDirectory}${name}.json`, JSON.stringify(v)); } catch { /* no-op */ }
      })();
    }, WRITE_DEBOUNCE_MS);
  },
  removeItem: async (name) => {
    pendingWrite = null;
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
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
  outlookFolders: OutlookFolder[]; // real Outlook folders the user created (with live counts)
  syncing: boolean; // full offline sync in progress
  syncProgress: number | null; // messages walked so far this sync (display only)
  lastFullSyncAt: number; // last COMPLETED full sync (0 = never) — gates auto re-runs
  // Folders whose history has been FULLY walked once ('inbox' | … | a Graph folder id). A done
  // folder is never re-walked — later passes fetch only its newest page. This is what stops the
  // mailbox re-downloading after an interrupted sync: completed folders stay completed.
  folderSyncDone: Record<string, boolean>;
  lastSyncAttemptAt: number; // last sync START — cool-down so a failing sync can't retry on every tab focus

  syncAll: () => Promise<void>; // download the whole mailbox (all folders + bodies) for offline
  cacheFolderPage: (graphFolderId: string, list: Email[]) => void; // merge user-folder mail into the offline cache
  loadOutlookFolders: () => Promise<void>;
  moveToGraphFolder: (id: string, folderId: string) => void; // file a message into an Outlook folder
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
  resetForLogout: () => void; // wipe all cached mailbox state on sign-out (no server call)

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

// Merge helper: keep the EXISTING object when a re-fetched message is display-identical. List rows
// are memo components keyed on object identity — without this, every 30s silent refresh minted new
// objects for the whole first page and repainted every row (the list stutter). When the message
// DID change (read/star/move), adopt the fresh copy but keep an already-loaded full body.
const displayEqual = (a: Email, b: Email): boolean =>
  a.read === b.read && a.starred === b.starred && a.folder === b.folder && a.graphFolderId === b.graphFolderId &&
  a.subject === b.subject && a.preview === b.preview && a.ts === b.ts && a.hasAttachments === b.hasAttachments && a.color === b.color;
const adopt = (existing: Email | undefined, fresh: Email): Email => {
  if (!existing) return fresh;
  if (displayEqual(existing, fresh)) return existing;
  return existing.bodyFull ? { ...fresh, body: existing.body, bodyType: existing.bodyType, bodyFull: true } : fresh;
};

// Cap how many multi-hundred-KB full bodies (HTML with inlined base64 images) stay in the JS heap:
// only the most recently OPENED messages keep theirs; older ones collapse back to the preview
// (the on-disk body cache still has the full copy, so re-opening is instant even offline).
// Unbounded full bodies were a main driver of the app's memory growth → Android killing the app.
const OPEN_BODY_KEEP = 6;
const BODY_COLLAPSE_MIN = 20_000; // small bodies are cheap — don't churn objects for them
let openedOrder: string[] = [];

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
  outlookFolders: [],
  syncing: false,
  syncProgress: null,
  lastFullSyncAt: 0,
  folderSyncDone: {},
  lastSyncAttemptAt: 0,

  // ── full offline sync ──
  // Walk EVERY folder (standard + user folders) to exhaustion, merging all message headers into
  // the persisted store, then backfill every full body into the on-disk cache — after one
  // completed run the entire mailbox reads with no internet at all. Sequential and resumable:
  // pages already in the store are skipped (skip = count loaded), so an interrupted run picks up
  // where it left off next time; lastFullSyncAt is only stamped on a COMPLETE pass.
  syncAll: async () => {
    const st0 = get();
    if (st0.syncing || st0.connected !== true) return;
    if (Date.now() - st0.lastFullSyncAt < 60 * 60 * 1000) return; // full pass ≤1h old — silentRefresh covers new mail
    // Cool-down between ATTEMPTS (not just completed passes): a big mailbox that keeps tripping
    // Graph throttling used to restart the download burst on every tab focus. Manual actions
    // (pull-to-refresh, opening folders) are unaffected — this only gates the automatic sweep.
    if (Date.now() - st0.lastSyncAttemptAt < 10 * 60 * 1000) return;
    set({ syncing: true, syncProgress: 0, lastSyncAttemptAt: Date.now() });
    let walked = 0;
    let complete = true;
    const bump = (n: number) => set({ syncProgress: n });
    const isDone = (key: string): boolean => get().folderSyncDone[key] === true;
    const markDone = (key: string): void => set((st) => ({ folderSyncDone: { ...st.folderSyncDone, [key]: true } }));
    // Append-only merge: messages already cached are NEVER fetched or replaced by the sweep
    // (read/star changes reconcile through loadFolder/silentRefresh instead).
    const mergeNew = (page: Email[], stamp?: (e: Email) => Email): number => {
      let added = 0;
      set((st) => {
        const have = new Set(st.emails.map((e) => e.id));
        const fresh = page.filter((e) => !have.has(e.id)).map((e) => (stamp ? stamp(e) : e));
        added = fresh.length;
        return fresh.length ? { emails: [...st.emails, ...fresh] } : {};
      });
      return added;
    };
    try {
      // 1. Standard folders. A folder whose history is already fully downloaded (folderSyncDone)
      //    is NOT re-walked — one newest-page fetch picks up anything new since the last pass.
      for (const f of ['inbox', 'sent', 'drafts', 'deleted', 'spam'] as EmailFolder[]) {
        if (isDone(f)) {
          try { walked += mergeNew(await emailApi.listMessages(f, 0)); bump(walked); } catch { complete = false; }
          continue;
        }
        for (let guard = 0; guard < 250; guard++) { // 250 × 40 = 10k messages per folder cap
          const skip = get().emails.filter((e) => e.folder === f && !e.graphFolderId).length;
          let page: Email[];
          try { page = await emailApi.listMessages(f, skip); } catch { complete = false; break; } // offline/throttled — resume next run
          walked += page.length; bump(walked); mergeNew(page);
          if (page.length < emailApi.EMAIL_PAGE) { markDone(f); set((st) => ({ hasMore: { ...st.hasMore, [f]: false } })); break; }
        }
      }
      // 2. User folders (Outlook-created + smart), by Graph folder id — same done-once rule.
      try { await get().loadOutlookFolders(); await get().loadSmartFolders(); } catch { /* use cached lists */ }
      const gids = new Set<string>([...get().outlookFolders.map((f) => f.id), ...get().smartFolders.map((sf) => sf.graphFolderId)]);
      for (const gid of gids) {
        if (isDone(gid)) {
          try { walked += mergeNew(await emailApi.listOutlookFolderMessages(gid, 0), (e) => ({ ...e, graphFolderId: gid })); bump(walked); } catch { complete = false; }
          continue;
        }
        for (let guard = 0; guard < 250; guard++) {
          const skip = get().emails.filter((e) => e.graphFolderId === gid).length;
          let page: Email[];
          try { page = await emailApi.listOutlookFolderMessages(gid, skip); } catch { complete = false; break; }
          get().cacheFolderPage(gid, page);
          walked += page.length; bump(walked);
          if (page.length < emailApi.EMAIL_PAGE) { markDone(gid); break; }
        }
      }
      // 3. Bodies: hydrate everything that's missing (newest first, sequential, resumes on failure).
      //    The on-disk body cache is checked per message, so already-downloaded bodies are skipped.
      hydrate(get().emails, get().emails);
    } finally {
      set({ syncing: false, syncProgress: null, ...(complete ? { lastFullSyncAt: Date.now() } : {}) });
    }
  },
  // Merge a user-folder page into the offline cache: stamp each message with its Graph folder id
  // (keeps it out of the standard views) and adopt over existing copies (identity-preserving).
  cacheFolderPage: (graphFolderId, list) => set((st) => {
    const byId = new Map(st.emails.map((e) => [e.id, e]));
    const freshIds = new Set(list.map((e) => e.id));
    const stamped = list.map((e) => adopt(byId.get(e.id), { ...e, graphFolderId }));
    return { emails: [...st.emails.filter((e) => !freshIds.has(e.id)), ...stamped] };
  }),

  loadOutlookFolders: async () => {
    try { set({ outlookFolders: await emailApi.listOutlookFolders() }); } catch { /* keep last */ }
  },
  // Optimistic: re-stamp the message into the target user folder (it leaves the standard views but
  // STAYS in the offline cache), bump the folder's counts, then let the server reconcile. Graph
  // re-keys on move — adopt the new id so the cached copy stays addressable.
  moveToGraphFolder: (id, folderId) => {
    const e = get().byId(id) ?? get().searchResults.find((x) => x.id === id);
    const wasUnreadInbox = !!e && !e.read && e.folder === 'inbox' && !e.graphFolderId;
    set((st) => ({
      emails: patch(st.emails, id, { graphFolderId: folderId }),
      searchResults: st.searchResults.filter((x) => x.id !== id),
      inboxUnread: wasUnreadInbox ? Math.max(0, st.inboxUnread - 1) : st.inboxUnread,
      outlookFolders: st.outlookFolders.map((f) => (f.id === folderId ? { ...f, total: f.total + 1, unread: f.unread + (e && !e.read ? 1 : 0) } : f)),
    }));
    void emailApi.moveToOutlookFolder(id, folderId)
      .then((moved) => {
        if (moved?.id && moved.id !== id) set((st) => ({ emails: patch(st.emails, id, { id: moved.id }) }));
        void get().refreshUnread(); void get().loadOutlookFolders();
      })
      .catch(() => { void get().silentRefresh(); void get().loadOutlookFolders(); }); // move failed → refresh restores truth
  },
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
        void get().loadFolder(get().folder); void get().refreshUnread(); void get().loadSmartFolders(); void get().loadOutlookFolders();
        void get().syncAll(); // background: bring the WHOLE mailbox offline (no-op if a recent pass completed)
      } else {
        // The server says the mailbox is genuinely disconnected — clear the cached session too.
        set({ connected: false, account: null, emails: [], inboxUnread: 0, smartFolders: [], outlookFolders: [] });
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
        const byId = new Map(st.emails.map((e) => [e.id, e]));
        const freshIds = new Set(list.map((e) => e.id));
        const keptOlder = st.emails.filter((e) => e.folder === f && !freshIds.has(e.id));
        return {
          emails: [...st.emails.filter((e) => e.folder !== f), ...list.map((e) => adopt(byId.get(e.id), e)), ...keptOlder],
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
        const byId = new Map(st.emails.map((e) => [e.id, e]));
        const freshIds = new Set(page0.map((e) => e.id));
        const keptOlder = st.emails.filter((e) => e.folder === f && !freshIds.has(e.id)); // pages already scrolled past
        const others = st.emails.filter((e) => e.folder !== f); // other folders' cached mail
        return {
          emails: [...others, ...page0.map((e) => adopt(byId.get(e.id), e)), ...keptOlder],
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
    // Drop the previous query's results while this one is in flight — the list falls back to the
    // client-side preview (instant), instead of showing stale hits from the superseded query.
    set({ searching: true, searchResults: [] });
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
    const skip = get().emails.filter((e) => e.folder === f && !e.graphFolderId).length;
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
      // Track open order and collapse large full bodies beyond the last OPEN_BODY_KEEP opened —
      // the disk cache keeps the full copy, so this only bounds the JS heap, not offline reading.
      openedOrder = [id, ...openedOrder.filter((x) => x !== id)].slice(0, 50);
      const keepFull = new Set(openedOrder.slice(0, OPEN_BODY_KEEP));
      set((st) => ({
        emails: (st.emails.some((e) => e.id === id) ? patch(st.emails, id, merged) : [...st.emails, merged]).map((e) =>
          e.bodyFull && !keepFull.has(e.id) && e.body.length > BODY_COLLAPSE_MIN
            ? { ...e, body: e.preview, bodyType: 'text' as const, bodyFull: false }
            : e,
        ),
      }));
      void saveBody(id, { body: full.body, bodyType: full.bodyType });
    } catch {
      // Offline: fall back to the cached full body (from a previous open or background hydration).
      const cached = await loadBody(id);
      if (cached && existing) set((st) => ({ emails: patch(st.emails, id, { body: cached.body, bodyType: cached.bodyType, bodyFull: true }) }));
    }
  },

  disconnect: async () => {
    await emailApi.disconnect().catch(() => undefined);
    set({ connected: false, account: null, emails: [], inboxUnread: 0, smartFolders: [], outlookFolders: [], lastFullSyncAt: 0, folderSyncDone: {}, lastSyncAttemptAt: 0 });
    void clearBodies();
  },

  // Sign-out wipe: the mailbox is persisted to disk, so without this the next user on the device
  // sees the previous user's cached inbox (and it merges into theirs). No server call — the account
  // stays connected server-side; we only clear THIS device's cached copy.
  resetForLogout: () => {
    set({
      emails: [], folder: 'inbox', search: '', connected: null, account: null,
      loading: false, loadingMore: false, hasMore: {}, inboxUnread: 0,
      searchResults: [], searching: false, smartFolders: [], outlookFolders: [],
      syncing: false, syncProgress: null, lastFullSyncAt: 0, folderSyncDone: {}, lastSyncAttemptAt: 0,
    });
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
      emails: st.emails.map((e) => (e.folder === f && !e.graphFolderId && !e.read ? { ...e, read: true } : e)),
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
    // Rethrow on failure so the composer can tell the user and keep the message. Previously this
    // swallowed the error while the caller assumed it toasted — a failed send vanished silently.
    const sent = await emailApi.sendMail(draft);
    // Drop the resumed draft (it moved to Sent server-side) and surface the sent item.
    set((st) => ({ emails: [sent, ...st.emails.filter((e) => e.id !== draft.id)] }));
  },
  saveDraft: async (draft) => {
    // Rethrow on failure so the caller knows the draft was NOT saved (else typed text is lost silently).
    const d = await emailApi.saveDraft(draft);
    // Replace the existing draft in place when updating; otherwise add the new one.
    set((st) => (draft.id ? { emails: st.emails.map((e) => (e.id === draft.id ? d : e)) } : { emails: [d, ...st.emails] }));
  },
}), {
  name: 'kbiz360-email-cache',
  storage: fileStorage,
  version: 2,
  // Persist EVERY loaded message (no cap — the user should see all their mail offline), plus the
  // current folder, session, unread badge and smart folders. Full bodies live in the per-message
  // file cache (emailBodyCache), so here they collapse back to the preview snippet (with the flags
  // reset to match — a stale bodyFull=true over a preview body rendered previews as if they were
  // the whole message after relaunch). That keeps each state write small however large the mailbox
  // grows. Transient flags start fresh.
  partialize: (s) => ({
    emails: s.emails.map((e) => (e.bodyFull ? { ...e, body: e.preview, bodyType: 'text' as const, bodyFull: false } : e)),
    folder: s.folder,
    connected: s.connected,
    account: s.account,
    inboxUnread: s.inboxUnread,
    hasMore: s.hasMore,
    smartFolders: s.smartFolders,
    outlookFolders: s.outlookFolders,
    lastFullSyncAt: s.lastFullSyncAt,
    folderSyncDone: s.folderSyncDone,
    lastSyncAttemptAt: s.lastSyncAttemptAt,
  }),
}));

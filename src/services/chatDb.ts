// ── Local message database (WhatsApp model) ──
// Every message the device has ever seen lives on internal storage, not in a network cache: opening a
// chat reads from here and paints immediately, and the server is only asked for what happened SINCE
// the newest message we already hold (delta sync in messagingStore).
//
// Layout: <documentDirectory>chat-db/<conversationId>/<seq>.json — each file a chronological array of
// up to CHUNK messages. Chunking is what keeps it fast at any thread length: opening a chat reads the
// LAST chunk (not the whole history), and a new message rewrites only that chunk.
//
// Deliberately not SQLite: expo-sqlite is not in the native build, expo-file-system already is — so
// this ships over-the-air. The public surface below is storage-shaped, so an expo-sqlite driver can
// replace the internals later without touching callers.

export interface DbMessage { id: string; createdAt: string }

const CHUNK = 200;      // messages per file (~100 KB) — the unit of both read and rewrite
const SCAN_CHUNKS = 20; // how far back an update may hunt for a message it has no index entry for

// Lazy + fail-safe filesystem, same pattern as the store's AsyncStorage adapter: dynamic-imported on
// first use so importing this module in a plain Node/jest context never loads the native module.
type FsModule = typeof import('expo-file-system/legacy');
let fsModule: FsModule | null = null;
async function fs(): Promise<FsModule | null> {
  if (fsModule) return fsModule;
  try { fsModule = await import('expo-file-system/legacy'); return fsModule; } catch { return null; }
}
const rootDir = (FS: FsModule): string => `${FS.documentDirectory ?? ''}chat-db/`;
const dirOf = (FS: FsModule, convId: string): string => `${rootDir(FS)}${encodeURIComponent(convId)}/`;
const fileOf = (FS: FsModule, convId: string, seq: number): string => `${dirOf(FS, convId)}${seq}.json`;

// id → chunk seq, per conversation. Filled in by every chunk read/write, so the common updates
// (edit / reaction / read-receipt on a message that is on screen) never scan the disk.
const indexes = new Map<string, Map<string, number>>();
const indexOf = (convId: string): Map<string, number> => {
  const m = indexes.get(convId) ?? new Map<string, number>();
  indexes.set(convId, m);
  return m;
};

// One writer at a time per conversation: chunk updates are read-modify-write, and a socket burst can
// otherwise interleave two of them and lose messages.
const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(fn);
  queues.set(key, next.catch(() => undefined));
  return next;
}

async function listSeqs(convId: string): Promise<number[]> {
  const FS = await fs();
  if (!FS) return [];
  try {
    const names = await FS.readDirectoryAsync(dirOf(FS, convId));
    return names
      .map((n) => Number.parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n >= 0)
      .sort((a, b) => a - b);
  } catch { return []; } // no directory yet = no history
}

async function readChunk<T extends DbMessage>(convId: string, seq: number): Promise<T[]> {
  const FS = await fs();
  let list: T[] = [];
  try {
    const raw = FS ? await FS.readAsStringAsync(fileOf(FS, convId, seq)) : '[]';
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) list = parsed as T[];
  } catch { /* missing or corrupt chunk — treated as empty, the server can refill it */ }
  const idx = indexOf(convId);
  for (const m of list) idx.set(m.id, seq);
  return list;
}

async function writeChunk<T extends DbMessage>(convId: string, seq: number, list: T[]): Promise<void> {
  const FS = await fs();
  if (!FS) return;
  try {
    await FS.makeDirectoryAsync(dirOf(FS, convId), { intermediates: true });
    await FS.writeAsStringAsync(fileOf(FS, convId, seq), JSON.stringify(list));
    const idx = indexOf(convId);
    for (const m of list) idx.set(m.id, seq);
  } catch { /* out of space / permission — the thread still works from memory this session */ }
}

const dedupe = <T extends DbMessage>(list: T[]): T[] => {
  const seen = new Set<string>();
  return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
};

/** The newest `limit` messages of a thread (chronological). This is what a chat opens on. */
export async function readRecent<T extends DbMessage>(convId: string, limit = 60): Promise<T[]> {
  const seqs = await listSeqs(convId);
  let out: T[] = [];
  for (let i = seqs.length - 1; i >= 0 && out.length < limit; i--) {
    out = [...(await readChunk<T>(convId, seqs[i])), ...out];
  }
  return dedupe(out).slice(-limit);
}

/** The page of history immediately before `beforeId` — scrollback served from disk, not the network. */
export async function readOlder<T extends DbMessage>(convId: string, beforeId: string, limit = 40): Promise<T[]> {
  const seqs = await listSeqs(convId);
  let out: T[] = [];
  let found = false;
  for (let i = seqs.length - 1; i >= 0; i--) {
    const chunk = await readChunk<T>(convId, seqs[i]);
    if (!found) {
      const at = chunk.findIndex((m) => m.id === beforeId);
      if (at < 0) continue;          // anchor is in an older chunk
      found = true;
      out = chunk.slice(0, at);      // the part of the anchor's own chunk that precedes it
    } else {
      out = [...chunk, ...out];
    }
    if (out.length >= limit) break;
  }
  return found ? dedupe(out).slice(-limit) : [];
}

/** True when the thread has nothing older than `beforeId` on disk (so scrollback must hit the server). */
export async function hasOlder(convId: string, beforeId: string): Promise<boolean> {
  return (await readOlder(convId, beforeId, 1)).length > 0;
}

/**
 * Insert-or-replace by message id. New messages append to the tail chunk (the hot path: one small
 * file rewritten); updates — edits, deletions, reactions, receipt ticks — replace the message where
 * it already lives.
 */
export async function upsert<T extends DbMessage>(convId: string, msgs: T[]): Promise<void> {
  if (!msgs.length) return;
  return serial(convId, async () => {
    const seqs = await listSeqs(convId);
    const idx = indexOf(convId);
    const pending = new Map(msgs.map((m) => [m.id, m]));

    // Phase 1 — updates: group the known ids by the chunk holding them.
    const targets = new Map<number, string[]>();
    const unknown: string[] = [];
    for (const id of pending.keys()) {
      const seq = idx.get(id);
      if (seq === undefined) unknown.push(id);
      else targets.set(seq, [...(targets.get(seq) ?? []), id]);
    }
    // Ids with no index entry are usually genuinely new. The exception is a socket edit/delete/reaction
    // for a message outside the loaded window — hunt for those in the recent chunks (bounded: past
    // SCAN_CHUNKS it is cheaper to let the next scrollback pull the fresh copy from the server).
    if (unknown.length && seqs.length) {
      const floor = Math.max(0, seqs.length - SCAN_CHUNKS);
      for (let i = seqs.length - 1; i >= floor && unknown.length; i--) {
        const chunk = await readChunk<T>(convId, seqs[i]);
        for (let k = unknown.length - 1; k >= 0; k--) {
          if (!chunk.some((m) => m.id === unknown[k])) continue;
          targets.set(seqs[i], [...(targets.get(seqs[i]) ?? []), unknown[k]]);
          unknown.splice(k, 1);
        }
      }
    }
    for (const [seq, ids] of targets) {
      const chunk = await readChunk<T>(convId, seq);
      let dirty = false;
      const next = chunk.map((m) => {
        if (!ids.includes(m.id)) return m;
        const replacement = pending.get(m.id);
        if (!replacement) return m;
        pending.delete(m.id);
        dirty = true;
        return replacement;
      });
      if (dirty) await writeChunk(convId, seq, next);
    }

    // Phase 2 — appends: whatever is still pending is new, in the caller's (chronological) order.
    const fresh = msgs.filter((m) => pending.has(m.id));
    if (!fresh.length) return;
    let seq = seqs.length ? seqs[seqs.length - 1] : 0;
    let tail = seqs.length ? await readChunk<T>(convId, seq) : [];
    for (const m of fresh) {
      if (tail.length >= CHUNK) { await writeChunk(convId, seq, tail); seq += 1; tail = []; }
      tail.push(m);
    }
    await writeChunk(convId, seq, tail);
  });
}

/** Drop messages from the local thread (delete-for-me / delete-for-everyone cleanup). */
export async function removeMessages(convId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  return serial(convId, async () => {
    const seqs = await listSeqs(convId);
    const gone = new Set(ids);
    const idx = indexOf(convId);
    // Newest chunks first, stopping as soon as every id is accounted for — a delete must not walk the
    // whole history of a long thread. Same bound as an update for anything not found near the top.
    const floor = Math.max(0, seqs.length - SCAN_CHUNKS);
    for (let i = seqs.length - 1; i >= floor && gone.size; i--) {
      const chunk = await readChunk(convId, seqs[i]);
      const hit = chunk.filter((m) => gone.has(m.id));
      if (!hit.length) continue;
      await writeChunk(convId, seqs[i], chunk.filter((m) => !gone.has(m.id)));
      for (const m of hit) { gone.delete(m.id); idx.delete(m.id); }
    }
  });
}

/** Wipe every thread — sign-out, or an account switch on a shared handset. */
export async function clearAll(): Promise<void> {
  indexes.clear();
  queues.clear();
  const FS = await fs();
  if (!FS) return;
  try { await FS.deleteAsync(rootDir(FS), { idempotent: true }); } catch { /* nothing stored yet */ }
}

/**
 * Search stored messages — the device's own history, so results appear with no connection and no
 * round trip. `convIds` should be in recency order: the scan spends its chunk budget on the chats
 * the user actually uses, newest messages first, rather than crawling the whole archive.
 */
export async function search<T extends DbMessage & { text?: string; deletedForEveryone?: boolean }>(
  convIds: string[], query: string, opts: { limit?: number; maxChunks?: number } = {},
): Promise<T[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const limit = opts.limit ?? 50;
  let budget = opts.maxChunks ?? 120; // hard ceiling on files read, so search stays responsive
  const hits: T[] = [];
  for (const convId of convIds) {
    if (budget <= 0) break;
    const seqs = await listSeqs(convId);
    for (let i = seqs.length - 1; i >= 0 && budget > 0; i--) {
      budget -= 1;
      const chunk = await readChunk<T>(convId, seqs[i]);
      for (const m of chunk) {
        if (m.deletedForEveryone) continue;
        if ((m.text ?? '').toLowerCase().includes(needle)) hits.push(m);
      }
    }
  }
  return hits
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/** Per-conversation footprint on disk — what the storage screen lists and sorts by. */
export async function usage(convIds: string[]): Promise<{ conversationId: string; bytes: number; messages: number }[]> {
  const out: { conversationId: string; bytes: number; messages: number }[] = [];
  for (const convId of convIds) {
    const seqs = await listSeqs(convId);
    if (!seqs.length) continue;
    let bytes = 0;
    let messages = 0;
    for (const seq of seqs) {
      const chunk = await readChunk(convId, seq);
      messages += chunk.length;
      bytes += JSON.stringify(chunk).length; // JSON is ASCII-dominated; close enough to file size
    }
    out.push({ conversationId: convId, bytes, messages });
  }
  return out.sort((a, b) => b.bytes - a.bytes);
}

/** Test seam: forget the in-memory id→chunk index without touching stored messages — i.e. exactly
 *  what this module looks like on a fresh app launch, when an update has to hunt for its message. */
export function __resetIndexForTests(): void { indexes.clear(); }

/** Wipe one thread (conversation deleted / left a group). */
export async function clearConversation(convId: string): Promise<void> {
  indexes.delete(convId);
  const FS = await fs();
  if (!FS) return;
  try { await FS.deleteAsync(dirOf(FS, convId), { idempotent: true }); } catch { /* nothing stored */ }
}

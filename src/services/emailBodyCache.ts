import type { Email } from '../types';
import * as emailApi from '../api/email';

// Offline full-body cache: one file per message under documentDirectory/email-bodies/. The list
// Graph fetch only carries a preview snippet, so the store triggers hydrateBodies after each page
// load to backfill full bodies in the background — making every listed message readable offline,
// not just the ones the user opened. All functions are lazy + fail-safe (dynamic import inside a
// try/catch) so importing this module in a plain Node/jest context never loads the native module.

export interface CachedBody { body: string; bodyType?: 'html' | 'text' }

const DIR_NAME = 'email-bodies';

type FS = typeof import('expo-file-system/legacy');

// Returns the FS module + ensured cache dir, or null off-device.
async function open(): Promise<{ FS: FS; dir: string } | null> {
  try {
    const FS = await import('expo-file-system/legacy');
    const dir = `${FS.documentDirectory}${DIR_NAME}/`;
    const info = await FS.getInfoAsync(dir);
    if (!info.exists) await FS.makeDirectoryAsync(dir, { intermediates: true });
    return { FS, dir };
  } catch {
    return null;
  }
}

const fileFor = (dir: string, id: string): string => `${dir}${encodeURIComponent(id)}.json`;

export async function saveBody(id: string, data: CachedBody): Promise<void> {
  const o = await open();
  if (!o) return;
  try { await o.FS.writeAsStringAsync(fileFor(o.dir, id), JSON.stringify(data)); } catch { /* best-effort */ }
}

export async function loadBody(id: string): Promise<CachedBody | null> {
  const o = await open();
  if (!o) return null;
  try {
    const f = fileFor(o.dir, id);
    const info = await o.FS.getInfoAsync(f);
    if (!info.exists) return null;
    return JSON.parse(await o.FS.readAsStringAsync(f)) as CachedBody;
  } catch {
    return null;
  }
}

export async function clearBodies(): Promise<void> {
  const o = await open();
  if (!o) return;
  try { await o.FS.deleteAsync(o.dir, { idempotent: true }); } catch { /* best-effort */ }
}

// Background hydrator: fetch + cache the full body of every candidate that isn't cached yet,
// newest first, one at a time (gentle on Graph). A fetch failure (offline / throttled) stops the
// run quietly — the next page load retries. Also prunes cached bodies for messages the store no
// longer knows about, so the cache tracks the mailbox instead of growing forever.
let running = false;
export async function hydrateBodies(candidates: Email[], keepIds: string[]): Promise<void> {
  if (running) return;
  running = true;
  try {
    const o = await open();
    if (!o) return;
    // Drafts change until sent (and open in compose), so they're not worth caching.
    const want = candidates.filter((e) => !e.bodyFull && e.folder !== 'drafts').sort((a, b) => b.ts - a.ts);
    for (const e of want) {
      const f = fileFor(o.dir, e.id);
      try {
        if ((await o.FS.getInfoAsync(f)).exists) continue;
        const full = await emailApi.getMessage(e.id, e.folder);
        await o.FS.writeAsStringAsync(f, JSON.stringify({ body: full.body, bodyType: full.bodyType } satisfies CachedBody));
      } catch {
        return; // offline or throttled — stop; a later load re-triggers hydration
      }
    }
    const keep = new Set(keepIds.map((id) => `${encodeURIComponent(id)}.json`));
    for (const name of await o.FS.readDirectoryAsync(o.dir)) {
      if (!keep.has(name)) void o.FS.deleteAsync(`${o.dir}${name}`, { idempotent: true }).catch(() => undefined);
    }
  } catch {
    /* best-effort */
  } finally {
    running = false;
  }
}

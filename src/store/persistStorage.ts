import type { PersistStorage, StateStorage, StorageValue } from 'zustand/middleware';

// Lazy + fail-safe AsyncStorage for zustand persist (same pattern as messagingStore):
// dynamic-imported inside each method so importing a store in a plain Node/jest context
// never loads the native module — calls just no-op there.
// The module is resolved once and remembered (a failed load remembers `null`), so a write that fires
// later from a timer never has to import anything.
type AsyncStorageModule = typeof import('@react-native-async-storage/async-storage').default;
let asyncStorageModule: Promise<AsyncStorageModule | null> | null = null;
const asyncStorage = (): Promise<AsyncStorageModule | null> =>
  (asyncStorageModule ??= import('@react-native-async-storage/async-storage').then((m) => m.default).catch(() => null));

export const persistStorage: StateStorage = {
  getItem: async (name) => { try { return (await (await asyncStorage())?.getItem(name)) ?? null; } catch { return null; } },
  setItem: async (name, value) => { try { await (await asyncStorage())?.setItem(name, value); } catch { /* no-op */ } },
  removeItem: async (name) => { try { await (await asyncStorage())?.removeItem(name); } catch { /* no-op */ } },
};

// ── Coalescing storage for zustand persist ──
// createJSONStorage serialises the whole persisted slice and writes it to AsyncStorage on EVERY
// set() — including the ones that change nothing persisted (typing, presence, a message arriving).
// On the chat store that meant re-stringifying the full conversation list many times a second, on
// the same JS thread that has to answer touches. This adapter:
//   • skips the write outright when no persisted field changed identity,
//   • collapses a burst of changes into one write per `delayMs`,
//   • still writes at once when `urgent` says the change must not be lost (e.g. the unsent outbox).
// The stored shape ({ state, version } JSON under the same key) is exactly createJSONStorage's, so
// existing installs and the background push handler that reads the key are unaffected.
const flushers = new Set<() => void>();

/** Write every pending slice now — call when the app backgrounds, where a timer may never fire. */
export function flushPersist(): void { for (const f of flushers) f(); }

const sameSlice = (a: object, b: object): boolean => {
  const ka = Object.keys(a) as (keyof typeof a)[];
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!Object.is(a[k], (b as typeof a)[k])) return false;
  return true;
};

export function coalescedStorage<S extends object>(
  opts: { delayMs?: number; urgent?: (prev: S | undefined, next: S) => boolean } = {},
): PersistStorage<S> {
  const delayMs = opts.delayMs ?? 800;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { name: string; value: StorageValue<S> } | null = null;
  let last: S | undefined; // the slice most recently written or queued
  const write = (): void => {
    if (timer) { clearTimeout(timer); timer = null; }
    const job = pending;
    pending = null;
    if (job) void persistStorage.setItem(job.name, JSON.stringify(job.value));
  };
  flushers.add(write);
  return {
    getItem: async (name) => {
      const raw = await persistStorage.getItem(name);
      if (!raw) return null;
      try { return JSON.parse(raw) as StorageValue<S>; } catch { return null; }
    },
    setItem: (name, value) => {
      const prev = last;
      if (prev && sameSlice(prev, value.state)) return;
      last = value.state;
      pending = { name, value };
      if (opts.urgent?.(prev, value.state)) { write(); return; }
      if (timer) return;
      timer = setTimeout(write, delayMs);
      // Never hold a Node process (jest) open for a trailing write.
      (timer as { unref?: () => void }).unref?.();
    },
    removeItem: async (name) => {
      if (timer) { clearTimeout(timer); timer = null; }
      pending = null;
      last = undefined;
      await persistStorage.removeItem(name);
    },
  };
}

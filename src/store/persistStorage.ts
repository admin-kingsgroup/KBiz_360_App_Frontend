import type { StateStorage } from 'zustand/middleware';

// Lazy + fail-safe AsyncStorage for zustand persist (same pattern as messagingStore):
// dynamic-imported inside each method so importing a store in a plain Node/jest context
// never loads the native module — calls just no-op there.
export const persistStorage: StateStorage = {
  getItem: async (name) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; return await AS.getItem(name); } catch { return null; } },
  setItem: async (name, value) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; await AS.setItem(name, value); } catch { /* no-op */ } },
  removeItem: async (name) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; await AS.removeItem(name); } catch { /* no-op */ } },
};

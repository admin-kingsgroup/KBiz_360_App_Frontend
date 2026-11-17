import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

// The width this person gave the chat list in the two-pane view (iPhone Duo opened), by dragging
// the divider — kept as a share of the window, so it carries over between window sizes. null = the
// default split (logic/wideLayout). A UI preference of this device, never synced. Same lazy
// AsyncStorage adapter as branchOrderStore (the static import crashes jest / non-RN environments).
const asyncStorage: StateStorage = {
  getItem: async (name) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; return await AS.getItem(name); } catch { return null; } },
  setItem: async (name, value) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; await AS.setItem(name, value); } catch { /* no-op */ } },
  removeItem: async (name) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; await AS.removeItem(name); } catch { /* no-op */ } },
};

interface PaneSizeState {
  listFraction: number | null;
  setListFraction: (fraction: number | null) => void;
}

export const usePaneSizeStore = create<PaneSizeState>()(
  persist(
    (set) => ({
      listFraction: null,
      setListFraction: (fraction) => set({ listFraction: fraction == null ? null : Math.round(fraction * 1000) / 1000 }),
    }),
    { name: 'kb360-pane-size', storage: createJSONStorage(() => asyncStorage) },
  ),
);

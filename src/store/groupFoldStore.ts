import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

// Which branch sections of the Groups list this person has opened or folded, per company tile
// (keys from groupsStrip.foldKey). A UI preference like the branch order, so it lives on the device
// and never syncs. Same lazy AsyncStorage adapter as branchOrderStore (the static import crashes jest).
const asyncStorage: StateStorage = {
  getItem: async (name) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; return await AS.getItem(name); } catch { return null; } },
  setItem: async (name, value) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; await AS.setItem(name, value); } catch { /* no-op */ } },
  removeItem: async (name) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; await AS.removeItem(name); } catch { /* no-op */ } },
};

interface GroupFoldState {
  open: Record<string, boolean>; // foldKey(bizId, branchCode) → open?
  setOpen: (key: string, open: boolean) => void;
  replace: (open: Record<string, boolean>) => void;
}

export const useGroupFoldStore = create<GroupFoldState>()(
  persist(
    (set) => ({
      open: {},
      setOpen: (key, open) => set((s) => ({ open: { ...s.open, [key]: open } })),
      replace: (open) => set({ open }),
    }),
    { name: 'kb360-group-folds', storage: createJSONStorage(() => asyncStorage) },
  ),
);

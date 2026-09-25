import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

// This device's personal arrangement of the Groups tab's branch chips, per business — a UI
// preference like wallpapers, so it lives on the device and never syncs. Same lazy AsyncStorage
// adapter as the messaging store (the static import crashes jest / non-RN environments).
const asyncStorage: StateStorage = {
  getItem: async (name) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; return await AS.getItem(name); } catch { return null; } },
  setItem: async (name, value) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; await AS.setItem(name, value); } catch { /* no-op */ } },
  removeItem: async (name) => { try { const AS = (await import('@react-native-async-storage/async-storage')).default; await AS.removeItem(name); } catch { /* no-op */ } },
};

interface BranchOrderState {
  order: Record<string, string[]>; // businessId → branch codes in the user's arrangement
  setOrder: (bizId: string, codes: string[]) => void;
  resetOrder: (bizId: string) => void;
}

export const useBranchOrderStore = create<BranchOrderState>()(
  persist(
    (set) => ({
      order: {},
      setOrder: (bizId, codes) => set((s) => ({ order: { ...s.order, [bizId]: codes } })),
      resetOrder: (bizId) => set((s) => {
        const next = { ...s.order };
        delete next[bizId];
        return { order: next };
      }),
    }),
    { name: 'kb360-branch-order', storage: createJSONStorage(() => asyncStorage) },
  ),
);

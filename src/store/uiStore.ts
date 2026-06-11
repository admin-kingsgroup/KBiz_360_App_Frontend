import { create } from 'zustand';

export type HomeSegment = 'chats' | 'groups' | 'depts' | 'pulse';

// UI-only navigation state (no React, no RN). Persistence optional at the edge.
export interface UiState {
  activeBizId: string;            // 'all' or a business id
  activeSegment: HomeSegment;
  toast: string | null;
  setBiz: (id: string) => void;
  setSegment: (s: HomeSegment) => void;
  showToast: (msg: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeBizId: 'all',
  activeSegment: 'chats',
  toast: null,
  setBiz: (activeBizId) => set({ activeBizId }),
  setSegment: (activeSegment) => set({ activeSegment }),
  showToast: (toast) => set({ toast }),
}));

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

// Defer helper: a plain microtask when available (Hermes/modern JS), else a 0ms timer. Used so a
// toast set that fires from an async callback during the initial mount window never lands as a
// state update on the app-wide GlobalToast before it has committed (dev warning + React anti-pattern).
const soon = (fn: () => void): void => {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else setTimeout(fn, 0);
};

export const useUiStore = create<UiState>((set) => ({
  activeBizId: 'all',
  activeSegment: 'chats',
  toast: null,
  setBiz: (activeBizId) => set({ activeBizId }),
  setSegment: (activeSegment) => set({ activeSegment }),
  // Deferred so callers may safely showToast() from render/async-mount paths (the global host reads it).
  showToast: (toast) => soon(() => set({ toast })),
}));

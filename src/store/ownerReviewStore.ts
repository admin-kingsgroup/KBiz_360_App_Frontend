import { create } from 'zustand';
import { erpApi, type ErpDirectorDecision } from '../api/erp';
import { ApiError } from '../api/client';
import { isOwnerRole } from '../logic/erpApprovals';
import { REVIEW_DAYS, newDecisions, seenFrom } from '../logic/ownerReview';
import { loadErpAccess } from '../components/erpApprovals/useErpAccess';
import { useAuthStore } from './authStore';

// The Owner's Review (owner, 2026-10-30) — see logic/ownerReview.ts. Only the ERP Owner (Owner / Super Admin) reads it;
// for everyone else `owner` stays false and the widgets show Late as before. When the Owner last opened Review is kept
// on this phone, per user (AsyncStorage, lazy — the static import crashes jest).
const seenKey = (userId: string): string => `kb360-owner-review-seen:${userId}`;
async function readSeen(userId: string): Promise<number | null> {
  try {
    const AS = (await import('@react-native-async-storage/async-storage')).default;
    const v = Number(await AS.getItem(seenKey(userId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
}
async function writeSeen(userId: string, at: number): Promise<void> {
  try {
    const AS = (await import('@react-native-async-storage/async-storage')).default;
    await AS.setItem(seenKey(userId), String(at));
  } catch { /* best effort */ }
}

interface OwnerReviewState {
  /** The signed-in person is the ERP Owner. */
  owner: boolean;
  userId: string;
  rows: ErpDirectorDecision[];
  /** When the Owner last opened Review on this phone (epoch ms); null = never. */
  lastSeen: number | null;
  /** The first read has come back (rows or a refusal). */
  loaded: boolean;
  error: string;
  refresh: () => Promise<void>;
  /** Review was opened: everything listed now counts as seen. */
  markSeen: () => void;
  reset: () => void;
}

export const useOwnerReviewStore = create<OwnerReviewState>((set, get) => ({
  owner: false,
  userId: '',
  rows: [],
  lastSeen: null,
  loaded: false,
  error: '',
  refresh: async () => {
    const userId = useAuthStore.getState().user?.id ?? '';
    if (!userId) return;
    try {
      if (get().userId !== userId) set({ userId, rows: [], owner: false, loaded: false, lastSeen: await readSeen(userId) });
      const access = await loadErpAccess(userId);
      const owner = access.state === 'ready' && isOwnerRole(access.me.role);
      if (!owner) { set({ owner: false, rows: [], loaded: true, error: '' }); return; }
      const rows = await erpApi.directorDecided(REVIEW_DAYS);
      set({ owner: true, rows, loaded: true, error: '' });
    } catch (e) {
      // Keep the last list on a hiccup; say why only when there is nothing to show.
      // 403 / 404 = the ERP or the app server does not open this list to the app yet (both changes ship with it).
      const notYet = e instanceof ApiError && (e.status === 403 || e.status === 404);
      set({ loaded: true, error: notYet ? 'Review opens once the ERP and the app server are updated.' : e instanceof Error ? e.message : 'Could not read what the Director approved' });
    }
  },
  markSeen: () => {
    const { userId, owner } = get();
    if (!userId || !owner) return;
    const at = Date.now();
    set({ lastSeen: at });
    void writeSeen(userId, at);
  },
  reset: () => set({ owner: false, userId: '', rows: [], lastSeen: null, loaded: false, error: '' }),
}));

/** What the Review count shows right now (0 for anyone but the Owner). */
export function reviewNewCount(s: Pick<OwnerReviewState, 'owner' | 'rows' | 'lastSeen'>, now = Date.now()): number {
  return s.owner ? newDecisions(s.rows, seenFrom(s.lastSeen, now)).length : 0;
}

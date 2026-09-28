import { create } from 'zustand';
import { getApprovalCounts } from '../api/approvals';
import { getRegularizationsForAdmin } from '../api/hr';

// Live count for the Approvals tab badge = everything still waiting for a decision in that tab,
// from BOTH sources it merges: approval requests and attendance time corrections. Counting only
// approvals would leave the badge disagreeing with the "Pending" segment on the screen it points at.
//
// Approvals come from GET /approvals/counts, which is scoped 'all' — the same scope the screen
// lists — so the two always report the same number. Corrections are super-admin only; the endpoint
// 403s everyone else, which simply means they have none to decide.
//
// Refreshed on socket connect, after a decision, and on focus of the Approvals tab.
interface ApprovalBadgeState {
  count: number;
  refresh: () => Promise<void>;
  /** Set directly from a screen that has just recomputed the queue, so the badge never lags a decision. */
  setCount: (n: number) => void;
  reset: () => void;
}

export const useApprovalBadgeStore = create<ApprovalBadgeState>((set) => ({
  count: 0,
  refresh: async () => {
    try {
      const [counts, corrections] = await Promise.all([
        getApprovalCounts().catch(() => null),
        getRegularizationsForAdmin('pending').catch(() => []),
      ]);
      // A failed approvals fetch must not silently zero the badge, so only count what came back.
      set({ count: (counts?.pending ?? 0) + corrections.length });
    } catch {
      /* offline / not signed in — keep last value */
    }
  },
  setCount: (n) => set({ count: Math.max(0, n) }),
  reset: () => set({ count: 0 }),
}));

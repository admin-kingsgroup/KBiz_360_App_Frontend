import { create } from 'zustand';
import { getApprovalCounts } from '../api/approvals';
import { getRegularizationsForAdmin } from '../api/hr';
import { erpApi } from '../api/erp';
import { ApiError } from '../api/client';
import { allBranchesTotal } from '../logic/erpPayables';
import { loadErpAccess } from '../components/erpApprovals/useErpAccess';
import { useAuthStore } from './authStore';

// Live count for the Approvals tab badge = everything still waiting for a decision in that tab, in two
// parts (owner, 2026-10-10: "ERP approvals of all branches + App requests"):
//   - app: the App requests still pending. For someone WITHOUT ERP approvals it also counts attendance
//     time corrections, which their Inbox lists; an ERP user decides those under ERP approvals ▸ HR, so
//     they are already in the ERP part and are not added twice.
//   - erp: ERP approvals waiting across ALL branches — the "All branches" chip's number (Payables +
//     Requests + Credit + HR + Month Close, each row once). 0 for someone the ERP does not know.
//
// App approvals come from GET /approvals/counts, scoped 'all' like the list. Corrections are super-admin
// only; the endpoint 403s everyone else, which simply means none to decide.
//
// Refreshed on socket connect, after a decision, and on focus of the Approvals tab. The screens push each
// part the moment they recompute it, so a decision moves the badge with no window where the two disagree.
interface ApprovalBadgeState {
  app: number;
  erp: number;
  /** app + erp — what the tab shows. */
  count: number;
  refresh: () => Promise<void>;
  /** Set from the App requests list that has just recomputed its pending queue. */
  setApp: (n: number) => void;
  /** Set from ERP approvals that has just reloaded its lists. */
  setErp: (n: number) => void;
  reset: () => void;
}

// The ERP lists ERP approvals reads, all unscoped. A 403 is "this role sees none of it" (0); any other
// failure returns null, so a hiccup keeps the last number instead of zeroing the badge.
async function erpWaitingAllBranches(): Promise<number | null> {
  const read = <T,>(p: Promise<T[]>): Promise<T[] | null> =>
    p.catch((e) => (e instanceof ApiError && e.status === 403 ? [] : null));
  const [crs, leave, credit, close] = await Promise.all([
    read(erpApi.changeRequests()), read(erpApi.leaveApplications()), read(erpApi.creditRequests()), read(erpApi.closeBoard()),
  ]);
  if (!crs || !leave || !credit || !close) return null;
  return allBranchesTotal({ crs, leave, credit, close });
}

const clamp = (n: number): number => Math.max(0, n);

export const useApprovalBadgeStore = create<ApprovalBadgeState>((set, get) => ({
  app: 0,
  erp: 0,
  count: 0,
  refresh: async () => {
    try {
      const access = await loadErpAccess(useAuthStore.getState().user?.id ?? '');
      const withErp = access.state === 'ready';
      const [counts, corrections, erp] = await Promise.all([
        getApprovalCounts().catch(() => null),
        withErp ? Promise.resolve([]) : getRegularizationsForAdmin('pending').catch(() => []),
        withErp ? erpWaitingAllBranches() : Promise.resolve(0),
      ]);
      // A failed fetch must not silently zero its part, so only replace what came back.
      const app = counts ? clamp((counts.pending ?? 0) + corrections.length) : get().app;
      const erpPart = erp === null ? get().erp : clamp(erp);
      set({ app, erp: erpPart, count: app + erpPart });
    } catch {
      /* offline / not signed in — keep last value */
    }
  },
  setApp: (n) => set((s) => ({ app: clamp(n), count: clamp(n) + s.erp })),
  setErp: (n) => set((s) => ({ erp: clamp(n), count: s.app + clamp(n) })),
  reset: () => set({ app: 0, erp: 0, count: 0 }),
}));

import { useCallback, useEffect, useState } from 'react';
import { erpApi, type ErpMe } from '../../api/erp';
import { EMPTY_CHAIN, erpCheckFailure, type ErpChain } from '../../logic/erpApprovals';
import { useAuthStore } from '../../store/authStore';

// Does this person see ERP approvals in the app? Yes when the app's backend has the ERP link set up
// AND the ERP recognises them (active Books grant, ERP access on). No Books grant, ERP access off or
// link not configured: 'none', and the section is not shown. Checked once per app session (and again
// after 5 minutes), so opening the tab stays instant.
// 'error' = the check could not be made at all (no connection, timeout, server error). It used to
// read as 'none' and was kept for 5 minutes, so on a bad connection ERP approvals vanished without a
// word (Afshin, 2026-11-17). Now it is never cached, the screen says so, and the next look asks again.
export type ErpAccess = { state: 'checking' } | { state: 'none' } | { state: 'error' } | { state: 'ready'; me: ErpMe; chain: ErpChain };

const TTL_MS = 5 * 60_000;
// Keyed by the signed-in user, so a different person on the same phone never sees the previous
// person's ERP identity.
let cached: { at: number; userId: string; value: ErpAccess } | null = null;
let inflight: Promise<ErpAccess> | null = null;

async function probe(): Promise<ErpAccess> {
  try {
    const { configured } = await erpApi.status();
    if (!configured) return { state: 'none' };
    const me = await erpApi.me();
    if (!me || !me.email) return { state: 'none' };
    // The voucher approval chain, for Entries' buttons (owner, 2026-10-29: Entries is back in the app). An unreadable
    // list reads as empty — the ERP still decides every act and says why when it refuses.
    const list = (key: string) => erpApi.configList(key).catch(() => [] as string[]);
    const [verify, approve, director, owner, dealApprove] = await Promise.all([
      list('approval.verifyEmails'), list('approval.approveEmails'), list('approval.directorEmails'),
      list('approval.ownerEmails'), list('approval.dealApproveEmails'),
    ]);
    return { state: 'ready', me, chain: { ...EMPTY_CHAIN, verify, approve, director, owner, dealApprove } };
  } catch (e) {
    return { state: erpCheckFailure(e) };
  }
}

/** Remember an answer — but never "could not ask", so the next look asks again. */
function remember(userId: string, v: ErpAccess): ErpAccess {
  cached = v.state === 'error' ? null : { at: Date.now(), userId, value: v };
  return v;
}

/** Forget the remembered answer (tests; a retry after "could not ask" never has one anyway). */
export function resetErpAccessCache(): void {
  cached = null;
  inflight = null;
}

/** The same answer outside React (the Approvals tab badge), sharing the hook's cache and probe. */
export function loadErpAccess(userId: string): Promise<ErpAccess> {
  if (cached && cached.userId === userId && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.value);
  inflight = inflight ?? probe().finally(() => { inflight = null; });
  return inflight.then((v) => remember(userId, v));
}

/** The ERP check for the signed-in person, and `retry` to ask again after 'error'. */
export function useErpAccess(): ErpAccess & { retry: () => void } {
  const userId = useAuthStore((st) => st.user?.id) ?? '';
  const fresh = cached && cached.userId === userId && Date.now() - cached.at < TTL_MS ? cached.value : null;
  const [value, setValue] = useState<ErpAccess>(fresh ?? { state: 'checking' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (fresh && attempt === 0) return;
    let alive = true;
    void loadErpAccess(userId).then((v) => { if (alive) setValue(v); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, attempt]);
  const retry = useCallback(() => { setValue({ state: 'checking' }); setAttempt((n) => n + 1); }, []);
  return { ...value, retry };
}

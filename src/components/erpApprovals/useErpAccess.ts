import { useEffect, useState } from 'react';
import { erpApi, type ErpMe } from '../../api/erp';
import { EMPTY_CHAIN, type ErpChain } from '../../logic/erpApprovals';
import { useAuthStore } from '../../store/authStore';

// Does this person see ERP approvals in the app? Yes when the app's backend has the ERP link set up
// AND the ERP recognises them (active Books grant, ERP access on). Anyone else — no Books grant, ERP
// access off, link not configured, ERP unreachable — simply does not see the section. Checked once
// per app session (and again after 5 minutes), so opening the tab stays instant.
export type ErpAccess = { state: 'checking' } | { state: 'none' } | { state: 'ready'; me: ErpMe; chain: ErpChain };

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
  } catch {
    return { state: 'none' };
  }
}

/** The same answer outside React (the Approvals tab badge), sharing the hook's cache and probe. */
export function loadErpAccess(userId: string): Promise<ErpAccess> {
  if (cached && cached.userId === userId && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.value);
  inflight = inflight ?? probe().finally(() => { inflight = null; });
  return inflight.then((v) => { cached = { at: Date.now(), userId, value: v }; return v; });
}

export function useErpAccess(): ErpAccess {
  const userId = useAuthStore((st) => st.user?.id) ?? '';
  const fresh = cached && cached.userId === userId && Date.now() - cached.at < TTL_MS ? cached.value : null;
  const [value, setValue] = useState<ErpAccess>(fresh ?? { state: 'checking' });
  useEffect(() => {
    if (fresh) return;
    let alive = true;
    inflight = inflight ?? probe().finally(() => { inflight = null; });
    void inflight.then((v) => { cached = { at: Date.now(), userId, value: v }; if (alive) setValue(v); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  return value;
}

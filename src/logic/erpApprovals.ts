import type { ErpEntryDetail, ErpMe, ErpPendingEntry, ErpPendingWork, ErpStage } from '../api/erp';

// Pure helpers for ERP approvals in the app (owner, 2026-10-07). The ERP decides every action
// server-side; these only decide what to SHOW, mirroring the ERP's own screen (Books
// core/approvalChain.jsx nextActionFor) so a button is not offered that the ERP will refuse.

export const ALL_BRANCHES = 'ALL';

/** The approval-chain lists (lower-cased emails) from the ERP's app-config. */
export interface ErpChain { verify: string[]; approve: string[]; director: string[]; owner: string[] }
export const EMPTY_CHAIN: ErpChain = { verify: [], approve: [], director: [], owner: [] };

const SUPER = /super.?admin/i;

/** Mirrors the ERP's maySelfApprove: the Finance Manager and the Owner / Super Admin may approve
 *  their own entry; a Branch Accountant, an Accounts Executive, a GM or a Director may not. */
export function maySelfApprove(role: string): boolean {
  const r = String(role || '').toLowerCase();
  if (/branch\s*account/.test(r)) return false;
  if (/account.*(exec|executive)|(^|[^a-z])ae([^a-z]|$)/.test(r)) return false;
  if (/finance\s*manager|(^|[^a-z])fm([^a-z]|$)/.test(r)) return true;
  return /owner|super.?admin/.test(r);
}

/** Every waiting entry the viewer can see, from the Pending Work feed. `branch` narrows to the
 *  entries booked in that branch or whose next step is given there; ALL keeps everything. */
export function pendingEntries(pw: ErpPendingWork | null | undefined, branch: string = ALL_BRANCHES): ErpPendingEntry[] {
  const seen = new Set<string>();
  const out: ErpPendingEntry[] = [];
  for (const b of pw?.branches ?? []) {
    for (const card of b.cards ?? []) {
      if (card.key !== 'approvals') continue;
      for (const item of card.items ?? []) {
        for (const e of item.entries ?? []) {
          if (!e?.id || seen.has(e.id)) continue;
          if (branch !== ALL_BRANCHES && e.branch !== branch && e.actionBranch !== branch) continue;
          seen.add(e.id);
          out.push(e);
        }
      }
    }
  }
  // Oldest wait first — what a reviewer should clear next.
  return out.sort((a, b) => (b.days ?? 0) - (a.days ?? 0) || a.ref.localeCompare(b.ref));
}

/** "Check 5 · Verify 4 · Approve 3" for the strip above the list. */
export function stageCounts(entries: ErpPendingEntry[]): { check: number; verify: number; approve: number; total: number } {
  const c = { check: 0, verify: 0, approve: 0, total: entries.length };
  for (const e of entries) {
    if (e.stage === 'check') c.check++;
    else if (e.stage === 'verify') c.verify++;
    else c.approve++; // approve and the optional director / owner sign-offs
  }
  return c;
}

/** The branches the viewer can pick: ALL first for an all-branch login, then their branches. */
export function branchOptions(me: Pick<ErpMe, 'branches' | 'allBranches'> | null | undefined): string[] {
  if (!me) return [];
  const own = [...new Set((me.branches ?? []).map((b) => String(b).toUpperCase()).filter(Boolean))];
  return me.allBranches ? [ALL_BRANCHES, ...own] : own;
}

/** Can the viewer act on this entry from here? Its next step is given in its acting branch; a
 *  scoped login outside that branch sees "With <branch>" instead of buttons (as on the laptop). */
export function actsHere(e: Pick<ErpPendingEntry, 'actionBranch' | 'branch'>, me: Pick<ErpMe, 'branches' | 'allBranches' | 'viewOnly'> | null | undefined): boolean {
  if (!me || me.viewOnly) return false;
  const at = String(e.actionBranch || e.branch || '').toUpperCase();
  return me.allBranches || (me.branches ?? []).map((b) => String(b).toUpperCase()).includes(at);
}

/** A voucher DTO or a booking DTO → the fields the detail sheet and the button rule read. */
export function toEntryDetail(kind: 'voucher' | 'file', raw: Record<string, unknown> | null | undefined): ErpEntryDetail {
  const r = (raw ?? {}) as Record<string, unknown> & { customer?: { name?: string } };
  const s = (k: string): string => (r[k] == null ? '' : String(r[k]));
  return {
    id: s('id') || s('_id'),
    number: kind === 'file' ? s('bookingNo') : s('vno'),
    type: kind === 'file' ? (s('module') ? `SO/PO/GP · ${s('module')}` : 'SO/PO/GP') : s('type'),
    branch: s('branch'),
    date: s('date'),
    party: kind === 'file' ? (r.customer?.name ?? '') : s('party'),
    narration: s('narration'),
    reviewStage: (s('reviewStage') as ErpStage) || '',
    actionBranch: s('actionBranch'),
    approvalBranch: s('approvalBranch'),
    submittedBy: s('submittedBy') || s('createdBy'),
    checkedBy: s('checkedBy'),
    checkedAt: s('checkedAt'),
    verifiedBy: s('verifiedBy'),
    verifiedAt: s('verifiedAt'),
    status: s('status'),
    approvalNeedsFx: r.approvalNeedsFx === true,
  };
}

export interface ErpAction { stage: ErpStage; action: 'check' | 'verify' | 'director' | 'owner' | 'approve'; label: string; allowed: boolean; hint: string }

/** The single action the viewer may take on a pending entry at its stage — a port of the ERP's
 *  nextActionFor (minus the Branch-Accountant-control and verifier ≠ approver flags, which the
 *  ERP still enforces and explains if they are on). */
export function nextErpAction(e: ErpEntryDetail, me: Pick<ErpMe, 'email' | 'name' | 'id' | 'role'>, chain: ErpChain): ErpAction {
  if (!e.reviewStage) return { stage: '', action: 'approve', label: 'Approve', allowed: true, hint: '' };
  const email = String(me.email || '').toLowerCase().trim();
  const su = SUPER.test(me.role || '');
  const inVerify = chain.verify.includes(email);
  const inApprove = chain.approve.includes(email);
  const stage = e.reviewStage;
  if (stage === 'check') return { stage, action: 'check', label: 'Check', allowed: true, hint: 'Level 1 · checked in the branch' };
  if (stage === 'verify') {
    const who = [...new Set([...chain.verify, ...chain.approve])];
    return { stage, action: 'verify', label: 'Verify', allowed: su || inVerify || inApprove, hint: `Level 2 · ${who.length ? who.join(', ') : 'Super Admin only'}` };
  }
  if (stage === 'director') return { stage, action: 'director', label: 'Director sign-off', allowed: su || chain.director.includes(email), hint: 'Director sign-off' };
  if (stage === 'owner') return { stage, action: 'owner', label: 'Owner sign-off', allowed: su || chain.owner.includes(email), hint: 'Owner sign-off' };
  const idents = new Set([me.email, me.name, me.id].map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));
  const isMaker = idents.has(String(e.submittedBy || '').trim().toLowerCase());
  const selfOk = isMaker && maySelfApprove(me.role);
  const allowed = su || (inApprove && (!isMaker || selfOk));
  let hint = `Level 3 · ${chain.approve.length ? chain.approve.join(', ') : 'Super Admin only'}`;
  if (!su && inApprove && isMaker && !selfOk) hint = 'You entered this — its maker can’t give the final approval.';
  return { stage, action: 'approve', label: 'Approve & Post', allowed, hint };
}

/** Text for an ERP field that may be a string, a number or an object like { role, label } / { name }.
 *  React Native throws on an object child ("Objects are not valid as a React child"), which took the
 *  whole Approvals screen down on the Credit tab (2026-10-08) — so every such field goes through here. */
export function erpText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(erpText).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return erpText(o.label ?? o.name ?? o.title ?? o.role ?? '');
  }
  return '';
}

// ── HR approvals: one level at a time (owner, 2026-10-08) ──
// Afshin's voice note: "don't let me approve ahead of Farhan — on mobile, FM approves, then the
// Director, and only then do I. Show 'Waiting on …' in red, tick FM and Director as they sign, and
// open my approval after both." The ERP itself still lets the Owner sign past earlier levels (with a
// reason); the APP no longer offers that: Approve shows only when it is the viewer's own turn.

export interface ChainStep { label: string; done: boolean }

/** The leave chain in order, each level ticked once it has signed (a skipped level is not a tick). */
export function leaveChainSteps(
  chain: Array<{ order?: number; role: string; label?: string }> | undefined,
  approvals: Array<{ role: string; skipped?: boolean }> | undefined,
): ChainStep[] {
  const signed = new Set((approvals ?? []).filter((a) => !a.skipped).map((a) => a.role));
  return [...(chain ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((l) => ({ label: erpText(l.label) || erpText(l.role), done: signed.has(l.role) }));
}

/** Approve is offered only when it is the viewer's own turn: the ERP allows it AND no earlier level
 *  would be signed past. */
export function mayApproveLeaveNow(turn: { allowed?: boolean; past?: string[]; why?: string; final?: boolean } | undefined): boolean {
  return !!turn?.allowed && !(turn.past && turn.past.length);
}

/** The ERP's "why not" text, minus the plain "not your turn" — the red "Waiting on …" says that. */
export function leaveTurnNote(turn: { allowed?: boolean; why?: string } | undefined): string {
  if (!turn || turn.allowed) return '';
  const why = erpText(turn.why);
  return /not your turn/i.test(why) ? '' : why;
}

export const STAGE_LABEL: Record<string, string> = { check: 'Check', verify: 'Verify', approve: 'Approve', director: 'Director', owner: 'Owner' };

/** "₹1,23,456" / "$1,234.50" — the book's own currency when the ERP names it. */
export function money(amount: number | undefined, currency?: string): string {
  if (amount == null || Number.isNaN(Number(amount))) return '';
  const cur = String(currency || '').toUpperCase();
  const locale = cur === 'INR' || !cur ? 'en-IN' : 'en-US';
  const n = Number(amount).toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sym = cur === 'INR' ? '₹' : cur === 'USD' ? '$' : cur ? `${cur} ` : '';
  return `${sym}${n}`;
}

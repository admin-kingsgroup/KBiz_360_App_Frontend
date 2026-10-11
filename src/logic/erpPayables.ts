import type { ErpChangeRequest, ErpCloseRow, ErpMe, ErpPaymentRequestRow } from '../api/erp';
import { money } from './erpApprovals';

// Approvals ▸ Payables in the app (owner, 2026-10-09: "show Receivables and Payables in the app with the
// same functionality as the ERP"). Pure mirrors of the ERP's own rules — Books tk-group/utils
// changeRequests.js + inbox.js and approvals/RecentlyApprovedPayments.jsx — so the app shows what the
// ERP shows and never offers a button the ERP refuses. The ERP still decides every act; change both together.

/** A supplier payment request (FM → Director → Owner, every amount). The ERP's PAYMENT_TYPES. */
export const PAYMENT_TYPES: readonly string[] = ['payment_request'];
export const isPaymentRequest = (cr: { type?: string } | null | undefined): boolean => PAYMENT_TYPES.includes(String(cr?.type || ''));
/** HR's request types live on the HR tab (the ERP's HR_TAB_TYPES are all hr_*). */
export const isHrRequest = (cr: { type?: string } | null | undefined): boolean => /^hr_/i.test(String(cr?.type || ''));

/** Which requests a branch focus shows — the ERP's atFocus: ALL → every one; a branch → its own plus
 *  the group-wide ones (no branch), which belong to every branch. */
export function atFocus<T extends { branch?: string }>(rows: T[] | null | undefined, code: string): T[] {
  const list = Array.isArray(rows) ? rows : [];
  const c = String(code || '').trim().toUpperCase();
  if (!c || c === 'ALL') return list;
  return list.filter((r) => !r || !r.branch || String(r.branch).toUpperCase() === c);
}

/** What each tab holds at a branch focus. Payables keeps the group-wide requests in every branch (atFocus);
 *  Requests, HR, Credit and Month Close keep a branch's own rows, the group-wide ones only under ALL. */
export function approvalsAt<L extends { branch?: string }, C extends { branch?: string }>(
  lists: { crs: ErpChangeRequest[]; leave: L[]; credit: C[]; close: ErpCloseRow[] }, focus: string,
) {
  const f = String(focus || '').trim().toUpperCase();
  const at = (b?: string) => !f || f === 'ALL' || String(b || '').toUpperCase() === f;
  return {
    payables: atFocus(lists.crs.filter(isPaymentRequest), f),
    requests: lists.crs.filter((r) => !isHrRequest(r) && !isPaymentRequest(r) && at(r.branch)),
    hrRequests: lists.crs.filter((r) => isHrRequest(r) && at(r.branch)),
    leave: lists.leave.filter((a) => at(a.branch)),
    credit: lists.credit.filter((c) => at(c.branch)),
    close: lists.close.filter((r) => (r.status === 'held' || r.status === 'checking') && at(r.branch)),
  };
}

/** The badge on each tab. Receivables reads nothing, so it has none (as on the ERP). */
export function tabCounts(a: ReturnType<typeof approvalsAt>): { payables: number; requests: number; credit: number; hr: number; close: number } {
  return { payables: a.payables.length, requests: a.requests.length, credit: a.credit.length, hr: a.leave.length + a.hrRequests.length, close: a.close.length };
}

/** The number on each branch chip (owner, 2026-10-10: "branches should show how many approvals are in which
 *  branch") — the sum of the tab badges that branch shows, so the chip and the tabs never disagree. */
export function branchCounts(lists: Parameters<typeof approvalsAt>[0], branches: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of branches) {
    const c = tabCounts(approvalsAt(lists, b));
    out[b] = c.payables + c.requests + c.credit + c.hr + c.close;
  }
  return out;
}

/** Everything waiting in ERP approvals across all branches, each row once — the "All branches" chip's
 *  number. The Approvals tab badge adds the app's own requests to it (owner, 2026-10-10). */
export function allBranchesTotal(lists: Parameters<typeof approvalsAt>[0]): number {
  return branchCounts(lists, ['ALL']).ALL;
}

/** The chain level a signed-in role holds, by the ERP's canonical names. */
export function chainRoleOf(role: string | undefined): string {
  const r = String(role || '').trim();
  if (/^(owner|super\s*_?admin)$/i.test(r)) return 'Owner';
  if (/^director$/i.test(r)) return 'Director';
  if (/^finance\s*_?manager$/i.test(r) || r === 'FinanceManager') return 'FinanceManager';
  return r;
}

type Level = { order?: number; role: string; label?: string };
const levelsOf = (cr: Pick<ErpChangeRequest, 'chain'>): Level[] => [...(cr.chain ?? [])].sort((a, b) => (a.order || 0) - (b.order || 0));
const signedRoles = (cr: Pick<ErpChangeRequest, 'approvals'>): Set<string> => new Set((cr.approvals ?? []).map((a) => a.role));
const lc = (s: string | undefined): string => String(s || '').trim().toLowerCase();

/** The chain as ticks — "Review (FM) ✓ → Confirm (Director) → Approve (Owner)". */
export function chainSteps(cr: Pick<ErpChangeRequest, 'chain' | 'approvals'>): Array<{ label: string; done: boolean }> {
  const signed = signedRoles(cr);
  return levelsOf(cr).map((l) => ({ label: l.label || l.role, done: signed.has(l.role) }));
}

/** Whom it waits on, as the ERP names the level ("Review (FM)") — an ordered chain waits on ONE level. */
export function waitingLabel(cr: Pick<ErpChangeRequest, 'chain' | 'approvals'>): string {
  const signed = signedRoles(cr);
  const next = levelsOf(cr).find((l) => !signed.has(l.role));
  return next ? next.label || next.role : '';
}

/** GOVN-GATE-02: only the chain's own levels act on it — why every act is off for `me`, or ''. */
export function outsideChainWhy(cr: ErpChangeRequest, me: Pick<ErpMe, 'role'> | null): string {
  if (!me?.role) return '';
  const levels = levelsOf(cr);
  if (!levels.length || levels.some((l) => l.role === chainRoleOf(me.role))) return '';
  const who = levels.map((l) => ({ FinanceManager: 'the FM', Director: 'the Director', Owner: 'the Owner' } as Record<string, string>)[l.role] || l.role);
  return `Only ${who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}` : who[0]} act on this request.`;
}

/** CRED-GATE-01: the maker never approves their own request — except the Owner, the last level. */
export function ownRequestWhy(cr: ErpChangeRequest, me: Pick<ErpMe, 'role' | 'email'> | null): string {
  if (!me || chainRoleOf(me.role) === 'Owner') return '';
  const maker = lc(cr.maker?.userId);
  return maker && maker === lc(me.email) ? 'You raised this request — someone else must review, confirm and approve it.' : '';
}

/** CRED-GATE-02: a level never signs twice. `act` 'decline': the FM / Owner who RAISED it may still
 *  reject or send it back. Why `me`'s acts are off, or ''. */
export function signedWhy(cr: ErpChangeRequest, me: Pick<ErpMe, 'role' | 'email'> | null, act: 'approve' | 'decline' = 'approve'): string {
  if (!me?.role) return '';
  const mine = chainRoleOf(me.role);
  if (!(cr.approvals ?? []).some((a) => a.role === mine)) return '';
  const maker = lc(cr.maker?.userId);
  if (act === 'decline' && (mine === 'FinanceManager' || mine === 'Owner') && maker && maker === lc(me.email)) return '';
  const next = waitingLabel(cr);
  return `Your level has signed this request${next ? ` — it now waits for ${next}` : ''}.`;
}

/** CRED-GATE-03: the unsigned levels before `role`'s own that its approval signs past — [] in its turn.
 *  The maker's own level is left out (they may never sign it; the ERP records why itself). */
export function signPastLevels(cr: ErpChangeRequest, role: string | undefined): string[] {
  const mine = chainRoleOf(role);
  const maker = chainRoleOf(cr.maker?.role);
  const signed = signedRoles(cr);
  const levels = levelsOf(cr);
  const at = levels.findIndex((l) => l.role === mine);
  if (at < 0) return [];
  return levels.slice(0, at).filter((l) => !signed.has(l.role) && l.role !== maker).map((l) => l.label || l.role);
}

/** Re-run / Close of an approved-but-not-applied request: the Owner's or Super Admin's (requireRole). */
export const REAPPLY_REASON = 'Only the Owner or Super Admin can re-run or close an approved request.';
export const mayReapply = (role: string | undefined): boolean => /^(owner|super\s*_?admin)$/i.test(String(role || '').trim());

/** Approved, but the change never went through — signed off with nothing altered. */
export const isStuck = (cr: Pick<ErpChangeRequest, 'status' | 'appliedAt'>): boolean => cr.status === 'approved' && !cr.appliedAt;

// ── What a payment request is ABOUT (Books inbox.js requestSubject / paymentRequestRows) ──
export interface PaymentAfter {
  kind?: string; party?: string; hub?: boolean; amount?: number; payOn?: string; bank?: string; advance?: boolean; note?: string;
  bills?: Array<{ billVno?: string; supplierRef?: string; dueOn?: string; outstanding?: number; amount?: number }>;
  books?: { closing?: number; openBills?: number } | null;
}
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const join = (parts: string[]): string => parts.filter(Boolean).join(' · ');
const amt = (n: unknown, ccy?: string, keepZero = false): string => {
  const v = Number(n);
  if (!Number.isFinite(v) || (v === 0 && !keepZero)) return '';
  return money(v, ccy);
};

export const paymentAfterOf = (cr: Pick<ErpChangeRequest, 'payload'>): PaymentAfter => ((cr.payload?.after ?? {}) as PaymentAfter);

/** "Air India · ₹1,20,000 · pay 2026-10-12 · 3 bills" — who is paid, how much, on what day, and for what. */
export function paymentSubject(a: PaymentAfter, ccy?: string): string {
  const what = a.kind === 'head' ? txt(a.note) : a.advance ? 'advance' : Array.isArray(a.bills) && a.bills.length ? `${a.bills.length} bill${a.bills.length === 1 ? '' : 's'}` : '';
  return join([txt(a.party), amt(a.amount, ccy), a.payOn ? `pay ${a.payOn}` : '', what]);
}

export interface DetailRow { label: string; from: string; to: string }
/** The request line by line — each bill (due, left, paid now), the pay day and bank, the books when raised. */
export function paymentDetailRows(a: PaymentAfter, ccy?: string): DetailRow[] {
  const bills = Array.isArray(a.bills) ? a.bills : [];
  if (a.kind === 'head') {
    return [
      { label: a.hub ? 'Hub account' : 'Paid to', from: '', to: txt(a.party) },
      { label: 'Amount', from: '', to: amt(a.amount, ccy) },
      { label: 'Pay on', from: '', to: join([txt(a.payOn), txt(a.bank)]) },
      ...(txt(a.note) ? [{ label: 'For', from: '', to: txt(a.note) }] : []),
    ];
  }
  return [
    ...(a.advance
      ? [{ label: 'Advance', from: '', to: join([amt(a.amount, ccy), txt(a.note)]) }]
      : bills.map((b) => ({
        label: join([txt(b.billVno), txt(b.supplierRef)]),
        from: join([b.dueOn ? `due ${b.dueOn}` : '', amt(b.outstanding, ccy) ? `left ${amt(b.outstanding, ccy)}` : '']),
        to: amt(b.amount, ccy),
      }))),
    { label: 'Pay on', from: '', to: join([txt(a.payOn), txt(a.bank)]) },
    ...(a.books ? [{ label: 'Books when raised', from: '', to: join([`closing ${amt(a.books.closing, ccy, true)}`, `open bills ${amt(a.books.openBills, ccy, true)}`, 'nothing on account']) }] : []),
    ...(!a.advance && txt(a.note) ? [{ label: 'Note', from: '', to: txt(a.note) }] : []),
  ];
}

// ── Recently approved (Books RecentlyApprovedPayments) ──
export const RECENT_DAYS = 7;
/** Where an approved request went: paid (posted), entered but not posted, or not paid yet. */
export function paymentState(r: Pick<ErpPaymentRequestRow, 'payment'>): { tone: 'success' | 'info' | 'warning'; word: string; note: string } {
  if (r.payment && r.payment.posted) return { tone: 'success', word: 'Paid', note: '' };
  if (r.payment) return { tone: 'info', word: 'Entered', note: 'not posted yet' };
  return { tone: 'warning', word: 'Not paid yet', note: 'pay it from the Payment voucher' };
}
/** The list's rows are flat — the same subject line as a pending request. */
export const recentSubject = (r: ErpPaymentRequestRow): string => paymentSubject(r as PaymentAfter, r.bookCurrency);
export const lastSigner = (r: Pick<ErpPaymentRequestRow, 'approvals'>): string => {
  const list = r.approvals ?? [];
  return list.length ? String(list[list.length - 1].by || '') : '';
};

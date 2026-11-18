import type { ErpChangeRequest, ErpMe, ErpPaymentRequestRow } from '../api/erp';
import { money } from './erpApprovals';
import { chainRoleOf, isCreditRequest, isEntryRequest, isTransitRequest, myTurnOn, notRetired, waitingRoles } from './erpRequests';

export { chainRoleOf };

// Approvals ▸ Payables in the app (owner, 2026-10-09: "show Receivables and Payables in the app with the
// same functionality as the ERP"). Pure mirrors of the ERP's own rules — Books tk-group/utils
// changeRequests.js + inbox.js and approvals/RecentlyApprovedPayments.jsx — so the app shows what the
// ERP shows and never offers a button the ERP refuses. The ERP still decides every act; change both together.

/** A supplier payment request (BM → FM → Director since 2026-10-29, every amount). The ERP's PAYMENT_TYPES. */
export const PAYMENT_TYPES: readonly string[] = ['payment_request'];
export const isPaymentRequest = (cr: { type?: string } | null | undefined): boolean => PAYMENT_TYPES.includes(String(cr?.type || ''));
/** HR's request types live on the HR tab (the ERP's HR_TAB_TYPES are all hr_*). */
export const isHrRequest = (cr: { type?: string } | null | undefined): boolean => /^hr_/i.test(String(cr?.type || ''));
/** A booking below its minimum GP — reviewed after posting (BM reason → FM → Director → Owner confirm, or send back; never
 *  rejected). The ERP lists these on Approvals ▸ Entries ▸ Below GP Line since 2026-10-29, so the app does too. */
export const MARGIN_TYPES: readonly string[] = ['margin_floor'];
export const isMarginReview = (cr: { type?: string } | null | undefined): boolean => MARGIN_TYPES.includes(String(cr?.type || ''));

/** Which requests a branch focus shows — the ERP's atFocus: ALL → every one; a branch → its own plus
 *  the group-wide ones (no branch), which belong to every branch. */
export function atFocus<T extends { branch?: string }>(rows: T[] | null | undefined, code: string): T[] {
  const list = Array.isArray(rows) ? rows : [];
  const c = String(code || '').trim().toUpperCase();
  if (!c || c === 'ALL') return list;
  return list.filter((r) => !r || !r.branch || String(r.branch).toUpperCase() === c);
}

/** What each screen holds at a branch focus. Payables keeps the group-wide requests in every branch (atFocus);
 *  Below GP, Other requests, HR and CFM keep a branch's own rows, the group-wide ones only under ALL; an entry counts in
 *  the branch it is booked in and in the branch its next step is given in (pendingEntries' rule). Month Close is not in
 *  the app any more (owner, 2026-10-29: "in mobile app show Entries, CFM and Request"). */
/** The entries a branch focus shows: ALL → every one; a branch → those booked there and those whose next step is given
 *  there (pendingEntries' rule). Used for the Approve list and for the view-only Check list alike. */
export function entriesAtFocus<E extends { branch?: string; actionBranch?: string }>(entries: E[] | null | undefined, focus: string): E[] {
  const f = String(focus || '').trim().toUpperCase();
  const list = Array.isArray(entries) ? entries : [];
  if (!f || f === 'ALL') return list;
  return list.filter((e) => String(e.branch || '').toUpperCase() === f || String(e.actionBranch || '').toUpperCase() === f);
}

export function approvalsAt<L extends { branch?: string }, C extends { branch?: string }, E extends { branch?: string; actionBranch?: string }, X extends { branch?: string } = { branch?: string }>(
  lists: { crs: ErpChangeRequest[]; leave: L[]; credit: C[]; entries?: E[]; edits?: X[] }, focus: string,
) {
  const f = String(focus || '').trim().toUpperCase();
  const all = !f || f === 'ALL';
  const at = (b?: string) => all || String(b || '').toUpperCase() === f;
  const crs = lists.crs.filter(notRetired);
  return {
    entries: entriesAtFocus(lists.entries, f),
    margin: crs.filter((r) => isMarginReview(r) && at(r.branch)),
    // On the ERP's Entries since 2026-11-14: the Hub FX voucher, a posted item off the books, a change on approval.
    entryRequests: crs.filter((r) => isEntryRequest(r) && at(r.branch)),
    // Listed on the ERP's Entries too, but outside its Entries figure.
    transit: crs.filter((r) => isTransitRequest(r) && at(r.branch)),
    edits: (lists.edits ?? []).filter((e) => at(e.branch)),
    payables: atFocus(crs.filter(isPaymentRequest), f),
    requests: crs.filter((r) => !isHrRequest(r) && !isPaymentRequest(r) && !isMarginReview(r) && !isEntryRequest(r) && !isTransitRequest(r) && at(r.branch)),
    hrRequests: crs.filter((r) => isHrRequest(r) && at(r.branch)),
    leave: lists.leave.filter((a) => at(a.branch)),
    credit: lists.credit.filter((c) => at(c.branch)),
  };
}

/** The badge on each screen. `requests` is Requests ▸ Other. */
export function tabCounts(a: ReturnType<typeof approvalsAt>): { entries: number; margin: number; entryRequests: number; edits: number; payables: number; requests: number; credit: number; hr: number } {
  return { entries: a.entries.length, margin: a.margin.length, entryRequests: a.entryRequests.length, edits: a.edits.length, payables: a.payables.length, requests: a.requests.length, credit: a.credit.length, hr: a.leave.length + a.hrRequests.length };
}

/** The three tabs' badges: Entries = entries + Below GP + Edits for FM + the requests the ERP lists there; CFM = credit;
 *  Requests = Payables + HR + Other. */
export function tabTotals(c: ReturnType<typeof tabCounts>): { entries: number; cfm: number; requests: number } {
  return { entries: c.entries + c.margin + c.entryRequests + c.edits, cfm: c.credit, requests: c.payables + c.hr + c.requests };
}

/** The number on each branch chip (owner, 2026-10-10: "branches should show how many approvals are in which
 *  branch") — the sum of the tab badges that branch shows, so the chip and the tabs never disagree. */
export function branchCounts(lists: Parameters<typeof approvalsAt>[0], branches: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of branches) {
    const t = tabTotals(tabCounts(approvalsAt(lists, b)));
    out[b] = t.entries + t.cfm + t.requests;
  }
  return out;
}

/** Everything waiting in ERP approvals across all branches, each row once — the "All branches" chip's
 *  number. The Approvals tab badge adds the app's own requests to it (owner, 2026-10-10). */
export function allBranchesTotal(lists: Parameters<typeof approvalsAt>[0]): number {
  return branchCounts(lists, ['ALL']).ALL;
}

/** What is at this person's step at a branch focus — the ERP's Waiting on me, without Month Close (signed in the ERP): the
 *  requests waiting on their level, the credit they may act on, and the leave at their turn. */
export function waitingOnMe<L extends { branch?: string; turn?: { allowed?: boolean } }, C extends { branch?: string; yourTurn?: boolean; signPast?: unknown[] }>(
  lists: { crs: ErpChangeRequest[]; leave: L[]; credit: C[] }, focus: string, me: Pick<ErpMe, 'role' | 'email'>,
) {
  const f = String(focus || '').trim().toUpperCase();
  const all = !f || f === 'ALL';
  const at = (b?: string) => all || String(b || '').toUpperCase() === f;
  const requests = atFocus(lists.crs.filter((r) => notRetired(r) && !isCreditRequest(r)), f).filter((r) => myTurnOn(r, me));
  const credit = lists.credit.filter((c) => at(c.branch) && (!!c.yourTurn || (c.signPast?.length ?? 0) > 0));
  const leave = lists.leave.filter((a) => at(a.branch) && !!a.turn?.allowed);
  return { requests, credit, leave, total: requests.length + credit.length + leave.length };
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
export function waitingLabel(cr: Pick<ErpChangeRequest, 'type' | 'chain' | 'approvals' | 'maker'>): string {
  const levels = levelsOf(cr);
  return waitingRoles(cr).map((role) => levels.find((l) => l.role === role)?.label || role).join(' → ');
}

/** GOVN-GATE-02: only the chain's own levels act on it — why every act is off for `me`, or ''. */
export function outsideChainWhy(cr: ErpChangeRequest, me: Pick<ErpMe, 'role'> | null): string {
  if (!me?.role) return '';
  const levels = levelsOf(cr);
  if (!levels.length || levels.some((l) => l.role === chainRoleOf(me.role))) return '';
  const who = levels.map((l) => ({ BranchManager: 'the BM', FinanceManager: 'the FM', Director: 'the Director', Owner: 'the Owner' } as Record<string, string>)[l.role] || l.role);
  return `Only ${who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]} act` : `${who[0]} acts`} on this request.`;
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

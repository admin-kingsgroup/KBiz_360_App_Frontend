import type {
  ErpApprovalsStatus, ErpCashPlan, ErpCashPlanRow, ErpChangeRequest, ErpCloseRow, ErpConcern, ErpConcernsErp, ErpConcernsMine, ErpMe,
  ErpPendingEntry, ErpRecordedEvent, ErpStatusCell, ErpStatusPerson,
} from '../api/erp';
import { chainRoleOf } from './erpRequests';

// The ERP's Approvals strip in the app (2026-11-18: "these same I want in the app, exact same, same order"). Pure mirrors of
// Books approvals/approvalsCounts.js, approvalsTabs.jsx, voucherApprovals.jsx (the Entries pills), ApprovalsStatus.jsx,
// raisedByMe.jsx, recordedList.jsx, PlanOverview.jsx, MonthClosePage.jsx (Close) and concerns-section.jsx. Change both together.

export type ApprovalTab = 'mine' | 'entries' | 'pay' | 'hr' | 'setup' | 'close' | 'status' | 'rr' | 'review';
export const APPROVAL_TABS: ReadonlyArray<{ key: ApprovalTab; label: string }> = [
  { key: 'mine', label: 'Waiting on me' }, { key: 'entries', label: 'Entries' }, { key: 'pay', label: 'Pay & Credit' }, { key: 'hr', label: 'HR & Payroll' },
  { key: 'setup', label: 'Setup' }, { key: 'close', label: 'Close' }, { key: 'status', label: 'Status' }, { key: 'rr', label: 'Raise & Resolve' },
];

export type SubTabOwner = 'pay' | 'setup' | 'status' | 'rr';
export const SUBTABS: Record<SubTabOwner, ReadonlyArray<{ key: string; label: string; onlyWhenWaiting?: boolean }>> = {
  pay: [{ key: 'payables', label: 'Payment requests (APFP)' }, { key: 'bank', label: 'Supplier bank' }, { key: 'credit', label: 'Credit (CFM)' }],
  setup: [{ key: 'settings', label: 'Settings & access' }, { key: 'masters', label: 'Masters' }, { key: 'targets', label: 'Targets & budgets' }, { key: 'other', label: 'Other requests', onlyWhenWaiting: true }],
  status: [{ key: 'board', label: 'By book & holder' }, { key: 'raised', label: 'Raised by me' }, { key: 'recorded', label: 'Recorded' }],
  rr: [{ key: 'move', label: 'My move' }, { key: 'wait', label: 'Waiting on others' }, { key: 'cc', label: 'Copied to me' }, { key: 'closed', label: 'Closed' }, { key: 'erp', label: 'ERP Concerns' }],
};
export const hasSubTabs = (tab: ApprovalTab): tab is SubTabOwner => tab in SUBTABS;

/** Which tab and sub-tab an address names. The app's older tabs still land where their screen went, as on the ERP. */
export function placeOf(tab?: string, sub?: string): { tab: ApprovalTab; sub?: string } | null {
  if (!tab) return null;
  if (tab === 'cfm' || tab === 'credit') return { tab: 'pay', sub: 'credit' };
  if (tab === 'requests') {
    if (sub === 'hr') return { tab: 'hr' };
    if (sub === 'other') return { tab: 'setup', sub: 'settings' };
    return { tab: 'pay', sub: 'payables' };
  }
  if (tab === 'review') return { tab: 'review' };
  const found = APPROVAL_TABS.find((t) => t.key === tab);
  if (!found) return null;
  if (!hasSubTabs(found.key)) return { tab: found.key };
  const subs = SUBTABS[found.key];
  return { tab: found.key, sub: subs.some((s) => s.key === sub) ? sub : subs[0].key };
}

// ── Entries: the ERP's pills, in its order ──
export type EntryPill =
  | 'all' | 'spgb' | 'spgh-out' | 'spgh-in' | 'refund-b' | 'reissue-b' | 'refund-h' | 'reissue-h' | 'edits' | 'below-gp' | 'awaiting-fx' | 'hub-rv' | 'hub-pmt' | 'pairs'
  | 'receipt' | 'payment' | 'contra' | 'journal' | 'purchase-expense' | 'debit-note' | 'commission' | 'adm' | 'acm' | 'unrouted';
export const ENTRY_PILLS: ReadonlyArray<{ key: EntryPill; label: string; hub?: boolean }> = [
  { key: 'all', label: 'All pending' }, { key: 'spgb', label: 'SPGB' }, { key: 'spgh-out', label: 'SPGH · Out', hub: true }, { key: 'spgh-in', label: 'SPGH · In', hub: true },
  { key: 'refund-b', label: 'Refund · B' }, { key: 'reissue-b', label: 'Reissue · B' }, { key: 'refund-h', label: 'Refund · H', hub: true }, { key: 'reissue-h', label: 'Reissue · H', hub: true },
  { key: 'edits', label: 'Edits for FM' }, { key: 'below-gp', label: 'Below GP Line' }, { key: 'awaiting-fx', label: 'Awaiting FX rate', hub: true }, { key: 'hub-rv', label: 'HRV · Received', hub: true },
  { key: 'hub-pmt', label: 'HPV · Sent', hub: true }, { key: 'pairs', label: 'HPV & HRV Pairs', hub: true }, { key: 'receipt', label: 'Receipt' }, { key: 'payment', label: 'Payment' },
  { key: 'contra', label: 'Contra' }, { key: 'journal', label: 'Journal' }, { key: 'purchase-expense', label: 'Purchase Expense' }, { key: 'debit-note', label: 'Debit Note' },
  { key: 'commission', label: 'Incentive' }, { key: 'adm', label: 'ADM' }, { key: 'acm', label: 'ACM' }, { key: 'unrouted', label: 'Unrouted' },
];
const PILL_OF_TYPE: Record<string, EntryPill> = {
  RV: 'receipt', PMT: 'payment', CV: 'contra', JV: 'journal', PXP: 'purchase-expense', PXPDN: 'debit-note', CI: 'commission', ADM: 'adm', ACM: 'acm',
};
const up = (s: unknown): string => String(s ?? '').trim().toUpperCase();
const reversalPill = (kind: 'F' | 'I', hub: boolean): EntryPill => (kind === 'F' ? (hub ? 'refund-h' : 'refund-b') : (hub ? 'reissue-h' : 'reissue-b'));

/** The pill that lists a pending entry — the ERP's "Open →" from All pending. null: only All pending lists it (Taxation, Salary). */
export function entryPillOf(e: Pick<ErpPendingEntry, 'kind' | 'type' | 'ref' | 'sub' | 'pipeline' | 'deal'>): EntryPill | null {
  const hub = e.pipeline === 'hub';
  if (e.pipeline === 'other') return 'unrouted';
  if (e.kind === 'file') {
    const module = up(String(e.sub ?? '').split('·')[0]);
    if (module === 'RF' || module === 'RI') return reversalPill(module === 'RF' ? 'F' : 'I', hub);
    return hub ? 'spgh-in' : 'spgb';
  }
  const type = up(e.type);
  if (type === 'HPV') return 'hub-pmt';
  if (type === 'HRV') return 'hub-rv';
  if (e.deal || type === 'HBD' || type === 'HUB') return 'spgh-out';
  const reversal = /^R([FI])([BHI])?$/.exec(type);
  if (reversal) {
    const letter = reversal[2] ?? /^R[FI]([BHI])\//.exec(up(e.ref))?.[1];
    return reversalPill(reversal[1] as 'F' | 'I', letter ? letter === 'H' : hub);
  }
  return PILL_OF_TYPE[type] ?? null;
}

export function entriesOnPill<E extends Pick<ErpPendingEntry, 'kind' | 'type' | 'ref' | 'sub' | 'pipeline' | 'deal'>>(entries: E[], pill: EntryPill): E[] {
  return pill === 'all' ? entries : entries.filter((e) => entryPillOf(e) === pill);
}

// ── Pay & Credit ▸ Supplier bank, and Setup's four lists ──
export const PARTY_BANK_TYPES: readonly string[] = ['party_bank'];
const CREDIT_TYPES = ['credit_facility'];
const SETUP_TYPES: Record<'settings' | 'masters' | 'targets', readonly string[]> = {
  settings: ['config', 'flag', 'user_limit', 'access_change', 'period_lock'],
  masters: ['master', 'credit_policy', 'ledger_change', 'branch_change'],
  targets: ['target_budget'],
};
const NAMED = [...SETUP_TYPES.settings, ...SETUP_TYPES.masters, ...SETUP_TYPES.targets];
/** One Setup list out of the requests that are neither HR, payments, Below GP nor Entries'. */
export function setupRows<R extends Pick<ErpChangeRequest, 'type'>>(requests: R[], sub: string): R[] {
  if (sub === 'settings' || sub === 'masters' || sub === 'targets') return requests.filter((r) => SETUP_TYPES[sub].includes(r.type));
  return requests.filter((r) => !NAMED.includes(r.type) && !PARTY_BANK_TYPES.includes(r.type) && !CREDIT_TYPES.includes(r.type));
}
export const supplierBankRows = <R extends Pick<ErpChangeRequest, 'type'>>(requests: R[]): R[] => requests.filter((r) => PARTY_BANK_TYPES.includes(r.type));

// ── Close ──
const CLOSE_OPEN = ['held', 'checking'];
const atBook = (branch: string | undefined, focus: string): boolean => !focus || up(focus) === 'ALL' || up(branch) === up(focus);
export const isCertified = (r: Pick<ErpCloseRow, 'directorSign'>): boolean => !!r.directorSign?.at;
/** The closes waiting on someone: held for the Owner's lock first, then those the team is checking. */
export function closesAt(rows: ErpCloseRow[], focus: string): ErpCloseRow[] {
  return rows.filter((r) => CLOSE_OPEN.includes(r.status) && atBook(r.branch, focus))
    .sort((a, b) => CLOSE_OPEN.indexOf(a.status) - CLOSE_OPEN.indexOf(b.status) || String(a.branch).localeCompare(String(b.branch)));
}
export const closeStage = (r: ErpCloseRow): string => (r.status === 'held' ? (isCertified(r) ? 'Owner to lock' : 'Director to certify') : 'Team checking');
export const closeWaitingOn = (r: ErpCloseRow): string => (r.status === 'held' ? (isCertified(r) ? 'Owner' : 'Director · then the Owner') : 'Accounts team · then the FM');
export function closeLine(r: ErpCloseRow): string {
  const n = Number(r.months) || 0;
  return [n ? `${n} month${n === 1 ? '' : 's'}` : '', r.fmSign?.by ? `signed by ${r.fmSign.by}` : '', r.ahead?.label ? `then ${r.ahead.label} being checked` : ''].filter(Boolean).join(' · ');
}
/** The Close badge and "Month Close owed by you": a held close counts for the Owner; everyone else owes none here. */
export function closesOwed(rows: ErpCloseRow[], focus: string, role: string | undefined): number {
  return chainRoleOf(role) === 'Owner' ? rows.filter((r) => r.status === 'held' && atBook(r.branch, focus)).length : 0;
}

// ── Status ▸ By book & holder ──
export const STATUS_COLUMNS: ReadonlyArray<{ key: string; label: string; go: { tab: ApprovalTab; sub?: string; pill?: EntryPill } }> = [
  { key: 'entries', label: 'Entries', go: { tab: 'entries' } }, { key: 'margin', label: 'Below GP', go: { tab: 'entries', pill: 'below-gp' } },
  { key: 'credit', label: 'CFM', go: { tab: 'pay', sub: 'credit' } }, { key: 'payables', label: 'Payables', go: { tab: 'pay', sub: 'payables' } },
  { key: 'hr', label: 'HR', go: { tab: 'hr' } }, { key: 'requests', label: 'Setup', go: { tab: 'setup', sub: 'settings' } }, { key: 'close', label: 'Month Close', go: { tab: 'close' } },
];
const ROLE_META: Record<string, { label: string; badge: string; group: string; act?: string; nobody?: boolean }> = {
  FinanceManager: { label: 'Finance Manager', badge: 'FM', group: 'sign', act: 'Approve' },
  AccountsExecutive: { label: 'Accounts Executive', badge: 'AE', group: 'sign', act: 'Verify' },
  Director: { label: 'Director', badge: 'DIRECTOR', group: 'sign', act: 'Sign-off' },
  Owner: { label: 'Owner', badge: 'OWNER', group: 'sign', act: 'Final sign-off' },
  GeneralManager: { label: 'General Manager', badge: 'GM', group: 'sign' },
  BranchManager: { label: 'Branch Manager', badge: 'BM', group: 'bm', act: 'Recommend' },
  BranchAccountant: { label: 'Branch Accountant', badge: 'BA', group: 'ba', act: 'Check' },
  SwapPartner: { label: 'Swap partner', badge: 'STAFF', group: 'other', nobody: true },
  Unrouted: { label: 'Not routed to a stage', badge: '—', group: 'other', nobody: true },
};
const metaOf = (role: string) => ROLE_META[role] ?? { label: role, badge: role.slice(0, 3).toUpperCase(), group: 'other' };
export const STATUS_SECTIONS: ReadonlyArray<{ key: string; title: string; hint: string }> = [
  { key: 'sign', title: 'Approve & sign-off', hint: 'one queue across the books in view' },
  { key: 'bm', title: 'Branch Managers', hint: 'recommend — HR, below the GP line' },
  { key: 'ba', title: 'Branch Accountants', hint: 'Check — one shared queue per book' },
  { key: 'other', title: 'Not on a desk', hint: 'waiting on a colleague, or on no stage' },
];
const ALWAYS = ['FinanceManager', 'Director', 'Owner'];
const maxAge = (a: number | null, b: number | null | undefined): number | null => (b == null ? a : a == null ? b : Math.max(a, b));

/** Every cell at ALL; one book's and the group-wide ones at a book. */
export function cellsAtFocus(cells: ErpStatusCell[] | undefined, focus: string): ErpStatusCell[] {
  const list = Array.isArray(cells) ? cells : [];
  const f = up(focus);
  return !f || f === 'ALL' ? list : list.filter((c) => !c.branch || up(c.branch) === f);
}
export interface StatusTally { by: Record<string, number>; total: number; oldest: number | null }
export function tally(cells: ErpStatusCell[], keep: (c: ErpStatusCell) => boolean = () => true): StatusTally {
  const out: StatusTally = { by: {}, total: 0, oldest: null };
  for (const c of cells) {
    if (!keep(c)) continue;
    out.by[c.tab] = (out.by[c.tab] ?? 0) + c.n;
    out.total += c.n;
    out.oldest = maxAge(out.oldest, c.oldestDays);
  }
  return out;
}
export interface StatusHolder extends StatusTally { key: string; role: string; book: string; people: ErpStatusPerson[]; label: string; badge: string; group: string; act: string }
/** The User-wise rows: one per role, a branch role once per book. Several people on one queue are one row, counted once. */
export function holderRows(data: Pick<ErpApprovalsStatus, 'people' | 'branchRoles'>, cells: ErpStatusCell[], books: string[]): StatusHolder[] {
  const branchRole = new Set(data.branchRoles ?? []);
  const rows = new Map<string, StatusHolder>();
  const rowOf = (role: string, book: string): StatusHolder => {
    const key = `${role}|${book}`;
    let row = rows.get(key);
    if (!row) {
      const all = data.people?.[role] ?? [];
      const people = branchRole.has(role) ? all.filter((p) => !book || !p.branches || p.branches.includes(book)) : all;
      const m = metaOf(role);
      const gm = role === 'BranchManager' && people.length > 0 && people.every((p) => /^\s*(gm|general\s*manager)\b/i.test(p.title ?? ''));
      row = { key, role, book, people, by: {}, total: 0, oldest: null, group: m.group, act: m.act ?? '', label: gm ? (people.length === 1 ? String(people[0].title) : 'GM') : m.label, badge: gm ? 'GM' : m.badge };
      rows.set(key, row);
    }
    return row;
  };
  const holds = (role: string, b: string) => (data.people?.[role] ?? []).some((p) => !p.branches || p.branches.includes(b));
  for (const b of books) {
    if (branchRole.has('BranchAccountant')) rowOf('BranchAccountant', b);
    if (branchRole.has('BranchManager') && holds('BranchManager', b)) rowOf('BranchManager', b);
  }
  for (const role of ALWAYS) rowOf(role, '');
  for (const c of cells) {
    const r = rowOf(c.role, branchRole.has(c.role) ? up(c.branch) : '');
    r.by[c.tab] = (r.by[c.tab] ?? 0) + c.n;
    r.total += c.n;
    r.oldest = maxAge(r.oldest, c.oldestDays);
  }
  return [...rows.values()];
}
/** A stage nobody holds that is a real gap: one every book needs, or one holding work now. */
export const unheld = (u: StatusHolder): boolean => !metaOf(u.role).nobody && !u.people.length && (u.role !== 'BranchManager' || u.total > 0);
export const holderName = (u: StatusHolder): string => (u.people.length ? u.people.map((p) => p.name).join(', ') : metaOf(u.role).label);

// ── Status ▸ Raised by me, Recorded ──
export function raisedBy(cr: Pick<ErpChangeRequest, 'maker'>, me: Pick<ErpMe, 'email' | 'id'>): boolean {
  const mine = [me.email, me.id].map((s) => String(s ?? '').trim().toLowerCase()).filter(Boolean);
  return [cr.maker?.userId, cr.maker?.email].some((x) => { const v = String(x ?? '').trim().toLowerCase(); return !!v && mine.includes(v); });
}
const RECORDED_WHAT: Record<string, string> = {
  'recorded.pdc.bounce': 'Cheque bounced', 'recorded.pdc.represent': 'Cheque re-presented', 'recorded.commitment.add': 'Client promise added',
  'recorded.commitment.withdraw': 'Client promise withdrawn', 'recorded.asset.seen': 'Asset seen', 'recorded.asset.seen-withdrawn': 'Asset "seen" withdrawn',
  'recorded.adm.dropped': 'ADM dispute dropped', 'recorded.adm.deleted': 'ADM / ACM memo deleted', 'recorded.hub.utr-filled': 'UTR filled (HPV / HRV)',
  'recorded.booking.passengers-filled': 'Passenger details filled (approved booking)', 'recorded.invoice.filled': 'Invoice no. / PNR / ticket filled (posted purchase)',
};
export function recordedRow(e: ErpRecordedEvent) {
  const at = e.ts ? new Date(e.ts) : null;
  return {
    id: String(e._id ?? e.id ?? `${e.action}-${e.ts}`), branch: e.branch ?? '', what: RECORDED_WHAT[e.action ?? ''] ?? String(e.action ?? '').replace(/^recorded\./, ''),
    ref: e.after?.ref ?? '', amount: Number(e.after?.amount) || 0, by: [e.actor?.name || e.actor?.userId, e.actor?.role].filter(Boolean).join(' · '), reason: e.reason ?? '',
    at: at && !Number.isNaN(at.getTime()) ? at.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '',
  };
}

// ── Raise & Resolve ──
export type ConcernBucket = 'move' | 'wait' | 'cc' | 'closed';
export const RR_NOTE: Record<ConcernBucket, string> = {
  move: 'Your next step on each one. Late first.', wait: 'You raised these, gave the work out, or answered them — someone else has the next move.',
  cc: 'You are copied. No move needed from you.', closed: 'Closed concerns you were part of (last 30 days).',
};
/** The lists on one branch, with what the server left off them still counted. */
export function concernsAt(d: ErpConcernsMine | null | undefined, focus: string): { rows: ErpConcern[]; counts: Record<ConcernBucket, number> } {
  const f = up(focus);
  const counts: Record<ConcernBucket, number> = { move: 0, wait: 0, cc: 0, closed: 0 };
  if (!d) return { rows: [], counts };
  if (!f || f === 'ALL') return { rows: d.rows ?? [], counts: { ...counts, ...d.counts } };
  const rows = (d.rows ?? []).filter((r) => up(r.book) === f);
  rows.forEach((r) => { if (r.bucket && r.bucket in counts) counts[r.bucket as ConcernBucket] += 1; });
  const hidden = d.erp?.hiddenByBook?.[f];
  if (hidden) (Object.keys(counts) as ConcernBucket[]).forEach((k) => { counts[k] += Number((hidden as Record<string, number>)[k]) || 0; });
  return { rows, counts };
}
export const concernsOn = (rows: ErpConcern[], bucket: ConcernBucket): ErpConcern[] => rows.filter((r) => r.bucket === bucket)
  .sort((a, b) => Number(!!b.overdue) - Number(!!a.overdue) || String(a.dueDay ?? '').localeCompare(String(b.dueDay ?? '')));
/** The ERP's own open concerns this login reads on a branch, from the rule book's counts. */
export function erpConcernCount(d: ErpConcernsErp | null | undefined, focus: string): number {
  const f = up(focus);
  return Object.values(d?.counts ?? {}).reduce((t, byBook) => t + Object.entries(byBook ?? {}).reduce((s, [book, n]) => s + (!f || f === 'ALL' || up(book) === f ? Number(n) || 0 : 0), 0), 0);
}
/** The Raise & Resolve badge: every concern open on the branch — the team's on my lists and every ERP Concern I read. */
export function rrBadge(mine: ErpConcernsMine | null | undefined, erp: ErpConcernsErp | null | undefined, focus: string): { n: number; move: number } {
  const { rows, counts } = concernsAt(mine, focus);
  const team = rows.filter((r) => r.from?.desk !== 'erp' && (r.bucket === 'move' || r.bucket === 'wait' || r.bucket === 'cc')).length;
  return { n: team + erpConcernCount(erp, focus), move: counts.move };
}
export function concernStatus(r: ErpConcern, now: Date = new Date()): { tone: 'bad' | 'warn' | 'ok' | 'info' | 'plain'; word: string } {
  if (r.status === 'closed') return { tone: 'ok', word: 'Closed' };
  if (r.status === 'answered') return { tone: 'info', word: `Answered · ${r.from?.name ?? ''} to close` };
  if (r.overdue) {
    // Whole days between the two India dates, as the ERP counts them.
    const today = new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    const days = r.dueDay ? Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${r.dueDay}T00:00:00Z`)) / 86_400_000)) : 1;
    return { tone: 'bad', word: `Overdue ${days}d` };
  }
  if (r.assignLate) return { tone: 'bad', word: `${r.assignee?.name ?? ''} late` };
  if (r.assignee?.name && !r.assignDone) return { tone: 'warn', word: `With ${r.assignee.name}` };
  if (r.assignee?.name && r.assignDone) return { tone: 'info', word: `Done · ${(r.assignedBy ?? r.to)?.name ?? ''} to check` };
  if (r.dueToday) return { tone: 'warn', word: 'Due today' };
  const s = String(r.status ?? '');
  return { tone: 'plain', word: s ? s[0].toUpperCase() + s.slice(1) : '' };
}
export interface ErpConcernGroup { key: string; book: string; rule: string; name: string; rows: ErpConcern[]; late: number }
/** ERP Concerns, branch by branch and rule by rule. */
export function erpConcernGroups(d: ErpConcernsErp | null | undefined): ErpConcernGroup[] {
  const names = new Map((d?.rules ?? []).map((r) => [r.rule, r.name]));
  const groups = new Map<string, ErpConcernGroup>();
  for (const r of d?.rows ?? []) {
    const key = `${r.book ?? ''}|${r.rule ?? ''}`;
    let g = groups.get(key);
    if (!g) { g = { key, book: r.book ?? '', rule: r.rule ?? '', name: names.get(r.rule ?? '') ?? r.rule ?? '', rows: [], late: 0 }; groups.set(key, g); }
    g.rows.push(r);
    if (r.overdue) g.late += 1;
  }
  return [...groups.values()];
}

// ── Pay & Credit ▸ Payment requests: the payables above the list ──
const r2 = (n: number) => Math.round(n * 100) / 100;
export interface PayeeRow { party: string; amount: number; dueNow: number; ahead: number; aheadOn: string; dueOn: string; overdueDays: number; notYetDue: boolean; kind?: string; reco?: ErpCashPlanRow['reco'] }
/** One row per payee: a party's bills due and not yet due come as two rows and are merged back. */
export function mergeByParty(rows: ErpCashPlanRow[]): PayeeRow[] {
  const by = new Map<string, PayeeRow>();
  for (const r of rows) {
    const k = String(r.party ?? '').trim().toLowerCase();
    const m = by.get(k) ?? { party: String(r.party ?? ''), kind: r.kind, amount: 0, dueNow: 0, ahead: 0, aheadOn: '', dueOn: '', overdueDays: 0, notYetDue: true };
    const n = Number(r.amount) || 0;
    m.amount = r2(m.amount + n);
    if (r.notYetDue) {
      m.ahead = r2(m.ahead + n);
      if (r.dueOn && (!m.aheadOn || r.dueOn < m.aheadOn)) m.aheadOn = r.dueOn;
    } else {
      m.dueNow = r2(m.dueNow + n);
      if (r.dueOn && (!m.dueOn || r.dueOn < m.dueOn)) m.dueOn = r.dueOn;
      m.overdueDays = Math.max(m.overdueDays, Number(r.overdueDays) || 0);
      if (r.reco) m.reco = r.reco;
    }
    by.set(k, m);
  }
  return [...by.values()].map((m) => ({ ...m, dueOn: m.dueOn || m.aheadOn, notYetDue: m.dueNow <= 0.005 }));
}
export interface PayablesOverview { branch: string; currency?: string; payables: number; requested: number; requestedCount: number; notRequested: number; waiting: number; payees: PayeeRow[] }
/** One book's tiles (a payable in rupees and one in dollars are never added together): the Focus book, or the picked / first one at All. */
export function payablesOverview(plan: ErpCashPlan | null | undefined, focus: string, picked?: string): PayablesOverview | null {
  const books = plan?.branches ?? [];
  const f = up(focus);
  const code = f && f !== 'ALL' ? f : up(picked) || up(books[0]?.branch);
  const p = books.find((b) => up(b.branch) === code);
  if (!p?.ladder?.part2) return null;
  const sum = (list: Array<{ amount?: number }>) => r2(list.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const requested = (p.ladder.rows ?? []).filter((r) => r.kind === 'request');
  const advances = requested.filter((r) => r.request?.advance);
  const payees = mergeByParty((p.ladder.part2.rows ?? []).filter((r) => r.side === 'out' && r.kind !== 'nodate'));
  return {
    branch: p.branch, currency: p.currency, payables: r2(sum(requested) - sum(advances) + sum(payees)), requested: sum(requested), requestedCount: requested.length,
    notRequested: sum(payees), waiting: requested.filter((r) => r.request?.status === 'pending').length, payees,
  };
}

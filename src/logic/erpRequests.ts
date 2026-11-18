import type { ErpChangeRequest, ErpMe } from '../api/erp';
import { money } from './erpApprovals';

// What an ERP request IS, whose turn it is and who may act on it (2026-11-18: "in the ERP I have this many approvals, the app
// does not show all"). An Owner was shown "Posted Delete · BOM" with an Approve button, no voucher number, and the wrong
// next signer. Pure mirrors of Books tk-group/utils/inbox.js + changeRequests.js and the ERP's inbox.service — the ERP still
// decides every act; change both together.

type Req = ErpChangeRequest;
type Me = Pick<ErpMe, 'role' | 'email'>;
type After = Record<string, unknown>;
type Level = { order?: number; role: string; label?: string };

export const HUB_FX_TYPES: readonly string[] = ['hub_fx'];
export const POSTED_DELETE_TYPES: readonly string[] = ['posted_delete'];
export const DOOR_TYPES: readonly string[] = ['door_l2', 'door_l3', 'door_l4'];
export const TRANSIT_TYPES: readonly string[] = ['transit_move', 'bill_settle'];
const CREDIT_TYPES: readonly string[] = ['credit_facility'];
const PAYMENT = 'payment_request';
const MARGIN = 'margin_floor';

/** Nothing raises these since 2026-10-29; a list drops one an older server still sends. The ERP's RETIRED_TYPES. */
const RETIRED_TYPES: ReadonlySet<string> = new Set(['party_contact', 'contract', 'surplus_parking', 'fx_rate', 'fund_flow', 'cost_reduction', 'budget_approval', 'quarter_plan', 'limits', 'voucher_policy']);
export const notRetired = (cr: Pick<Req, 'type'> | null | undefined): boolean => !!cr && !RETIRED_TYPES.has(cr.type);

/** Signed one level at a time, in order — and the only requests that can go back to their maker. The ERP's ORDERED_TYPES. */
const ORDERED_TYPES: ReadonlySet<string> = new Set([
  ...CREDIT_TYPES, 'hr_attendance_change', 'hr_salary', 'hr_change', PAYMENT, ...HUB_FX_TYPES, MARGIN, 'config', 'flag', 'user_limit', 'access_change',
  'party_bank', ...POSTED_DELETE_TYPES, 'ledger_change', 'branch_change', 'door_l3', 'door_l4',
]);
const DECISION_TYPES: ReadonlySet<string> = new Set(['credit_limit', 'funds_release', 'counterparty', 'investment']);
const OVERRIDE_TYPES: ReadonlySet<string> = new Set([PAYMENT, ...HUB_FX_TYPES, 'hr_change', 'hr_salary', ...CREDIT_TYPES]);

// ── On Approvals ▸ Entries in the ERP, not among its Setup requests ──
export const isEntryRequest = (cr: Pick<Req, 'type'>): boolean => [...HUB_FX_TYPES, ...POSTED_DELETE_TYPES, ...DOOR_TYPES].includes(cr.type);
export const isTransitRequest = (cr: Pick<Req, 'type'>): boolean => TRANSIT_TYPES.includes(cr.type);
export const isCreditRequest = (cr: Pick<Req, 'type'>): boolean => CREDIT_TYPES.includes(cr.type);

export interface EntryRequestGroup { key: string; title: string; note: string; rows: Req[] }
/** The sections above the entries, in the ERP's order; an empty one is left out. */
export function entryRequestGroups(entryRequests: Req[], transit: Req[] = []): EntryRequestGroup[] {
  const of = (types: readonly string[]) => entryRequests.filter((r) => types.includes(r.type));
  return [
    { key: 'hub_fx', title: 'HUB FX VOUCHER', note: "The month's FX Realized / FX Transfer entry. It posts on approval.", rows: of(HUB_FX_TYPES) },
    { key: 'posted_delete', title: 'OFF THE BOOKS (POSTED)', note: "A posted voucher, booking or hub deal to delete or cancel, or an accepted ADM to reverse — FM → Director → Owner, in order. It comes off the books on the Owner's signature.", rows: of(POSTED_DELETE_TYPES) },
    { key: 'door', title: 'CHANGES ON APPROVAL', note: 'What the Branch Accountant or Senior Accountant asked to change. Nothing changes until it is approved.', rows: of(DOOR_TYPES) },
    { key: 'transit', title: 'TRANSIT AND BILL-WISE SETTLE', note: 'One signature: the Senior Accountant, the FM or the Owner.', rows: transit },
  ].filter((g) => g.rows.length > 0);
}

// ── What it is called and what it is about ──
const LABELS: Record<string, string> = {
  config: 'Config change', flag: 'Flag change', period_lock: 'Period lock', master: 'Master change', credit_policy: 'Credit policy', credit: 'Credit', voucher: 'Voucher',
  credit_limit: 'Credit limit', funds_release: 'Funds release', counterparty: 'Counterparty onboarding', investment: 'Investment request', credit_facility: 'Credit facility',
  target_budget: 'Target / Budget', hr: 'HR request', hr_attendance_change: 'Attendance after salary', hr_salary: 'Salary', hr_change: 'HR change',
  payment_request: 'Payment request', hub_fx: 'FX Voucher', margin_floor: 'Below minimum GP', party_bank: 'Supplier bank change', access_change: 'Login access change',
  transit_move: 'Move to transit', bill_settle: 'Bill-wise settle', door_l2: 'Change on approval', door_l3: 'Master change on approval', door_l4: 'Control change on approval',
  posted_delete: 'Off the books (posted)', ledger_change: 'Ledger change', branch_change: 'Branch change', user_limit: 'User limit',
};
export const requestTypeLabel = (type: string): string => LABELS[type] || String(type || 'Change').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const join = (parts: string[]): string => parts.filter(Boolean).join(' · ');
const amt = (n: unknown, cr: Req): string => {
  const v = Number(n);
  return Number.isFinite(v) && v !== 0 ? money(v, cr.bookCurrency) : '';
};
const num = (v: unknown): string => (Number.isFinite(Number(v)) && Number(v) !== 0 ? Number(v).toLocaleString() : '');
const afterOf = (cr: Req): After | null => {
  const a = cr.payload?.after;
  return a && typeof a === 'object' ? (a as After) : null;
};
const why = (a: After): string => (txt(a.reason) ? `why: ${txt(a.reason)}` : '');
const labelled = (a: After): string => join([txt(a.label), txt(a.ref), why(a)]);
const party = (a: After, cr: Req): string => join([txt(a.party), amt(a.amount, cr), txt(a.note)]);

const SUBJECT: Record<string, (a: After, cr: Req) => string> = {
  access_change: (a) => join([txt(a.name), txt(a.email)]),
  branch_change: (a) => join([txt(a.code), txt(a.name), a.op === 'delete' ? 'delete' : '']),
  ledger_change: (a) => join([txt(a.name), a.op === 'delete' ? 'delete' : 'rename / re-group']),
  posted_delete: (a) => join([txt(a.label), txt(a.ref), txt(a.branch)]),
  transit_move: (a, cr) => join([txt(a.party), a.kind === 'overpaid' ? txt(a.billVno) : txt(a.vno), amt(a.amount, cr)]),
  bill_settle: (a, cr) => join([txt(a.party), txt(a.vno), amt(a.amount, cr)]),
  door_l2: labelled, door_l3: labelled, door_l4: labelled,
  party_bank: (a) => join([txt(a.name), txt(a.branch)]),
  credit_limit: party, funds_release: party, counterparty: party, investment: party,
  master: (a) => join([txt(a.target), txt(a.detail)]) || join([txt((a.data as After | undefined)?.name), txt(a.entity), txt(a.op)]),
  hr: (a) => join([txt(a.subject), txt(a.kind)]),
  hr_attendance_change: (a) => join([txt(a.name), txt(a.day), txt(a.reason)]),
  hr_salary: (a) => join([txt(a.name), txt(a.month)]),
  hr_change: (a) => join([txt(a.label), txt(a.subject)]),
  hub_fx: (a, cr) => join([a.kind === 'transfer' ? 'FX Transfer' : 'FX Realized', txt(a.month), amt(Math.abs(Number(a.amount) || 0), cr)]),
  target_budget: (a, cr) => join([txt(a.metric), txt(a.period), amt(a.amount, cr)]),
  period_lock: (a) => join([txt(a.period), txt(a.status), txt(a.reason)]),
  user_limit: (a) => join([txt(a.email), num(a.value)]),
  flag: (a) => (Array.isArray(a.changes) ? (a.changes as After[]).map((c) => txt(c.label) || txt(c.key)).filter(Boolean).join(' · ') : ''),
};
function genericSubject(a: After): string {
  return join(Object.entries(a).filter(([k, v]) => k !== 'branch' && k !== 'kind' && (txt(v) || num(v))).slice(0, 3).map(([, v]) => txt(v) || num(v)));
}
/** One line saying what a request is about — the ERP's requestSubject; '' when the payload says nothing. */
export function requestSubject(cr: Req): string {
  const a = afterOf(cr);
  if (!a) return '';
  return SUBJECT[cr.type]?.(a, cr) || genericSubject(a);
}

export interface RequestChange { label: string; from: string; to: string }
const str = (v: unknown): string => (v == null ? '' : typeof v === 'string' ? v.trim() : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
const fromChanges = (a: After): RequestChange[] => (Array.isArray(a.changes) ? a.changes as After[] : [])
  .map((c) => ({ label: txt(c.label) || txt(c.field) || txt(c.key) || '—', from: str(c.from), to: str(c.to) || '(cleared)' }));

/** The lines that say what changes. The new bank details and the raw `apply` of an access change are never read. */
export function requestChanges(cr: Req): RequestChange[] {
  const a = afterOf(cr);
  if (!a) return [];
  if (cr.type === 'posted_delete') return [{ label: txt(a.label) || 'Off the books', from: txt(a.ref) || '—', to: '(reversed out — kept view-only)' }, { label: 'Why', from: '', to: txt(a.reason) || '—' }];
  if (cr.type === 'transit_move') return [{ label: 'Journal', from: '', to: `Dr ${txt(a.party) || 'client'} / Cr transit ledger${amt(a.amount, cr) ? ` · ${amt(a.amount, cr)}` : ''}` }];
  return ['door_l2', 'door_l3', 'door_l4', 'access_change', 'branch_change', 'ledger_change', 'hr_change', 'party_bank', 'flag'].includes(cr.type) ? fromChanges(a) : [];
}

/** "Off the books (posted) — Delete a posted voucher · HRV/BOM/MHUB/26/1038": what a confirm must name. */
export function requestHeadline(cr: Req): string {
  const s = requestSubject(cr);
  return s ? `${requestTypeLabel(cr.type)} — ${s}` : requestTypeLabel(cr.type);
}

// ── Whose turn it is ──
/** The chain level a signed-in role holds, by the ERP's canonical names. */
export function chainRoleOf(role: string | undefined): string {
  const r = String(role || '').trim();
  if (/^(owner|super\s*_?admin)$/i.test(r)) return 'Owner';
  if (/^director$/i.test(r)) return 'Director';
  if (/^finance\s*_?manager$/i.test(r) || r === 'FinanceManager') return 'FinanceManager';
  // The Branch / General Manager signs first on Requests and CFM since 2026-10-29 (the ERP's BranchManager level).
  if (/^(branch|general)\s*_?manager$/i.test(r) || r === 'BranchManager' || /^(bm|gm)$/i.test(r)) return 'BranchManager';
  if (/^branch\s*_?accountant$/i.test(r) || r === 'BranchAccountant') return 'BranchAccountant';
  if (/^(sr\.?\s*)?accounts\s*_?executive$/i.test(r) || r === 'AccountsExecutive') return 'AccountsExecutive';
  return r;
}

const levelsOf = (cr: Pick<Req, 'chain'>): Level[] => [...(cr.chain ?? [])].sort((a, b) => (a.order || 0) - (b.order || 0));
const signedOf = (cr: Pick<Req, 'approvals'>): Set<string> => new Set((cr.approvals ?? []).map((a) => a.role));
const lc = (s: string | undefined): string => String(s || '').trim().toLowerCase();
const makerRoleOf = (cr: Pick<Req, 'maker'>): string => chainRoleOf(cr.maker?.role);
const isOwn = (cr: Pick<Req, 'maker'>, me: Me): boolean => !!lc(cr.maker?.userId) && lc(cr.maker?.userId) === lc(me.email);

function makerSignsOwnPayment(cr: Req): boolean {
  if (cr.type !== PAYMENT || makerRoleOf(cr) !== 'FinanceManager') return false;
  const levels = levelsOf(cr);
  return levels.length > 0 && levels[levels.length - 1].role === 'FinanceManager';
}
function directorFinal(cr: Pick<Req, 'chain'>): boolean {
  const levels = levelsOf(cr);
  return levels.length > 0 && levels[levels.length - 1].role === 'Director' && !levels.some((l) => l.role === 'Owner');
}

/** The roles a request waits on. An ordered chain waits on ONE: the first unsigned level its maker does not hold. */
export function waitingRoles(cr: Pick<Req, 'type' | 'chain' | 'approvals' | 'maker'>): string[] {
  const signed = signedOf(cr);
  const unsigned = levelsOf(cr).map((l) => l.role).filter((r) => !signed.has(r));
  if (ORDERED_TYPES.has(cr.type)) {
    const maker = makerSignsOwnPayment(cr as Req) ? '' : makerRoleOf(cr);
    if (OVERRIDE_TYPES.has(cr.type) && directorFinal(cr) && unsigned[0] === 'Director' && maker === 'Director') return ['Owner'];
    const next = unsigned.find((r) => r !== maker);
    if (!next && unsigned.length && unsigned[0] === maker && maker !== 'Owner') return ['Owner'];
    return next ? [next] : unsigned.slice(0, 1);
  }
  const makerRole = String(cr.maker?.role || '');
  if (DECISION_TYPES.has(cr.type) && makerRole && !/^(owner|super\s*_?admin)$/i.test(makerRole) && unsigned.includes(makerRole)) {
    const rest = unsigned.filter((r) => r !== makerRole);
    return rest.includes('Owner') ? rest : [...rest, 'Owner'];
  }
  return unsigned;
}

// Who signs past whom (the ERP's mayPass): the Owner past anyone; the FM past the BA and the Senior Accountant; the Senior
// Accountant past the BA; the Director past nobody.
const SA_ROLES = ['AccountsExecutive', 'Senior Branch Accountant'];
const PASSES: Record<string, string[]> = {
  FinanceManager: ['BranchAccountant', ...SA_ROLES, 'BranchManager', 'GeneralManager'],
  AccountsExecutive: ['BranchAccountant'],
  'Senior Branch Accountant': ['BranchAccountant'],
};
const mayPass = (role: string, level: string): boolean => {
  if (!role || !level || role === level) return false;
  return role === 'Owner' ? level !== 'Owner' : (PASSES[role] ?? []).includes(level);
};
function orderedTurn(cr: Req, role: string): { next: Level | null; allowed: boolean; past: Level[] } {
  const signed = signedOf(cr);
  const levels = levelsOf(cr);
  const makerRole = makerRoleOf(cr);
  const next = levels.find((l) => !signed.has(l.role)) ?? null;
  const no = { next, allowed: false, past: [] as Level[] };
  if (!next || !role || signed.has(role)) return no;
  const at = levels.findIndex((l) => l.role === role);
  const from = levels.indexOf(next);
  if (at >= 0 && at < from) return no;
  const past: Level[] = [];
  for (const l of levels.slice(from, at >= 0 ? at : levels.length)) {
    if (signed.has(l.role)) continue;
    if (l.role === makerRole && makerRole !== role && at >= 0) { past.push(l); continue; }
    if (!mayPass(role, l.role)) { if (at >= 0) return no; break; }
    past.push(l);
  }
  if (at < 0) return past.length ? { next, allowed: true, past } : no;
  return { next, allowed: true, past };
}

// ── Who may act (the ERP's button rules, so nobody is offered what the server refuses) ──
function problemWhy(cr: Req): string {
  const a = afterOf(cr);
  const has = !!a && ((Array.isArray(a.changes) && a.changes.length > 0) || (!!a.flags && typeof a.flags === 'object' && Object.keys(a.flags).length > 0));
  return cr.type === 'flag' && !has ? 'Records no flag values — approving it would switch every control flag off. Reject it and raise the change again.' : '';
}
function ownDecisionWhy(cr: Req, me: Me): string {
  if (!DECISION_TYPES.has(cr.type) || /^(owner|super\s*_?admin)$/i.test(String(me.role || ''))) return '';
  return isOwn(cr, me) ? 'You raised this decision — someone else must approve it.' : '';
}
function ownOrderedWhy(cr: Req, me: Me): string {
  if (cr.type === PAYMENT && chainRoleOf(me.role) === 'Owner' && isOwn(cr, me) && orderedTurn(cr, 'Owner').past.length) {
    return levelsOf(cr).some((l) => l.role === 'Owner')
      ? 'This is your own payment request — the FM and the Director sign it first; you approve it after them.'
      : 'This is your own payment request — the Finance Manager approves it.';
  }
  if (!ORDERED_TYPES.has(cr.type) || chainRoleOf(me.role) === 'Owner') return '';
  if (makerSignsOwnPayment(cr) && chainRoleOf(me.role) === 'FinanceManager') return '';
  return isOwn(cr, me) ? 'You raised this request — someone else must review, confirm and approve it.' : '';
}
function outsideChainWhy(cr: Req, me: Me): string {
  if (!ORDERED_TYPES.has(cr.type) || !me.role) return '';
  const levels = levelsOf(cr);
  const pending = cr.status == null || cr.status === 'pending';
  const mine = chainRoleOf(me.role);
  if (levels.some((l) => l.role === mine)) {
    if (!pending || isOwn(cr, me) || signedOf(cr).has(mine)) return '';
    const t = orderedTurn(cr, mine);
    return t.allowed || !t.next ? '' : `It waits for ${t.next.label || t.next.role} first — you may sign past only a level below your own.`;
  }
  if (!levels.length || (pending && orderedTurn(cr, mine).allowed)) return '';
  const names: Record<string, string> = { BranchAccountant: 'the BA', BranchManager: 'the BM', FinanceManager: 'the FM', Director: 'the Director', Owner: 'the Owner' };
  const who = levels.map((l) => names[l.role] || l.role);
  return `Only ${who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}` : who[0]} act on this request.`;
}
function signedWhy(cr: Req, me: Me, act: 'approve' | 'decline' = 'approve'): string {
  if (!ORDERED_TYPES.has(cr.type) || !me.role) return '';
  const mine = chainRoleOf(me.role);
  if (!signedOf(cr).has(mine)) return '';
  if (act === 'decline' && (mine === 'FinanceManager' || mine === 'Owner') && isOwn(cr, me)) return '';
  const next = waitingRoles(cr)[0];
  const level = levelsOf(cr).find((l) => l.role === next);
  const label = next ? level?.label || next : '';
  return `Your level has signed this request${label ? ` — it now waits for ${label}` : ''}.`;
}

export interface RequestGates {
  /** Why Approve is off, or ''. */
  approve: string;
  /** Why Send back and Reject are off, or ''. */
  decline: string;
  /** Only an ordered chain goes back to its maker. */
  sendBack: boolean;
}
export function requestGates(cr: Req, me: Me): RequestGates {
  const outside = outsideChainWhy(cr, me);
  return {
    approve: problemWhy(cr) || outside || ownDecisionWhy(cr, me) || ownOrderedWhy(cr, me) || signedWhy(cr, me),
    decline: outside || signedWhy(cr, me, 'decline'),
    sendBack: ORDERED_TYPES.has(cr.type),
  };
}

/** Is it waiting on this person's level, and may they sign it? The ERP's "Requests at your step". */
export function myTurnOn(cr: Req, me: Me): boolean {
  return waitingRoles(cr).includes(chainRoleOf(me.role))
    && !(problemWhy(cr) || ownDecisionWhy(cr, me) || ownOrderedWhy(cr, me) || signedWhy(cr, me));
}

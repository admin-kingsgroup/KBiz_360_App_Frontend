import type { ErpCreditLevel, ErpCreditRequest } from '../api/erp';
import { erpText, money } from './erpApprovals';

// Approvals ▸ Credit in the app (owner, 2026-10-13: the ERP signs credit on Approvals ▸ Credit now — "make the button also
// visible on the app"). Pure mirrors of the ERP's own panel (Books masters/supplier-master/creditRequestsPanel.jsx) so a
// row offers what the ERP offers — Review / Confirm / Approve, Send back, Reject, and Re-run / Close for a stuck one — with
// the same words. The ERP works out per row whose turn it is (yourTurn, signPast, mayDecline, canRetry) and decides again
// on every act (CRED-GATE-01/02/03); nothing here decides. Change both together.

const OP_LABEL: Record<string, string> = {
  onboard: 'New bank facility', party_onboard: 'New party on credit', party_terms: 'Credit terms change',
  line_create: 'New credit line', line_update: 'Credit line change',
  hub_line_create: 'New branch credit', hub_line_update: 'Branch credit change',
  line_grace: 'Grace (overdue / limit)',
};

// The ERP's branch registry: the Africa branches keep their books in USD, India's in INR. Only used when a request names
// no currency of its own (the ERP does the same with bookCurrencyOf).
const USD_BRANCH = /^H?(NBO|DAR|FBM|DRC)$/i;
const bookCurrency = (branch?: string): string => (USD_BRANCH.test(String(branch || '').trim()) ? 'USD' : 'INR');

/** A new party on Advance (owner, 2026-10-09): no credit to grant, but it waits for the three steps like any new party. */
const isCashOnboard = (r: ErpCreditRequest): boolean => r.op === 'party_onboard' && r.paymentTerms === 'Advance';

/** "New party on credit", "Credit terms change" … */
export function creditOpLabel(r: ErpCreditRequest): string {
  if (isCashOnboard(r)) return 'New party — Advance, no credit';
  return OP_LABEL[String(r.op || '')] || erpText(r.kind) || erpText(r.op) || 'Credit';
}

/** "Limit $2,500 · 7 days" — a 0 limit is a line with no sanctioned amount, not a limit of nothing. */
function terms(limit: number | null | undefined, days: number | null | undefined, ccy: string): string {
  const l = limit == null ? '' : Number(limit) > 0 ? `Limit ${money(Number(limit), ccy)}` : 'No limit set';
  return [l, days ? `${days} days` : ''].filter(Boolean).join(' · ');
}

/** What is asked, against what stands: "Limit $2,000 · 15 days → Limit $2,000 · 30 days". `from` is empty for a new one. */
export function creditAsked(r: ErpCreditRequest): { from: string; to: string; warn: string } {
  if (isCashOnboard(r)) return { from: '', to: 'Advance — no credit', warn: '' };
  const ccy = r.currency || bookCurrency(r.branch);
  if (r.op === 'line_grace' && r.grace) {
    const g = r.grace;
    const extra = `Grace${g.days ? ` +${g.days} days` : ''}${g.limit ? ` +${money(g.limit, ccy)}` : ''} until ${erpText(g.until)}`;
    return { from: '', to: `${extra} — ${erpText(g.reason)} (line stays ${terms(r.limit, r.creditDays, ccy)})`, warn: '' };
  }
  // A currency change is part of the request — both sides name it.
  const before = r.before || null;
  const ccyMoves = !!(before?.currency && r.currency && before.currency !== r.currency);
  const withCcy = (t: string, c?: string) => (ccyMoves ? [t, c].filter(Boolean).join(' · ') : t);
  const lead = r.reopen ? 'Re-open the line · ' : r.renew ? 'Renew short-term credit · ' : '';
  const to = r.active === false ? 'Close the line' : withCcy(`${lead}${terms(r.limit, r.creditDays, ccy)}`, r.currency);
  const from = before ? withCcy(terms(before.limit ?? before.creditLimit, before.creditDays, before.currency || ccy), before.currency) : '';
  const warn = r.limitCheckOff ? `In ${r.currency} the over-limit check will no longer stop this client’s sales.` : '';
  return { from, to, warn };
}

// 'Review (FM)' → 'Review' (the act) and 'FM' (who).
export const actOf = (label = ''): string => label.replace(/\s*\(.*\)$/, '');
export const whoOf = (label = ''): string => (/\(([^)]+)\)/.exec(label) || [])[1] || label;

/** Signing past these levels, in words: "Director not available", or — the maker's own level, which they may never
 *  sign (CRED-GATE-01) — "FM raised it". */
export function pastWords(past: ErpCreditLevel[] = []): string {
  const raised = past.filter((l) => l.raisedIt).map((l) => whoOf(l.label));
  const away = past.filter((l) => !l.raisedIt).map((l) => whoOf(l.label));
  return [raised.length ? `${raised.join(' & ')} raised it` : '', away.length ? `${away.join(' & ')} not available` : ''].filter(Boolean).join('; ');
}

const asLevel = (w: ErpCreditRequest['waitingFor']): ErpCreditLevel | null =>
  w && typeof w === 'object' ? { role: String(w.role || ''), label: String(w.label || w.role || '') } : null;

/** The level the viewer signs: in turn, the one waiting; signing past, the one after the last skipped. */
export function creditLevelOf(r: ErpCreditRequest): ErpCreditLevel | null {
  if (r.yourTurn) return asLevel(r.waitingFor);
  const past = r.signPast || [];
  if (!past.length) return null;
  const chain = r.chain || [];
  const i = chain.findIndex((l) => l.role === past[past.length - 1].role);
  return i >= 0 && chain[i + 1] ? { role: chain[i + 1].role, label: String(chain[i + 1].label || chain[i + 1].role) } : null;
}

/** Where the row stands: waiting for signatures, or approved — being applied, refused by the apply, or stuck. */
export type CreditState = 'pending' | 'applying' | 'failed' | 'stuck';
export function creditState(r: ErpCreditRequest): CreditState {
  if (r.stuck) return 'stuck';
  if (r.status === 'approved') return erpText(r.applyError) ? 'failed' : 'applying';
  return 'pending';
}

/** The buttons the ERP would accept from this viewer, and the line saying why when Approve is off. */
export function creditButtons(r: ErpCreditRequest): { approve: boolean; decline: boolean; label: string; why: string } {
  if (creditState(r) !== 'pending') return { approve: false, decline: false, label: '', why: '' };
  const past = r.signPast || [];
  const live = !!r.yourTurn || past.length > 0;
  // The FM / Owner may send back or reject a request they raised (owner, 2026-10-01) — never approve it (FM).
  const decline = live || !!r.mayDecline;
  const level = creditLevelOf(r);
  const base = actOf(level ? level.label : (asLevel(r.waitingFor)?.label || 'Approve'));
  return { approve: live, decline, label: past.length ? `${base} — ${pastWords(past)}` : base, why: live ? '' : erpText(r.whyNot) };
}

/** What Approve asks before it goes: the Owner signing past confirms once (the ERP asks no reason of the Owner, owner
 *  2026-10-13); past only the maker's own level confirms; past a level that is not available needs a reason
 *  (CRED-GATE-03); in turn, a confirm. */
export type CreditApproveAsk =
  | { kind: 'confirm'; title: string; body: string; ownerPast: boolean }
  | { kind: 'reason'; title: string; placeholder: string };
export function creditApproveAsk(r: ErpCreditRequest): CreditApproveAsk {
  const past = r.signPast || [];
  const level = creditLevelOf(r);
  const name = erpText(r.name) || erpText(r.counterparty) || 'this request';
  if (past.length && level?.role === 'Owner') {
    const who = past.map((l) => l.label);
    const list = who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}` : who[0];
    return { kind: 'confirm', ownerPast: true, title: 'Approve for every level?', body: `${list} ${who.length > 1 ? 'have' : 'has'} not signed. Your approval signs for ${who.length > 1 ? 'them' : 'it'} — “${name}” is approved at every level.` };
  }
  if (past.length && past.every((l) => l.raisedIt)) {
    return { kind: 'confirm', ownerPast: false, title: `${actOf(level ? level.label : 'Approve')} — ${pastWords(past)}`, body: `“${name}”` };
  }
  if (past.length) {
    return { kind: 'reason', title: `${pastWords(past)} — why?`, placeholder: `It is recorded with your ${actOf(level ? level.label : 'approval').toLowerCase()} of “${name}”.` };
  }
  return { kind: 'confirm', ownerPast: false, title: `${asLevel(r.waitingFor)?.label || 'Approve'}?`, body: `“${name}”` };
}

/** The toast after a signature: "Hotel Mota: Approve (Owner) done (FM & Director skipped)". */
export function creditDoneText(r: ErpCreditRequest): string {
  const past = r.signPast || [];
  const level = creditLevelOf(r);
  return `${erpText(r.name) || 'Credit request'}: ${level ? level.label : 'Approved'} done${past.length ? ` (${past.map((l) => whoOf(l.label)).join(' & ')} skipped)` : ''}`;
}

/** The chain as the ERP draws it — each level ticked once signed; one signed past reads "skipped". */
export function creditSteps(r: ErpCreditRequest): Array<{ label: string; done: boolean; skipped: boolean; now: boolean }> {
  const approvals = r.approvals || [];
  const signed = new Set(approvals.map((a) => a.role));
  const skipped = new Set(approvals.filter((a) => a.skipped).map((a) => a.role));
  const waiting = asLevel(r.waitingFor);
  return (r.chain || []).map((l) => ({
    label: String(l.label || l.role),
    done: signed.has(l.role) && !skipped.has(l.role),
    skipped: skipped.has(l.role),
    now: !!waiting && waiting.role === l.role,
  }));
}

/* THE WHOLE CLIENT (owner, 2026-10-27: "i want all details of client — without knowing the client details how will the owner
   approve … do also on kbiz app ui so that they can approve from app also"). The ERP now sends, on every client / supplier
   request: `contact` (its phone and its Reference), `standing` (its account with us, while it waits) and `details` (its whole
   profile — the master as it is now, or a new party's form — with `missing`, the essentials still blank). Mirrors of the
   ERP's PartyContact / PartyAccount / MissingDetails / PartyDetails (Books creditRequestsPanel.jsx), same words. */

/** "Client" / "Supplier" — '' on a row with no party (a bank / hub line). */
export function creditPartyWord(r: ErpCreditRequest): string {
  return r.contact ? (r.contact.party === 'supplier' ? 'Supplier' : 'Client') : '';
}
const blankWhere = (r: ErpCreditRequest): string =>
  r.op === 'party_onboard' || r.details?.from === 'form' ? 'not given on the form' : `not on the ${(creditPartyWord(r) || 'party').toLowerCase()} master`;

export interface CreditContactLine { label: string; value: string; phone: string; warn: string }
/** Who to call: the Reference (code · name, its phone) and the party's own contact (person, its phone — else its email).
 *  A blank one says so in `warn` ("not on the client master"), never hidden. [] on a row with no party. */
export function creditContactLines(r: ErpCreditRequest): CreditContactLine[] {
  const c = r.contact;
  if (!c) return [];
  const missing = blankWhere(r);
  const ref = c.reference;
  const refLine: CreditContactLine = ref
    ? { label: 'Reference', value: [erpText(ref.code), erpText(ref.name)].filter(Boolean).join(' · '), phone: erpText(ref.phone), warn: ref.phone ? '' : 'no phone' }
    : { label: 'Reference', value: '', phone: '', warn: missing };
  const phone = erpText(c.phone);
  const person = erpText(c.person);
  const email = erpText(c.email);
  const party: CreditContactLine = phone || email
    ? { label: `${creditPartyWord(r)} contact`, value: phone ? person : [email, person].filter(Boolean).join(' · '), phone, warn: '' }
    : { label: `${creditPartyWord(r)} contact`, value: person, phone: '', warn: person ? 'no phone' : missing };
  return [refLine, party];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-10-03' → '3 Oct 2026' — the same on every phone, whatever its locale. */
export function isoDay(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] || m[2]} ${m[1]}` : erpText(iso);
}

export type CreditAccountTone = 'strong' | 'danger' | 'good' | 'plain';
/** Its account with us, in pieces with a tone each — owes, overdue (red when any), waiting to post, its line and room, a
 *  hold (red), the last 12 months billed / paid, its last receipt. A supplier reads the other way round. [] with no `standing`. */
export function creditAccount(r: ErpCreditRequest): Array<{ text: string; tone: CreditAccountTone }> {
  const s = r.standing;
  if (!s) return [];
  const supplier = r.contact?.party === 'supplier';
  const m = (n?: number) => money(Number(n) || 0, s.currency || bookCurrency(r.branch));
  const owes = Number(s.owes) || 0;
  const out: Array<{ text: string; tone: CreditAccountTone }> = [{
    text: owes > 0 ? `${supplier ? 'Advance with them' : 'Owes'} ${m(owes)}` : owes < 0 ? `${supplier ? 'We owe' : 'Paid ahead'} ${m(-owes)}` : 'Owes nothing',
    tone: 'strong',
  }];
  const od = s.overdue;
  if (od) {
    const n = Number(od.count) || 0;
    const d = Number(od.oldestDays) || 0;
    out.push(Number(od.amount) > 0
      ? { text: `Overdue ${m(od.amount)} (${n} bill${n === 1 ? '' : 's'}, oldest ${d} day${d === 1 ? '' : 's'} late)`, tone: 'danger' }
      : { text: 'Nothing overdue', tone: 'good' });
  }
  if (Number(s.waiting) > 0) out.push({ text: `${m(s.waiting)} waiting to post`, tone: 'plain' });
  if (s.onCredit) out.push({ text: `On a line of ${m(s.limit)} · room ${m(s.available)}`, tone: 'plain' });
  if (s.held) out.push({ text: 'On credit hold', tone: 'danger' });
  out.push({ text: `${supplier ? 'Their bills' : 'Billed'} ${m(s.billed)} · ${supplier ? 'paid' : 'received'} ${m(s.paid)} in 12 months`, tone: 'plain' });
  out.push({ text: s.lastPaid ? `Last ${supplier ? 'payment' : 'receipt'} ${isoDay(s.lastPaid)}` : `No ${supplier ? 'payment' : 'receipt'} in 12 months`, tone: 'plain' });
  return out;
}

/** "Phone, Email, Address, Reference — not on the client master" — '' when nothing essential is blank. */
export function creditMissing(r: ErpCreditRequest): string {
  const miss = (r.details?.missing || []).map(erpText).filter(Boolean);
  return miss.length ? `${miss.join(', ')} — ${blankWhere(r)}` : '';
}

/* ONE PLACE FOR THE CLIENT (owner, 2026-10-30: "client details showing twice — remove the client details from top one, below
   all detail is fine"). While the details box shows, the Reference / contact lines above it are left out and who to call moves
   into the box: its Phone is a tap to dial, and its Reference row carries the Reference's own phone (the ERP sends it on
   `contact`, not in the box). */
export interface CreditBoxRow { key: string; label: string; value: string; phone: string }
export function creditBoxRows(r: ErpCreditRequest): CreditBoxRow[] {
  const refPhone = erpText(r.contact?.reference?.phone);
  return (r.details?.fields ?? []).map((f) => {
    const value = erpText(f.value);
    const phone = f.key === 'phone' ? value : f.key === 'referenceCode' && refPhone && !value.includes(refPhone) ? refPhone : '';
    return { key: String(f.key), label: erpText(f.label), value: f.key === 'phone' ? '' : value, phone };
  });
}

/** The details box's heading: "Client details — from the client master, as it is now" / "… — as submitted on the form". */
export function creditDetailsTitle(r: ErpCreditRequest): string {
  const w = creditPartyWord(r) || 'Party';
  return `${w} details — ${r.details?.from === 'master' ? `from the ${w.toLowerCase()} master, as it is now` : 'as submitted on the form'}`;
}

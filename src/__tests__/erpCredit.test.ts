import type { ErpCreditRequest } from '../api/erp';
import { creditApproveAsk, creditAsked, creditButtons, creditDoneText, creditLevelOf, creditOpLabel, creditState, creditSteps, pastWords } from '../logic/erpCredit';

// Approvals ▸ Credit in the app (owner, 2026-10-13) signs credit as the ERP's Approvals ▸ Credit does (Books
// creditRequestsPanel.jsx). These pin the mirror: which buttons a row offers, their words, and what Approve asks.

const CHAIN = [
  { role: 'FinanceManager', label: 'Review (FM)' }, { role: 'Director', label: 'Confirm (Director)' }, { role: 'Owner', label: 'Approve (Owner)' },
];
const row = (over: Partial<ErpCreditRequest> = {}): ErpCreditRequest => ({
  id: 'c1', status: 'pending', op: 'party_onboard', kind: 'Supplier credit', branch: 'HFBM', name: 'Hotel Mota', currency: 'USD',
  limit: 2500, creditDays: 7, maker: { name: 'accounts.drc@travkings.com' }, chain: CHAIN,
  approvals: [{ role: 'FinanceManager', by: 'fm@kb.test' }], waitingFor: { role: 'Director', label: 'Confirm (Director)' },
  yourTurn: false, signPast: [], mayDecline: false, whyNot: 'Waiting for Confirm (Director).',
  ...over,
});
const OWNER_PAST = { signPast: [{ role: 'Director', label: 'Confirm (Director)' }] };

describe('what a credit row says', () => {
  it('a new party: its terms; a terms change: what stands → what is asked', () => {
    expect(creditOpLabel(row())).toBe('New party on credit');
    expect(creditAsked(row())).toEqual({ from: '', to: 'Limit $2,500 · 7 days', warn: '' });
    const change = row({ op: 'party_terms', limit: 7000, creditDays: 30, before: { creditLimit: 7000, creditDays: 15 } });
    expect(creditOpLabel(change)).toBe('Credit terms change');
    expect(creditAsked(change)).toMatchObject({ from: 'Limit $7,000 · 15 days', to: 'Limit $7,000 · 30 days' });
  });
  it('no currency on the request → the branch’s books (Africa $, India ₹)', () => {
    expect(creditAsked(row({ currency: '', branch: 'HNBO' })).to).toBe('Limit $2,500 · 7 days');
    expect(creditAsked(row({ currency: '', branch: 'BOM', limit: 150000 })).to).toBe('Limit ₹1,50,000 · 7 days');
  });
  it('a 0 limit, a closing line and a cash on-boarding say so in words', () => {
    expect(creditAsked(row({ limit: 0, creditDays: null })).to).toBe('No limit set');
    expect(creditAsked(row({ op: 'party_terms', active: false })).to).toBe('Close the line');
    expect(creditAsked(row({ paymentTerms: 'Advance' })).to).toBe('Advance — no credit');
  });
  it('the steps: signed ticked, skipped marked, the waiting one flagged', () => {
    const s = creditSteps(row({ approvals: [{ role: 'FinanceManager', skipped: true }], waitingFor: { role: 'Director', label: 'Confirm (Director)' } }));
    expect(s.map((x) => [x.done, x.skipped, x.now])).toEqual([[false, true, false], [false, false, true], [false, false, false]]);
  });
});

describe('the buttons — only what the ERP would accept', () => {
  it('not your turn: no buttons, the ERP’s why', () => {
    expect(creditButtons(row())).toEqual({ approve: false, decline: false, label: 'Confirm', why: 'Waiting for Confirm (Director).' });
  });
  it('your turn: the level’s own verb, with Send back and Reject', () => {
    const b = creditButtons(row({ yourTurn: true, whyNot: '' }));
    expect(b).toMatchObject({ approve: true, decline: true, label: 'Confirm', why: '' });
  });
  it('the Owner past an unsigned Director: “Approve — Director not available” (the ERP screen’s words)', () => {
    const r = row(OWNER_PAST);
    expect(creditLevelOf(r)).toEqual({ role: 'Owner', label: 'Approve (Owner)' });
    expect(creditButtons(r)).toMatchObject({ approve: true, decline: true, label: 'Approve — Director not available' });
  });
  it('a maker who may only decline their own: Send back / Reject, no Approve', () => {
    expect(creditButtons(row({ mayDecline: true, whyNot: 'You submitted this request — you may send it back or reject it; someone else must approve it.' })))
      .toMatchObject({ approve: false, decline: true });
  });
  it('approved rows carry no sign buttons — being applied, failed, or stuck', () => {
    expect(creditState(row({ status: 'approved' }))).toBe('applying');
    expect(creditState(row({ status: 'approved', applyError: 'exists' }))).toBe('failed');
    expect(creditState(row({ status: 'approved', stuck: true, canRetry: true }))).toBe('stuck');
    expect(creditButtons(row({ status: 'approved', stuck: true, yourTurn: true }))).toMatchObject({ approve: false, decline: false });
  });
});

describe('what Approve asks first', () => {
  it('the Owner signing past: one confirm, no reason', () => {
    expect(creditApproveAsk(row(OWNER_PAST))).toMatchObject({ kind: 'confirm', ownerPast: true, title: 'Approve for every level?' });
  });
  it('the Director past an FM who is not available: a reason (CRED-GATE-03)', () => {
    const r = row({ approvals: [], waitingFor: { role: 'FinanceManager', label: 'Review (FM)' }, signPast: [{ role: 'FinanceManager', label: 'Review (FM)' }] });
    expect(creditApproveAsk(r)).toMatchObject({ kind: 'reason', title: 'FM not available — why?' });
  });
  it('past only the maker’s own level: a confirm, no reason', () => {
    const r = row({ approvals: [], signPast: [{ role: 'FinanceManager', label: 'Review (FM)', raisedIt: true }] });
    expect(pastWords(r.signPast)).toBe('FM raised it');
    expect(creditApproveAsk(r)).toMatchObject({ kind: 'confirm', ownerPast: false, title: 'Confirm — FM raised it' });
  });
  it('in turn: a plain confirm; the toast names the level and who was skipped', () => {
    expect(creditApproveAsk(row({ yourTurn: true }))).toMatchObject({ kind: 'confirm', ownerPast: false, title: 'Confirm (Director)?' });
    expect(creditDoneText(row(OWNER_PAST))).toBe('Hotel Mota: Approve (Owner) done (Director skipped)');
  });
});

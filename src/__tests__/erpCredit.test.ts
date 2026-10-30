import type { ErpCreditRequest } from '../api/erp';
import { creditAccount, creditApproveAsk, creditAsked, creditBoxRows, creditButtons, creditContactLines, creditDetailsTitle, creditDoneText, creditLevelOf, creditMissing, creditOpLabel, creditPartyWord, creditState, creditSteps, isoDay, pastWords } from '../logic/erpCredit';

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

// THE WHOLE CLIENT (owner, 2026-10-27: "i want all details of client … do also on kbiz app ui so that they can approve from app
// also"): the same words the ERP's Approvals ▸ Credit row uses — who to call, the account with us, what the master lacks.
describe('the whole client on a credit card', () => {
  const jbj = (over: Partial<ErpCreditRequest> = {}): ErpCreditRequest => row({
    op: 'party_terms', kind: 'Client credit', name: 'JBJ RESOURCES LTD', branch: 'HDAR', limit: 10803, creditDays: 7,
    contact: { party: 'client', phone: '', person: '', email: '', reference: null },
    details: { from: 'master', missing: ['Phone', 'Email', 'Address', 'Reference'], fields: [{ key: 'customerType', label: 'Customer Type', value: 'B2E' }] },
    standing: { currency: 'USD', owes: 10803, billed: 52000, paid: 41197, lastPaid: '2026-10-03', onCredit: false, waiting: 700, overdue: { amount: 4200, count: 3, oldestDays: 45 } },
    ...over,
  });

  it('a blank master: the Reference and the client contact both say they are not on the master', () => {
    expect(creditContactLines(jbj())).toEqual([
      { label: 'Reference', value: '', phone: '', warn: 'not on the client master' },
      { label: 'Client contact', value: '', phone: '', warn: 'not on the client master' },
    ]);
    expect(creditMissing(jbj())).toBe('Phone, Email, Address, Reference — not on the client master');
    expect(creditDetailsTitle(jbj())).toBe('Client details — from the client master, as it is now');
  });

  it('a full one: Reference code · name with its phone; the client’s person with its phone; a supplier says Supplier', () => {
    const full = jbj({ contact: { party: 'client', phone: '+255 22 000 111', person: 'Joseph B', email: 'ap@jbj.test',
      reference: { code: 'RFCHDAR001', name: 'Fauzia Kitenge', phone: '+255 791 211 980' } }, details: { from: 'master', missing: [], fields: [] } });
    expect(creditContactLines(full)).toEqual([
      { label: 'Reference', value: 'RFCHDAR001 · Fauzia Kitenge', phone: '+255 791 211 980', warn: '' },
      { label: 'Client contact', value: 'Joseph B', phone: '+255 22 000 111', warn: '' },
    ]);
    expect(creditMissing(full)).toBe('');
    const sup = jbj({ contact: { party: 'supplier', phone: '', person: 'Ravi', email: '', reference: { code: 'RFCBOM002', name: 'Asif Khan', phone: '' } } });
    expect(creditContactLines(sup)).toEqual([
      { label: 'Reference', value: 'RFCBOM002 · Asif Khan', phone: '', warn: 'no phone' },
      { label: 'Supplier contact', value: 'Ravi', phone: '', warn: 'no phone' },
    ]);
    expect(creditContactLines(jbj({ contact: { party: 'client', phone: '', person: '', email: 'ar@x.test', reference: null } }))[1]).toMatchObject({ value: 'ar@x.test', warn: '' });
  });

  // Owner, 2026-10-30 (Mr Didier · HFBM): "client details showing twice — remove the client details from top one". While the
  // box shows, who to call lives in it: Phone a tap to dial, the Reference row with the Reference's phone.
  it('the details box carries who to call: Phone dials, Reference carries its person’s phone', () => {
    const didier = jbj({ op: 'party_onboard', name: 'Mr Didier', branch: 'HFBM',
      contact: { party: 'client', phone: '+243 977 556 636', person: '', email: 'didier@gmail.com', reference: { code: 'RFCHFBM003', name: 'Uday Pandya', phone: '+243 821 369 555' } },
      details: { from: 'form', missing: [], fields: [
        { key: 'customerType', label: 'Customer Type', value: 'B2C Reference' },
        { key: 'referenceCode', label: 'Reference', value: 'RFCHFBM003 · Uday Pandya' },
        { key: 'phone', label: 'Phone', value: '+243 977 556 636' },
        { key: 'email', label: 'Email', value: 'didier@gmail.com' },
      ] } });
    expect(creditBoxRows(didier)).toEqual([
      { key: 'customerType', label: 'Customer Type', value: 'B2C Reference', phone: '' },
      { key: 'referenceCode', label: 'Reference', value: 'RFCHFBM003 · Uday Pandya', phone: '+243 821 369 555' },
      { key: 'phone', label: 'Phone', value: '', phone: '+243 977 556 636' },
      { key: 'email', label: 'Email', value: 'didier@gmail.com', phone: '' },
    ]);
    // A Reference with no phone, or none at all: nothing added.
    expect(creditBoxRows(jbj())).toEqual([{ key: 'customerType', label: 'Customer Type', value: 'B2E', phone: '' }]);
    expect(creditBoxRows(jbj({ details: null }))).toEqual([]);
  });

  it('the account: owes, overdue in red, waiting, 12 months billed / received, last receipt — in the books’ currency', () => {
    expect(creditAccount(jbj())).toEqual([
      { text: 'Owes $10,803', tone: 'strong' },
      { text: 'Overdue $4,200 (3 bills, oldest 45 days late)', tone: 'danger' },
      { text: '$700 waiting to post', tone: 'plain' },
      { text: 'Billed $52,000 · received $41,197 in 12 months', tone: 'plain' },
      { text: 'Last receipt 3 Oct 2026', tone: 'plain' },
    ]);
  });

  it('on a CFM line: the line and its room, a hold in red, nothing overdue in green; no receipt said', () => {
    const texts = creditAccount(jbj({ standing: { currency: 'USD', owes: 500, billed: 0, paid: 0, lastPaid: '', onCredit: true, limit: 5000, available: 4500, held: true, waiting: 0, overdue: { amount: 0, count: 0, oldestDays: 0 } } }));
    expect(texts.map((t) => t.text)).toEqual(['Owes $500', 'Nothing overdue', 'On a line of $5,000 · room $4,500', 'On credit hold', 'Billed $0 · received $0 in 12 months', 'No receipt in 12 months']);
    expect(texts.find((t) => t.text === 'On credit hold')?.tone).toBe('danger');
    expect(texts.find((t) => t.text === 'Nothing overdue')?.tone).toBe('good');
  });

  it('a supplier reads the other way round; a client paid ahead says so; no standing → nothing', () => {
    const sup = jbj({ branch: 'MHUB', contact: { party: 'supplier' }, standing: { currency: 'INR', owes: -9000, billed: 29000, paid: 20000, lastPaid: '' } });
    expect(creditAccount(sup).map((t) => t.text)).toEqual(['We owe ₹9,000', 'Their bills ₹29,000 · paid ₹20,000 in 12 months', 'No payment in 12 months']);
    expect(creditAccount(jbj({ standing: { currency: 'USD', owes: -250, billed: 0, paid: 250 } }))[0].text).toBe('Paid ahead $250');
    expect(creditAccount(jbj({ standing: null }))).toEqual([]);
  });

  it('a new party: blanks are "not given on the form"; a bank line has no contact lines', () => {
    const onboard = jbj({ op: 'party_onboard', standing: null, details: { from: 'form', missing: ['Reference'], fields: [] } });
    expect(creditMissing(onboard)).toBe('Reference — not given on the form');
    expect(creditDetailsTitle(onboard)).toBe('Client details — as submitted on the form');
    expect(creditContactLines(jbj({ op: 'line_create', contact: null }))).toEqual([]);
    expect(creditPartyWord(jbj({ contact: null }))).toBe('');
  });

  it('isoDay reads the same on every phone', () => {
    expect(isoDay('2026-01-09')).toBe('9 Jan 2026');
    expect(isoDay('')).toBe('');
  });
});

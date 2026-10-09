import type { ErpChangeRequest } from '../api/erp';
import {
  atFocus, chainRoleOf, chainSteps, isHrRequest, isPaymentRequest, isStuck, lastSigner, mayReapply, outsideChainWhy, ownRequestWhy,
  paymentDetailRows, paymentState, paymentSubject, recentSubject, signPastLevels, signedWhy, waitingLabel,
} from '../logic/erpPayables';

// Approvals ▸ Payables in the app (owner, 2026-10-09) mirrors the ERP's own rules (Books tk-group/utils
// changeRequests.js + inbox.js). These pin the mirror: what each person is offered, and what a row says.

const CHAIN = [
  { order: 1, role: 'FinanceManager', label: 'Review (FM)' },
  { order: 2, role: 'Director', label: 'Confirm (Director)' },
  { order: 3, role: 'Owner', label: 'Approve (Owner)' },
];
const cr = (over: Partial<ErpChangeRequest> = {}): ErpChangeRequest => ({
  _id: 'p1', type: 'payment_request', branch: 'BOM', status: 'pending', bookCurrency: 'INR', chain: CHAIN, approvals: [],
  maker: { userId: 'ae@kb.test', name: 'Test Raiser', role: 'Accounts Executive' },
  payload: { after: { kind: 'bills', party: 'Air Supplier', amount: 120000, payOn: '2026-10-12', bank: 'HDFC', bills: [
    { billVno: 'PUR/BOM/26/0001', supplierRef: 'INV-9', dueOn: '2026-10-10', outstanding: 80000, amount: 80000 },
    { billVno: 'PUR/BOM/26/0002', dueOn: '2026-10-11', outstanding: 50000, amount: 40000 },
  ], books: { closing: 130000, openBills: 130000 } } },
  ...over,
});
const FM = { role: 'FinanceManager', email: 'fm@kb.test' };
const DIR = { role: 'Director', email: 'dir@kb.test' };
const OWNER = { role: 'Super Admin', email: 'owner@kb.test' };
const AE = { role: 'Accounts Executive', email: 'ae@kb.test' };

describe('which tab a request belongs to', () => {
  it('payment requests go to Payables, hr_* to HR, the rest to Requests', () => {
    expect(isPaymentRequest({ type: 'payment_request' })).toBe(true);
    expect(isPaymentRequest({ type: 'hub_fx' })).toBe(false);
    expect(isHrRequest({ type: 'hr_change' })).toBe(true);
    expect(isHrRequest({ type: 'payment_request' })).toBe(false);
  });
  it('a branch focus shows its own rows and the group-wide ones; ALL shows all', () => {
    const rows = [{ branch: 'BOM' }, { branch: 'NBO' }, { branch: '' }];
    expect(atFocus(rows, 'BOM')).toEqual([{ branch: 'BOM' }, { branch: '' }]);
    expect(atFocus(rows, 'ALL')).toHaveLength(3);
  });
});

describe('the chain and whose turn it is', () => {
  it('ticks and the next level by its ERP name', () => {
    const one = cr({ approvals: [{ role: 'FinanceManager', by: 'fm@kb.test' }] });
    expect(chainSteps(one)).toEqual([{ label: 'Review (FM)', done: true }, { label: 'Confirm (Director)', done: false }, { label: 'Approve (Owner)', done: false }]);
    expect(waitingLabel(one)).toBe('Confirm (Director)');
    expect(waitingLabel(cr({ approvals: CHAIN.map((l) => ({ role: l.role })) }))).toBe('');
  });
  it('Super Admin signs at the Owner level', () => {
    expect(chainRoleOf('Super Admin')).toBe('Owner');
    expect(chainRoleOf('Finance Manager')).toBe('FinanceManager');
  });
});

describe('what each person is offered — the ERP refuses the rest', () => {
  it('a role outside the chain gets no buttons, and is told who acts', () => {
    expect(outsideChainWhy(cr(), AE)).toBe('Only the FM, the Director and the Owner act on this request.');
    expect(outsideChainWhy(cr(), FM)).toBe('');
  });
  it('the maker never approves their own — except the Owner', () => {
    const mine = cr({ maker: { userId: 'fm@kb.test', name: 'FM', role: 'FinanceManager' } });
    expect(ownRequestWhy(mine, FM)).toMatch(/You raised this request/);
    expect(ownRequestWhy(cr({ maker: { userId: 'owner@kb.test', role: 'Owner' } }), OWNER)).toBe('');
    expect(ownRequestWhy(cr(), FM)).toBe('');
  });
  it('a level never signs twice; the FM who raised it may still decline', () => {
    const signedByFm = cr({ approvals: [{ role: 'FinanceManager', by: 'fm@kb.test' }] });
    expect(signedWhy(signedByFm, FM)).toBe('Your level has signed this request — it now waits for Confirm (Director).');
    expect(signedWhy(signedByFm, FM, 'decline')).toMatch(/Your level has signed/);
    const raisedAndSigned = cr({ maker: { userId: 'fm@kb.test', role: 'FinanceManager' }, approvals: [{ role: 'FinanceManager' }] });
    expect(signedWhy(raisedAndSigned, FM, 'decline')).toBe('');
    expect(signedWhy(cr(), DIR)).toBe('');
  });
  it('signing past an unsigned level needs a reason — named by level; none in turn', () => {
    expect(signPastLevels(cr(), 'Super Admin')).toEqual(['Review (FM)', 'Confirm (Director)']);
    expect(signPastLevels(cr(), 'Director')).toEqual(['Review (FM)']);
    expect(signPastLevels(cr(), 'FinanceManager')).toEqual([]);
    expect(signPastLevels(cr({ approvals: [{ role: 'FinanceManager' }, { role: 'Director' }] }), 'Owner')).toEqual([]);
    // The maker's own level is left out — they may never sign it.
    expect(signPastLevels(cr({ maker: { userId: 'fm@kb.test', role: 'FinanceManager' } }), 'Director')).toEqual([]);
  });
  it('Re-run / Close are the Owner\'s or Super Admin\'s only', () => {
    expect(mayReapply('Owner')).toBe(true);
    expect(mayReapply('Super Admin')).toBe(true);
    expect(mayReapply('Director')).toBe(false);
  });
  it('approved with nothing applied is stuck; applied is not', () => {
    expect(isStuck({ status: 'approved', appliedAt: null })).toBe(true);
    expect(isStuck({ status: 'approved', appliedAt: '2026-10-09T05:00:00Z' })).toBe(false);
    expect(isStuck({ status: 'pending' })).toBe(false);
  });
});

describe('what a payment request says', () => {
  const after = cr().payload!.after as Parameters<typeof paymentSubject>[0];
  it('subject: who, how much in the branch currency, when, for what', () => {
    expect(paymentSubject(after, 'INR')).toBe('Air Supplier · ₹1,20,000 · pay 2026-10-12 · 2 bills');
    expect(paymentSubject({ ...after, advance: true, bills: [] }, 'USD')).toBe('Air Supplier · $120,000 · pay 2026-10-12 · advance');
    expect(paymentSubject({ kind: 'head', party: 'Office Rent', amount: 5000, payOn: '2026-10-15', note: 'October rent' }, 'INR')).toBe('Office Rent · ₹5,000 · pay 2026-10-15 · October rent');
  });
  it('rows: each bill (due, left → paid now), the pay day and bank, the books when raised', () => {
    expect(paymentDetailRows(after, 'INR')).toEqual([
      { label: 'PUR/BOM/26/0001 · INV-9', from: 'due 2026-10-10 · left ₹80,000', to: '₹80,000' },
      { label: 'PUR/BOM/26/0002', from: 'due 2026-10-11 · left ₹50,000', to: '₹40,000' },
      { label: 'Pay on', from: '', to: '2026-10-12 · HDFC' },
      { label: 'Books when raised', from: '', to: 'closing ₹1,30,000 · open bills ₹1,30,000 · nothing on account' },
    ]);
  });
  it('any other payee: paid to, amount, pay on, for', () => {
    expect(paymentDetailRows({ kind: 'head', hub: true, party: 'MHUB A/c', amount: 900, payOn: '2026-10-15', bank: 'ICICI', note: 'settle' }, 'INR')).toEqual([
      { label: 'Hub account', from: '', to: 'MHUB A/c' },
      { label: 'Amount', from: '', to: '₹900' },
      { label: 'Pay on', from: '', to: '2026-10-15 · ICICI' },
      { label: 'For', from: '', to: 'settle' },
    ]);
  });
});

describe('recently approved — where each went', () => {
  it('paid, entered, or not paid yet', () => {
    expect(paymentState({ payment: { id: 'v', vno: 'PMT/BOM/26/0001', posted: true } })).toMatchObject({ word: 'Paid', tone: 'success' });
    expect(paymentState({ payment: { id: 'v', vno: 'PMT/BOM/26/0001', posted: false } })).toMatchObject({ word: 'Entered', note: 'not posted yet' });
    expect(paymentState({ payment: null })).toMatchObject({ word: 'Not paid yet', note: 'pay it from the Payment voucher' });
  });
  it('the flat row reads like a pending one; the last signer is named', () => {
    const row = { id: 'r1', branch: 'NBO', bookCurrency: 'USD', status: 'applied', party: 'Lodge', amount: 300, payOn: '2026-10-09', advance: true, approvals: [{ role: 'FinanceManager', by: 'fm@' }, { role: 'Owner', by: 'owner@' }] };
    expect(recentSubject(row)).toBe('Lodge · $300 · pay 2026-10-09 · advance');
    expect(lastSigner(row)).toBe('owner@');
    expect(lastSigner({ approvals: [] })).toBe('');
  });
});

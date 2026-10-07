import type { ErpPendingWork } from '../api/erp';
import { ALL_BRANCHES, actsHere, branchOptions, maySelfApprove, money, nextErpAction, pendingEntries, stageCounts, toEntryDetail, type ErpChain } from '../logic/erpApprovals';

const entry = (id: string, over: Record<string, unknown> = {}) => ({ id, ref: `REF/${id}`, title: 'Party', stage: 'check', kind: 'voucher', type: 'PMT', branch: 'BOM', actionBranch: 'BOM', days: 1, ...over });
const pw: ErpPendingWork = {
  branches: [
    { branch: 'BOM', cards: [{ key: 'approvals', items: [
      { key: 'vouchers', n: 2, entries: [entry('a', { days: 3 }), entry('b', { stage: 'verify', actionBranch: 'MHUB' })] as never },
      { key: 'folders', n: 1, entries: [entry('c', { kind: 'file', type: 'SO/PO/GP', stage: 'approve', days: 9 })] as never },
    ] }, { key: 'recon', items: [{ key: 'x', n: 1, entries: [entry('zz')] as never }] }] },
    { branch: 'MHUB', cards: [{ key: 'approvals', items: [
      { key: 'hub', n: 2, entries: [entry('b', { stage: 'verify', actionBranch: 'MHUB' }), entry('d', { branch: 'MHUB', actionBranch: 'MHUB', stage: 'approve' })] as never },
    ] }] },
  ],
};

describe('pendingEntries', () => {
  it('lists every approvals entry once, oldest wait first, and ignores other cards', () => {
    expect(pendingEntries(pw).map((e) => e.id)).toEqual(['c', 'a', 'b', 'd']);
  });
  it('a branch keeps what is booked there or acted there', () => {
    expect(pendingEntries(pw, 'MHUB').map((e) => e.id)).toEqual(['b', 'd']);
    expect(pendingEntries(pw, 'BOM').map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });
  it('copes with an empty feed', () => {
    expect(pendingEntries(null)).toEqual([]);
    expect(pendingEntries({ branches: [] }, ALL_BRANCHES)).toEqual([]);
  });
  it('stage counts', () => {
    expect(stageCounts(pendingEntries(pw))).toEqual({ check: 1, verify: 1, approve: 2, total: 4 });
  });
});

describe('branches and where one may act', () => {
  it('ALL first for an all-branch login', () => {
    expect(branchOptions({ branches: ['BOM', 'MHUB', 'bom'], allBranches: true })).toEqual(['ALL', 'BOM', 'MHUB']);
    expect(branchOptions({ branches: ['AMD'], allBranches: false })).toEqual(['AMD']);
  });
  it('acts only in an acting branch within scope, never view-only', () => {
    const scoped = { branches: ['BOM'], allBranches: false, viewOnly: false };
    expect(actsHere({ branch: 'BOM', actionBranch: 'BOM' }, scoped)).toBe(true);
    expect(actsHere({ branch: 'BOM', actionBranch: 'MHUB' }, scoped)).toBe(false);
    expect(actsHere({ branch: 'BOM', actionBranch: 'MHUB' }, { branches: [], allBranches: true, viewOnly: false })).toBe(true);
    expect(actsHere({ branch: 'BOM', actionBranch: 'BOM' }, { ...scoped, viewOnly: true })).toBe(false);
  });
});

describe('nextErpAction — mirrors the ERP button rule', () => {
  const chain: ErpChain = { verify: ['sughra@travkings.com'], approve: ['faiz@travkings.com'], director: [], owner: [] };
  const me = (email: string, role = 'Accounts Executive', name = '') => ({ email, role, name, id: 'u1' });
  const d = (over: Record<string, unknown>) => toEntryDetail('voucher', { id: 'v1', vno: 'PMT/BOM/26/0001', type: 'PMT', branch: 'BOM', status: 'pending', ...over });

  it('Check is open to anyone in the branch', () => {
    expect(nextErpAction(d({ reviewStage: 'check' }), me('clerk@travkings.com', 'Branch Accountant'), chain)).toMatchObject({ action: 'check', allowed: true });
  });
  it('Verify: the verify or approve list, or a Super Admin', () => {
    expect(nextErpAction(d({ reviewStage: 'verify' }), me('sughra@travkings.com'), chain).allowed).toBe(true);
    expect(nextErpAction(d({ reviewStage: 'verify' }), me('faiz@travkings.com', 'Finance Manager'), chain).allowed).toBe(true);
    expect(nextErpAction(d({ reviewStage: 'verify' }), me('clerk@travkings.com', 'Branch Accountant'), chain).allowed).toBe(false);
    expect(nextErpAction(d({ reviewStage: 'verify' }), me('boss@travkings.com', 'Super Admin'), chain).allowed).toBe(true);
  });
  it('Approve: the approver, but not the maker unless FM / Owner', () => {
    expect(nextErpAction(d({ reviewStage: 'approve', submittedBy: 'someone@travkings.com' }), me('faiz@travkings.com', 'Senior Accounts Executive'), chain).allowed).toBe(true);
    const ae = nextErpAction(d({ reviewStage: 'approve', submittedBy: 'Faiz Patel' }), me('faiz@travkings.com', 'Accounts Executive', 'Faiz Patel'), chain);
    expect(ae.allowed).toBe(false);
    expect(ae.hint).toMatch(/maker/);
    expect(nextErpAction(d({ reviewStage: 'approve', submittedBy: 'faiz@travkings.com' }), me('faiz@travkings.com', 'Finance Manager'), chain).allowed).toBe(true);
    expect(nextErpAction(d({ reviewStage: 'approve' }), me('sughra@travkings.com'), chain).allowed).toBe(false);
  });
  it('a settled row (no stage) keeps the plain Approve', () => {
    expect(nextErpAction(d({ reviewStage: '' }), me('x@y.z'), chain)).toMatchObject({ action: 'approve', label: 'Approve' });
  });
});

describe('toEntryDetail', () => {
  it('reads a booking folder', () => {
    expect(toEntryDetail('file', { id: 'f1', bookingNo: 'SPGB/BOM/26/0007', module: 'Flight', customer: { name: 'ACME' }, branch: 'BOM', reviewStage: 'verify', approvalNeedsFx: true, createdBy: 'crm:x' }))
      .toMatchObject({ number: 'SPGB/BOM/26/0007', type: 'SO/PO/GP · Flight', party: 'ACME', reviewStage: 'verify', approvalNeedsFx: true, submittedBy: 'crm:x' });
  });
});

describe('helpers', () => {
  it('maySelfApprove', () => {
    expect(maySelfApprove('Finance Manager')).toBe(true);
    expect(maySelfApprove('Super Admin')).toBe(true);
    expect(maySelfApprove('Branch Accountant')).toBe(false);
    expect(maySelfApprove('Director')).toBe(false);
  });
  it('money', () => {
    expect(money(123456, 'INR')).toBe('₹1,23,456');
    expect(money(1234.5, 'USD')).toBe('$1,234.5');
    expect(money(undefined, 'INR')).toBe('');
  });
});

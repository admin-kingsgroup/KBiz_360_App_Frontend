import type { ErpPendingWork } from '../api/erp';
import { ALL_BRANCHES, actsHere, erpText, leaveChainSteps, leaveTags, leaveTurnNote, mayApproveLeaveNow, branchOptions, maySelfApprove, money, nextErpAction, pendingEntries, stageCounts, toEntryDetail, type ErpChain } from '../logic/erpApprovals';

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

describe('erpText — ERP fields are never rendered raw', () => {
  it('reads the label of a { role, label } signer (the Credit tab crash, 2026-10-08)', () => {
    expect(erpText({ role: 'director', label: 'Director' })).toBe('Director');
    expect(erpText({ role: 'owner' })).toBe('owner');
    expect(erpText({ name: 'A. Person' })).toBe('A. Person');
  });
  it('passes text and numbers through, joins arrays, blanks the rest', () => {
    expect(erpText('Finance Manager')).toBe('Finance Manager');
    expect(erpText(30)).toBe('30');
    expect(erpText([{ label: 'FM' }, 'Director'])).toBe('FM, Director');
    expect(erpText(null)).toBe('');
    expect(erpText(undefined)).toBe('');
  });
});

describe('HR approvals: one level at a time (owner, 2026-10-08)', () => {
  const chain = [
    { order: 3, role: 'Owner', label: 'Approve (Owner)' },
    { order: 1, role: 'FinanceManager', label: 'Review (FM)' },
    { order: 2, role: 'Director', label: 'Confirm (Director)' },
  ];

  it('lists the chain in order and ticks each level that signed', () => {
    expect(leaveChainSteps(chain, [])).toEqual([
      { label: 'Review (FM)', done: false }, { label: 'Confirm (Director)', done: false }, { label: 'Approve (Owner)', done: false },
    ]);
    expect(leaveChainSteps(chain, [{ role: 'FinanceManager' }, { role: 'Director' }]).map((s) => s.done)).toEqual([true, true, false]);
  });

  it('a level signed past (skipped) is not a tick', () => {
    expect(leaveChainSteps(chain, [{ role: 'FinanceManager', skipped: true }])[0].done).toBe(false);
  });

  it('the Owner may not approve while FM or Director has not signed', () => {
    expect(mayApproveLeaveNow({ allowed: true, past: ['Review (FM)', 'Confirm (Director)'] })).toBe(false);
    expect(mayApproveLeaveNow({ allowed: true, past: ['Confirm (Director)'] })).toBe(false);
  });

  it('approval opens on the viewer\'s own turn', () => {
    expect(mayApproveLeaveNow({ allowed: true, past: [] })).toBe(true);
    expect(mayApproveLeaveNow({ allowed: true })).toBe(true);
    expect(mayApproveLeaveNow({ allowed: false, why: 'It is not your turn — this leave is waiting for Review (FM).' })).toBe(false);
    expect(mayApproveLeaveNow(undefined)).toBe(false);
  });

  it('keeps the ERP reason except the plain "not your turn" (the red Waiting on says that)', () => {
    expect(leaveTurnNote({ allowed: false, why: 'It is not your turn — this leave is waiting for Review (FM).' })).toBe('');
    expect(leaveTurnNote({ allowed: false, why: 'This is your own leave — the next level signs it.' })).toBe('This is your own leave — the next level signs it.');
    expect(leaveTurnNote({ allowed: true })).toBe('');
  });
});

describe('HR card tags', () => {
  it('a plain leave is paid leave; a half-day one also says Half day', () => {
    expect(leaveTags({ kind: 'leave', dayType: 'full' })).toEqual([{ label: 'Paid leave', tone: 'paid' }]);
    expect(leaveTags({})).toEqual([{ label: 'Paid leave', tone: 'paid' }]);
    expect(leaveTags({ kind: 'leave', dayType: 'half' }).map((t) => t.label)).toEqual(['Half day', 'Paid leave']);
  });

  it('a time correction and a leave cancellation get their own tag', () => {
    expect(leaveTags({ kind: 'time', dayType: 'full' })).toEqual([{ label: 'Time correction', tone: 'time' }]);
    expect(leaveTags({ kind: 'cancel' })).toEqual([{ label: 'Leave cancellation', tone: 'cancel' }]);
  });
});

import type { ErpChangeRequest, ErpCloseRow, ErpConcern, ErpPendingEntry } from '../api/erp';
import {
  APPROVAL_TABS, ENTRY_PILLS, SUBTABS, cellsAtFocus, closeLine, closeStage, closeWaitingOn, closesAt, closesOwed, concernStatus, concernsAt, concernsOn, entriesOnPill, entryPillOf,
  erpConcernCount, erpConcernGroups, holderRows, mergeByParty, payablesOverview, placeOf, planMoney, raisedBy, recordedRow, rrBadge, setupRows, supplierBankRows, tally, unheld,
} from '../logic/erpApprovalTabs';

// 2026-11-18: "these same I want in the app, exact same, same order". The strips below are read off the ERP's screens.
const entry = (over: Partial<ErpPendingEntry>): ErpPendingEntry => ({ id: 'e', ref: '', title: '', stage: 'approve', kind: 'voucher', type: '', branch: 'BOM', actionBranch: 'BOM', pipeline: 'vouchers', ...over });
const cr = (type: string, over: Partial<ErpChangeRequest> = {}): ErpChangeRequest => ({ _id: type, type, branch: 'BOM', status: 'pending', ...over });

describe('the strip is the ERP strip', () => {
  it('has its eight tabs, in order', () => {
    expect(APPROVAL_TABS.map((t) => t.label)).toEqual(['Waiting on me', 'Entries', 'Pay & Credit', 'HR & Payroll', 'Setup', 'Close', 'Status', 'Raise & Resolve']);
  });
  it('has its sub-tabs, in order', () => {
    expect(SUBTABS.pay.map((s) => s.label)).toEqual(['Payment requests (APFP)', 'Supplier bank', 'Credit (CFM)']);
    expect(SUBTABS.setup.map((s) => s.label)).toEqual(['Settings & access', 'Masters', 'Targets & budgets', 'Other requests']);
    expect(SUBTABS.status.map((s) => s.label)).toEqual(['By book & holder', 'Raised by me', 'Recorded']);
    expect(SUBTABS.rr.map((s) => s.label)).toEqual(['My move', 'Waiting on others', 'Copied to me', 'Closed', 'ERP Concerns']);
  });
  it('has the Entries pills, in order', () => {
    expect(ENTRY_PILLS.map((p) => p.label)).toEqual(['All pending', 'SPGB', 'SPGH · Out', 'SPGH · In', 'Refund · B', 'Reissue · B', 'Refund · H', 'Reissue · H', 'Edits for FM', 'Below GP Line', 'Awaiting FX rate',
      'HRV · Received', 'HPV · Sent', 'HPV & HRV Pairs', 'Receipt', 'Payment', 'Contra', 'Journal', 'Purchase Expense', 'Debit Note', 'Incentive', 'ADM', 'ACM', 'Unrouted']);
  });
  it('still opens the old addresses where their screen went', () => {
    expect(placeOf('cfm')).toEqual({ tab: 'pay', sub: 'credit' });
    expect(placeOf('requests')).toEqual({ tab: 'pay', sub: 'payables' });
    expect(placeOf('requests', 'hr')).toEqual({ tab: 'hr' });
    expect(placeOf('requests', 'other')).toEqual({ tab: 'setup', sub: 'settings' });
    expect(placeOf('review')).toEqual({ tab: 'review' });
    expect(placeOf('status', 'recorded')).toEqual({ tab: 'status', sub: 'recorded' });
    expect(placeOf('status', 'nope')).toEqual({ tab: 'status', sub: 'board' });
    expect(placeOf('nope')).toBeNull();
  });
});

describe('an entry sits on the pill the ERP opens it on', () => {
  it.each<[Partial<ErpPendingEntry>, string | null]>([
    [{ kind: 'file', type: 'SO/PO/GP', ref: 'SPGB/BOM/26/1', sub: 'FL · 2026-11-01', pipeline: 'folders' }, 'spgb'],
    [{ kind: 'file', type: 'SO/PO/GP', ref: 'SPGH/BOM/26/1', sub: 'FL · 2026-11-01', pipeline: 'hub' }, 'spgh-in'],
    [{ kind: 'file', type: 'SO/PO/GP', ref: 'RFB/BOM/26/1', sub: 'RF · 2026-11-01', pipeline: 'folders' }, 'refund-b'],
    [{ kind: 'file', type: 'SO/PO/GP', ref: 'RIH/BOM/26/1', sub: 'RI · 2026-11-01', pipeline: 'hub' }, 'reissue-h'],
    [{ type: 'RF', ref: 'RFH/BOM/26/1', pipeline: 'hub' }, 'refund-h'],
    [{ type: 'RI', ref: 'RIB/BOM/26/1', pipeline: 'hub' }, 'reissue-b'],
    [{ type: 'SF', deal: true, pipeline: 'hub' }, 'spgh-out'],
    [{ type: 'HPV', pipeline: 'hub' }, 'hub-pmt'], [{ type: 'HRV', pipeline: 'hub' }, 'hub-rv'],
    [{ type: 'RV' }, 'receipt'], [{ type: 'PMT' }, 'payment'], [{ type: 'CV' }, 'contra'], [{ type: 'JV' }, 'journal'], [{ type: 'PXP' }, 'purchase-expense'],
    [{ type: 'PXPDN' }, 'debit-note'], [{ type: 'CI' }, 'commission'], [{ type: 'ADM' }, 'adm'], [{ type: 'ACM' }, 'acm'],
    [{ type: 'RV', pipeline: 'other' }, 'unrouted'], [{ type: 'TV' }, null], [{ type: 'SAL' }, null],
  ])('%j', (e, pill) => expect(entryPillOf(entry(e))).toBe(pill));
  it('All pending holds every entry; a pill only its own', () => {
    const rows = [entry({ id: 'a', type: 'RV' }), entry({ id: 'b', type: 'TV' })];
    expect(entriesOnPill(rows, 'all')).toHaveLength(2);
    expect(entriesOnPill(rows, 'receipt').map((e) => e.id)).toEqual(['a']);
  });
});

describe('requests sit where the ERP lists them', () => {
  const rows = ['config', 'flag', 'user_limit', 'access_change', 'period_lock', 'master', 'credit_policy', 'ledger_change', 'branch_change', 'target_budget', 'party_bank', 'credit_facility', 'surprise'].map((t) => cr(t));
  it('splits Setup', () => {
    expect(setupRows(rows, 'settings').map((r) => r.type)).toEqual(['config', 'flag', 'user_limit', 'access_change', 'period_lock']);
    expect(setupRows(rows, 'masters').map((r) => r.type)).toEqual(['master', 'credit_policy', 'ledger_change', 'branch_change']);
    expect(setupRows(rows, 'targets').map((r) => r.type)).toEqual(['target_budget']);
    expect(setupRows(rows, 'other').map((r) => r.type)).toEqual(['surprise']);
  });
  it('puts a supplier bank change on Pay & Credit', () => expect(supplierBankRows(rows).map((r) => r.type)).toEqual(['party_bank']));
});

describe('Close', () => {
  const bom: ErpCloseRow = { branch: 'BOM', status: 'held', label: 'Sep 2025 – Apr 2026', months: 8, fmSign: { by: 'faiz@travkings.com' }, ahead: { label: 'May 2026 – Oct 2026' } };
  const rows: ErpCloseRow[] = [{ branch: 'AMD', status: 'checking' }, bom, { branch: 'MHUB', status: 'locked' }];
  it('reads as the ERP row reads', () => {
    expect(closeStage(bom)).toBe('Director to certify');
    expect(closeWaitingOn(bom)).toBe('Director · then the Owner');
    expect(closeLine(bom)).toBe('8 months · signed by faiz@travkings.com · then May 2026 – Oct 2026 being checked');
    expect(closeStage({ ...bom, directorSign: { at: '2026-11-01' } })).toBe('Owner to lock');
  });
  it('lists held first, and only what waits, at the branch', () => {
    expect(closesAt(rows, 'ALL').map((r) => r.branch)).toEqual(['BOM', 'AMD']);
    expect(closesAt(rows, 'AMD').map((r) => r.branch)).toEqual(['AMD']);
  });
  it('a held close is owed by the Owner only', () => {
    expect(closesOwed(rows, 'BOM', 'Super Admin')).toBe(1);
    expect(closesOwed(rows, 'AMD', 'Super Admin')).toBe(0);
    expect(closesOwed(rows, 'BOM', 'Director')).toBe(0);
  });
});

describe('Status', () => {
  const cells = [
    { branch: 'BOM', tab: 'margin', role: 'FinanceManager', n: 13, oldestDays: 170 }, { branch: 'BOM', tab: 'hr', role: 'Director', n: 3, oldestDays: 23 },
    { branch: 'AMD', tab: 'entries', role: 'BranchAccountant', n: 2, oldestDays: 1 }, { tab: 'requests', role: 'Director', n: 1, oldestDays: 2 },
  ];
  const data = { branchRoles: ['BranchAccountant', 'BranchManager'], people: { FinanceManager: [{ name: 'Faiz' }], Director: [{ name: 'Farhan' }], Owner: [{ name: 'Afshin' }], BranchAccountant: [{ name: 'A', branches: ['BOM'] }] } };
  it('a branch holds its own cells and the group-wide ones', () => {
    expect(tally(cellsAtFocus(cells, 'BOM'))).toEqual({ by: { margin: 13, hr: 3, requests: 1 }, total: 17, oldest: 170 });
    expect(tally(cellsAtFocus(cells, 'ALL')).total).toBe(19);
  });
  it('counts each holder once, keeps the sign-off roles, and finds a stage nobody holds', () => {
    const rows = holderRows(data, cellsAtFocus(cells, 'ALL'), ['BOM', 'AMD']);
    const of = (k: string) => rows.find((r) => r.key === k);
    expect(of('FinanceManager|')?.total).toBe(13);
    expect(of('Director|')?.total).toBe(4);
    expect(of('Owner|')?.total).toBe(0);
    expect(rows.filter(unheld).map((r) => r.key)).toEqual(['BranchAccountant|AMD']);
  });
});

describe('Raised by me and Recorded', () => {
  it('finds my requests by email', () => {
    expect(raisedBy(cr('master', { maker: { userId: 'ME@kb.test' } }), { email: 'me@kb.test', id: 'x' })).toBe(true);
    expect(raisedBy(cr('master', { maker: { userId: 'you@kb.test' } }), { email: 'me@kb.test', id: 'x' })).toBe(false);
  });
  it('words a recorded event', () => {
    const r = recordedRow({ _id: '1', action: 'recorded.pdc.bounce', branch: 'BOM', after: { ref: 'CHQ 1', amount: 5 }, actor: { name: 'Asha', role: 'BA' }, reason: 'no funds' });
    expect(r).toMatchObject({ what: 'Cheque bounced', ref: 'CHQ 1', amount: 5, by: 'Asha · BA', reason: 'no funds' });
  });
});

describe('Raise & Resolve', () => {
  const rows: ErpConcern[] = [
    { id: '1', book: 'BOM', bucket: 'move', dueDay: '2026-11-20', status: 'raised' }, { id: '2', book: 'BOM', bucket: 'move', overdue: true, dueDay: '2026-11-21', status: 'seen' },
    { id: '3', book: 'AMD', bucket: 'wait', from: { desk: 'erp' }, status: 'working' }, { id: '4', book: 'BOM', bucket: 'closed', status: 'closed' },
  ];
  const mine = { rows, counts: { move: 2, wait: 1, cc: 0, closed: 1 }, erp: { hiddenByBook: { BOM: { move: 3 } } } };
  const erp = { counts: { R1: { BOM: 4, AMD: 1 } } };
  it('cuts the lists to the branch and still counts what the server left off', () => {
    expect(concernsAt(mine, 'BOM').counts).toEqual({ move: 5, wait: 0, cc: 0, closed: 1 });
    expect(concernsAt(mine, 'ALL').counts.move).toBe(2);
  });
  it('lists the late ones first', () => expect(concernsOn(rows, 'move').map((r) => r.id)).toEqual(['2', '1']));
  it('counts team concerns and ERP Concerns on the badge, with my move beside it', () => {
    expect(erpConcernCount(erp, 'BOM')).toBe(4);
    expect(rrBadge(mine, erp, 'BOM')).toEqual({ n: 6, move: 5 });
    expect(rrBadge(mine, erp, 'ALL')).toEqual({ n: 7, move: 2 });
  });
  it('words the status', () => {
    expect(concernStatus({ id: 'x', status: 'closed' }).word).toBe('Closed');
    expect(concernStatus({ id: 'x', status: 'seen', overdue: true, dueDay: '2026-11-16' }, new Date('2026-11-18T13:13:00Z')).word).toBe('Overdue 2d');
  });
  it('groups ERP Concerns by branch and rule', () => {
    const g = erpConcernGroups({ rules: [{ rule: 'R1', name: 'Bank not reconciled' }], rows: [{ id: 'a', book: 'BOM', rule: 'R1', overdue: true }, { id: 'b', book: 'BOM', rule: 'R1' }] });
    expect(g).toEqual([expect.objectContaining({ book: 'BOM', rule: 'R1', name: 'Bank not reconciled', late: 1 })]);
    expect(g[0].rows).toHaveLength(2);
  });
});

describe('the payables tiles', () => {
  const plan = { branches: [{ branch: 'BOM', currency: 'INR', ladder: {
    rows: [{ kind: 'request', amount: 5000, request: { status: 'approved' } }],
    part2: { rows: [
      { party: 'Travkings MHUB', side: 'out', kind: 'hub', amount: 5840557, dueOn: '2026-11-18' }, { party: 'Travkings MHUB', side: 'out', kind: 'hub', amount: 902908, dueOn: '2026-11-23', notYetDue: true },
      { party: 'No date', side: 'out', kind: 'nodate', amount: 9 }, { party: 'Client', side: 'in', amount: 7 },
    ] },
  } }] };
  it('gives the ERP screen\'s figures for BOM', () => {
    expect(payablesOverview(plan, 'BOM')).toMatchObject({ payables: 6748465, requested: 5000, requestedCount: 1, notRequested: 6743465, waiting: 0 });
  });
  it('prints whole units, as the ERP tiles do', () => {
    expect(planMoney(6748464.98, 'INR')).toBe('₹67,48,465');
    expect(planMoney(5000, 'INR')).toBe('₹5,000');
    expect(planMoney(1234.56, 'USD')).toBe('$1,235');
  });
  it('merges a payee into one row', () => {
    expect(mergeByParty(plan.branches[0].ladder.part2.rows.slice(0, 2))).toEqual([expect.objectContaining({ party: 'Travkings MHUB', amount: 6743465, dueNow: 5840557, ahead: 902908, aheadOn: '2026-11-23', dueOn: '2026-11-18', notYetDue: false })]);
  });
});

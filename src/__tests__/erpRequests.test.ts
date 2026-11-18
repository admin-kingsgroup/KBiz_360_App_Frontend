import type { ErpChangeRequest } from '../api/erp';
import { approvalsAt, tabCounts, tabTotals, waitingLabel, waitingOnMe } from '../logic/erpPayables';
import { entryRequestGroups, myTurnOn, requestChanges, requestGates, requestHeadline, requestSubject, requestTypeLabel, waitingRoles } from '../logic/erpRequests';

// 2026-11-18, BOM: the ERP showed Entries 16, the app 15, and its "Posted Delete" card named no voucher and waited on the wrong
// level. The figures below are that screen's.
const LADDER = [
  { order: 1, role: 'FinanceManager', label: 'Review (FM)' },
  { order: 2, role: 'Director', label: 'Approve (Director)' },
  { order: 3, role: 'Owner', label: 'Approve (Owner)' },
];
const offBooks = (over: Partial<ErpChangeRequest> = {}): ErpChangeRequest => ({
  _id: 'd1', type: 'posted_delete', branch: 'BOM', status: 'pending', chain: LADDER, approvals: [],
  maker: { userId: 'faiz@kb.test', name: 'Faiz', role: 'Finance Manager' },
  payload: { after: { label: 'Delete a posted voucher', ref: 'HRV/BOM/MHUB/26/1038', branch: 'BOM', reason: 'ok' } },
  ...over,
});
const OWNER = { role: 'Super Admin', email: 'owner@kb.test' };
const DIRECTOR = { role: 'Director', email: 'dir@kb.test' };
const FM = { role: 'Finance Manager', email: 'faiz@kb.test' };
const OTHER_FM = { role: 'Finance Manager', email: 'fm2@kb.test' };
const BA = { role: 'Branch Accountant', email: 'ba@kb.test' };

describe('a request says what it is', () => {
  it('names the voucher coming off the books, and why', () => {
    expect(requestTypeLabel('posted_delete')).toBe('Off the books (posted)');
    expect(requestSubject(offBooks())).toBe('Delete a posted voucher · HRV/BOM/MHUB/26/1038 · BOM');
    expect(requestChanges(offBooks())).toEqual([
      { label: 'Delete a posted voucher', from: 'HRV/BOM/MHUB/26/1038', to: '(reversed out — kept view-only)' },
      { label: 'Why', from: '', to: 'ok' },
    ]);
    expect(requestHeadline(offBooks())).toContain('HRV/BOM/MHUB/26/1038');
  });
  it('never reads the new bank details or an access change’s raw apply', () => {
    const bank = offBooks({ type: 'party_bank', payload: { after: { name: 'Air Co', apply: { bankAcNo: '123456789' }, changes: [{ field: 'Account no.', from: 'xx11', to: 'xx22' }] } } });
    expect(JSON.stringify(requestChanges(bank))).not.toContain('123456789');
    expect(requestSubject(bank)).toBe('Air Co');
  });
});

describe('whose turn it is', () => {
  it('skips the level of the person who raised it: the FM raised it, so it waits on the Director', () => {
    expect(waitingRoles(offBooks())).toEqual(['Director']);
    expect(waitingLabel(offBooks())).toBe('Approve (Director)');
  });
  it('is the first unsigned level when someone else raised it', () => {
    expect(waitingRoles(offBooks({ maker: { userId: 'ba@kb.test', role: 'Branch Accountant' } }))).toEqual(['FinanceManager']);
  });
  it('is on my step only at my level, and never on what I raised', () => {
    expect(myTurnOn(offBooks(), DIRECTOR)).toBe(true);
    expect(myTurnOn(offBooks(), OWNER)).toBe(false);
    expect(myTurnOn(offBooks(), FM)).toBe(false);
    expect(myTurnOn(offBooks({ maker: { userId: 'ba@kb.test', role: 'Branch Accountant' } }), FM)).toBe(true);
  });
});

describe('who may act', () => {
  it('the Owner may sign past the Director; a role outside the chain gets no buttons', () => {
    expect(requestGates(offBooks(), OWNER)).toEqual({ approve: '', decline: '', sendBack: true });
    const ba = requestGates(offBooks(), BA);
    expect(ba.approve).toMatch(/Only the FM, the Director and the Owner act/);
    expect(ba.decline).toBe(ba.approve);
  });
  it('the maker may not approve, but may still reject or send back', () => {
    const g = requestGates(offBooks(), FM);
    expect(g.approve).toMatch(/You raised this request/);
    expect(g.decline).toBe('');
  });
  it('the Director waits for an FM who has not signed', () => {
    const r = offBooks({ maker: { userId: 'ba@kb.test', role: 'Branch Accountant' } });
    expect(requestGates(r, DIRECTOR).approve).toMatch(/It waits for Review \(FM\) first/);
    expect(requestGates(r, OTHER_FM).approve).toBe('');
  });
  it('a level that signed cannot sign again', () => {
    const r = offBooks({ approvals: [{ role: 'Director', by: 'dir@kb.test' }] });
    expect(requestGates(r, DIRECTOR).approve).toMatch(/Your level has signed/);
  });
  it('only an ordered chain goes back to its maker', () => {
    expect(requestGates(offBooks({ type: 'transit_move', chain: [] }), OWNER).sendBack).toBe(false);
    expect(requestGates(offBooks({ type: 'door_l2', chain: [] }), OWNER).sendBack).toBe(false);
    expect(requestGates(offBooks({ type: 'door_l4' }), OWNER).sendBack).toBe(true);
  });
});

describe('the tabs add up as the ERP does', () => {
  const margin = (id: string): ErpChangeRequest => offBooks({ _id: id, type: 'margin_floor' });
  const lists = {
    crs: [offBooks(), ...Array.from({ length: 13 }, (_, i) => margin(`m${i}`)),
      offBooks({ _id: 'old', type: 'limits' }), offBooks({ _id: 't1', type: 'transit_move', chain: [] }), offBooks({ _id: 'c1', type: 'config' }), offBooks({ _id: 'f1', type: 'hub_fx', branch: 'HFBM' })],
    leave: Array.from({ length: 7 }, (_, i) => ({ branch: 'BOM', id: `l${i}`, turn: { allowed: true } })),
    credit: [{ branch: 'BOM', yourTurn: false, signPast: [] }, { branch: 'BOM', yourTurn: true }, { branch: 'NBO', signPast: [{}] }],
    entries: [{ branch: 'BOM', actionBranch: 'BOM' }, { branch: 'BOM', actionBranch: 'BOM' }],
    edits: [{ branch: 'BOM' }, { branch: 'NBO' }],
  };
  it('Entries = vouchers + Below GP + off the books + Edits for FM', () => {
    const c = tabCounts(approvalsAt(lists, 'BOM'));
    expect(c).toMatchObject({ entries: 2, margin: 13, entryRequests: 1, edits: 1, requests: 1 });
    expect(tabTotals(c).entries).toBe(17);
  });
  it('keeps retired types out, and transit listed but outside the figure', () => {
    const a = approvalsAt(lists, 'BOM');
    expect(a.requests.map((r) => r._id)).toEqual(['c1']);
    expect(a.transit.map((r) => r._id)).toEqual(['t1']);
    expect(entryRequestGroups(a.entryRequests, a.transit).map((g) => g.key)).toEqual(['posted_delete', 'transit']);
  });
  it('Waiting on me = requests at my level + credit I may act on + leave at my turn', () => {
    const owner = waitingOnMe(lists, 'BOM', OWNER);
    expect(owner.requests).toEqual([]);
    expect(owner.credit).toHaveLength(1);
    expect(owner.leave).toHaveLength(7);
    expect(owner.total).toBe(8);
    expect(waitingOnMe(lists, 'BOM', DIRECTOR).requests.map((r) => r._id)).toContain('d1');
    expect(waitingOnMe(lists, 'BOM', DIRECTOR).requests.map((r) => r._id)).not.toContain('old');
    expect(waitingOnMe(lists, 'ALL', OWNER).credit).toHaveLength(2);
  });
});

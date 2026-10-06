import { approvalToItem, buildQueue, chainText, regularizationToItem, signedText } from '../logic/approvalQueue';
import type { Approval } from '../api/approvals';
import type { Regularization } from '../api/hr';

const person = (id: string, name: string, position: string | null = null) =>
  ({ id, name, initials: 'XX', color: '#37B6A4', avatar: null, position });

const approval = (over: Partial<Approval> = {}): Approval => ({
  id: 'a1',
  title: 'Salary release approval',
  details: 'September salary for the Ahmedabad team.',
  category: 'Salary',
  status: 'pending',
  submittedAt: '2026-09-17T09:30:00Z',
  decidedAt: null,
  requester: person('u1', 'Rohan Mehta', 'Finance Officer'),
  totalLevels: 2,
  currentLevel: 1,
  currentApprovers: [person('u2', 'Faiz Patel')],
  levels: [],
  steps: [],
  isMine: false,
  canAct: true,
  canCancel: false,
  myDecision: null,
  ...over,
});

const correction = (over: Partial<Regularization> = {}): Regularization => ({
  id: 'r1',
  userId: 'u9',
  date: '2026-09-12',
  checkInAt: '2026-09-12T07:30:00Z',
  checkOutAt: null,
  reason: 'Missed checkout',
  status: 'pending',
  appliedAt: '2026-09-12T10:00:00Z',
  decidedBy: null,
  decidedAt: null,
  decisionNote: '',
  name: 'Ujjwal Singh',
  branch: 'KGD',
  ...over,
});

describe('approvalToItem', () => {
  it('carries the requester, category and chain onto one row', () => {
    const item = approvalToItem(approval());
    expect(item.kind).toBe('approval');
    expect(item.personName).toBe('Rohan Mehta');
    expect(item.personSubtitle).toBe('Finance Officer');
    expect(item.meta).toBe('Salary');
    expect(item.metaTail).toBe('Level 1 of 2 · Faiz Patel');
    expect(item.metaWarn).toBe(false);
  });

  it('only lets the viewer act when the server said so AND it is still pending', () => {
    expect(approvalToItem(approval({ canAct: true })).canAct).toBe(true);
    expect(approvalToItem(approval({ canAct: false })).canAct).toBe(false);
    expect(approvalToItem(approval({ canAct: true, status: 'approved' })).canAct).toBe(false);
  });

  it('drops the chain text once a decision is in', () => {
    expect(chainText(approval({ status: 'approved' }))).toBe('');
  });

  it('falls back through the legacy step fields', () => {
    const legacy = approval({ totalLevels: undefined, currentLevel: undefined, currentApprovers: [], totalSteps: 3, currentStep: 2, currentApprover: person('u4', 'Pravesh') });
    expect(chainText(legacy)).toBe('Level 2 of 3 · Pravesh');
  });

  it('still says something when no approver is named', () => {
    expect(chainText(approval({ currentApprovers: [], currentApprover: null, currentLevel: null, totalLevels: undefined, totalSteps: undefined, currentStep: null })))
      .toBe('Awaiting a decision');
  });
});

describe('regularizationToItem', () => {
  it('flags an open punch-out in amber, because that is the case to look at', () => {
    const item = regularizationToItem(correction());
    expect(item.metaTail).toBe('Out missing');
    expect(item.metaWarn).toBe(true);
  });

  it('reads a complete day plainly', () => {
    const item = regularizationToItem(correction({ checkOutAt: '2026-09-12T11:06:00Z' }));
    expect(item.metaWarn).toBe(false);
    expect(item.metaTail).toMatch(/^Out /);
  });

  it('keeps the person and branch for the group header', () => {
    const item = regularizationToItem(correction());
    expect(item.personName).toBe('Ujjwal Singh');
    expect(item.personSubtitle).toBe('KGD');
  });

  it('names an unknown requester rather than rendering blank', () => {
    expect(regularizationToItem(correction({ name: undefined, branch: undefined })).personName).toBe('Unknown');
  });

  it('is not actionable once decided', () => {
    expect(regularizationToItem(correction({ status: 'approved' })).canAct).toBe(false);
  });

  it('shows the ERP levels that already signed, only while pending', () => {
    expect(regularizationToItem(correction({ signedBy: ['FM', 'Director'], waitingOn: 'Approve (Owner)' })).meta).toMatch(/· FM ✓ · Director ✓$/);
    expect(regularizationToItem(correction()).meta).toMatch(/^In [^·]+$/);
    expect(signedText({ status: 'approved', signedBy: ['FM'] })).toBe('');
    expect(signedText({ status: 'pending', signedBy: [] })).toBe('');
  });
});

describe('buildQueue', () => {
  it('interleaves both sources by age, newest first', () => {
    const queue = buildQueue(
      [approval({ id: 'a1', submittedAt: '2026-09-10T09:00:00Z' })],
      [correction({ id: 'r1', appliedAt: '2026-09-20T09:00:00Z' })]
    );
    expect(queue.map((q) => q.kind)).toEqual(['time-correction', 'approval']);
  });

  it('gives the two sources ids that cannot collide', () => {
    const queue = buildQueue([approval({ id: 'x' })], [correction({ id: 'x' })]);
    expect(new Set(queue.map((q) => q.id)).size).toBe(2);
    expect(queue.map((q) => q.sourceId)).toEqual(['x', 'x']);
  });

  it('handles either source being empty', () => {
    expect(buildQueue([], [])).toEqual([]);
    expect(buildQueue([approval()], [])).toHaveLength(1);
    expect(buildQueue([], [correction()])).toHaveLength(1);
  });

  // The corrections list is one request per status. A backend that does not yet understand the
  // `status` query answers all three with the same pending rows, which used to render every
  // correction three times on the real device.
  it('shows a record once even when the server repeats it across status queries', () => {
    const repeated = [correction({ id: 'r1' }), correction({ id: 'r1' }), correction({ id: 'r1' })];
    const queue = buildQueue([], repeated);
    expect(queue).toHaveLength(1);
    expect(queue[0].sourceId).toBe('r1');
  });

  it('deduplicates approvals the same way', () => {
    expect(buildQueue([approval({ id: 'a1' }), approval({ id: 'a1' })], [])).toHaveLength(1);
  });

  it('keeps genuinely different records of the same kind', () => {
    const queue = buildQueue([], [correction({ id: 'r1' }), correction({ id: 'r2' })]);
    expect(queue).toHaveLength(2);
  });
});

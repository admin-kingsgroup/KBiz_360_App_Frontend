import type { SwapRequest } from '../api/hr';
import {
  awaitsMyAnswer, canWithdrawSwap, incomingAskText, swapChoices, swapDraftError, swapHistory, swapProgressLine, swapStatus, swapWhoText, yourDaysText,
} from '../logic/swap';

const id = (d: string): string => d;

const swap = (over: Partial<SwapRequest> = {}): SwapRequest => ({
  id: 's1', role: 'applicant', workDay: '2026-10-17', offDay: '2026-10-24',
  applicant: { userId: 'u1', name: 'Asha' }, partner: { userId: 'u2', name: 'Bilal Khan' },
  partnerStatus: 'pending', partnerAt: null, partnerNote: '', reason: 'family function',
  status: 'pending', appliedAt: '2026-10-12T06:00:00.000Z', decidedAt: null, decisionNote: '', decidedRole: '',
  waitingOn: 'Bilal Khan (swap partner)', signedBy: [], you: { work: '2026-10-17', off: '2026-10-24' },
  ...over,
});
// The same swap as Bilal (the partner) sees it.
const asPartner = (over: Partial<SwapRequest> = {}): SwapRequest => swap({ role: 'partner', you: { work: '2026-10-24', off: '2026-10-17' }, ...over });

describe('swapChoices', () => {
  const upcoming = [
    { day: '2026-10-17', off: true, busy: '' },
    { day: '2026-10-24', off: false, busy: '' },
    { day: '2026-10-31', off: true, busy: 'already in a swap' },
    { day: '2026-11-07', off: false, busy: 'paid leave' },
  ];
  it('step 1 offers my week-off Saturdays, busy ones disabled with the reason', () => {
    expect(swapChoices(upcoming, 'work')).toEqual([
      { day: '2026-10-17', enabled: true, note: '' },
      { day: '2026-10-31', enabled: false, note: 'already in a swap' },
    ]);
  });
  it('step 2 offers my working Saturdays, never the one picked to work', () => {
    expect(swapChoices(upcoming, 'off', '2026-10-17')).toEqual([
      { day: '2026-10-24', enabled: true, note: '' },
      { day: '2026-11-07', enabled: false, note: 'paid leave' },
    ]);
    expect(swapChoices([{ day: '2026-10-24', off: false, busy: '' }], 'off', '2026-10-24')).toEqual([]);
    expect(swapChoices(undefined, 'work')).toEqual([]);
  });
});

describe('swapDraftError', () => {
  const ok = { workDay: '2026-10-17', offDay: '2026-10-24', partnerUserId: 'u2', reason: 'wedding' };
  it('walks the steps in order', () => {
    expect(swapDraftError(ok)).toBeNull();
    expect(swapDraftError({ ...ok, workDay: '' })).toMatch(/you’ll work/);
    expect(swapDraftError({ ...ok, offDay: '' })).toMatch(/take off/);
    expect(swapDraftError({ ...ok, offDay: ok.workDay })).toMatch(/two different/);
    expect(swapDraftError({ ...ok, partnerUserId: '' })).toMatch(/who/);
    expect(swapDraftError({ ...ok, reason: ' ' })).toMatch(/Say why/);
  });
});

describe('perspective', () => {
  it('the incoming ask reads from the partner side (you.off / you.work)', () => {
    expect(incomingAskText(asPartner(), id)).toBe('Asha asks to swap Saturdays — you’d be OFF 2026-10-17 and WORK 2026-10-24');
  });
  it('my days follow the status tense', () => {
    expect(yourDaysText(swap(), id)).toBe('You’d work 2026-10-17 · off 2026-10-24');
    expect(yourDaysText(asPartner({ status: 'approved' }), id)).toBe('You work 2026-10-24 · off 2026-10-17');
    expect(yourDaysText(swap({ status: 'rejected' }), id)).toBe('You were to work 2026-10-17 · off 2026-10-24');
  });
  it('names the other person', () => {
    expect(swapWhoText(swap())).toBe('Swap with Bilal Khan');
    expect(swapWhoText(asPartner())).toBe('Asked by Asha');
  });
});

describe('who acts', () => {
  it('only the partner answers, only while both are pending', () => {
    expect(awaitsMyAnswer(asPartner())).toBe(true);
    expect(awaitsMyAnswer(swap())).toBe(false);
    expect(awaitsMyAnswer(asPartner({ partnerStatus: 'accepted' }))).toBe(false);
    expect(awaitsMyAnswer(asPartner({ status: 'cancelled' }))).toBe(false);
  });
  it('only the applicant withdraws, only while pending', () => {
    expect(canWithdrawSwap(swap())).toBe(true);
    expect(canWithdrawSwap(swap({ partnerStatus: 'accepted', waitingOn: 'Review (FM)' }))).toBe(true);
    expect(canWithdrawSwap(asPartner())).toBe(false);
    expect(canWithdrawSwap(swap({ status: 'approved' }))).toBe(false);
  });
});

describe('status chip and progress line', () => {
  it('pending: waits on the partner, then the chain', () => {
    expect(swapStatus(swap())).toEqual({ label: 'Waiting for partner', tone: 'pending' });
    expect(swapProgressLine(swap())).toBe('Waiting on Bilal Khan to accept');
    expect(swapProgressLine(asPartner())).toBe('Waiting on you to accept');
    const accepted = { partnerStatus: 'accepted' as const, waitingOn: 'Confirm (Director)', signedBy: ['FM'] };
    expect(swapStatus(swap(accepted))).toEqual({ label: 'Accepted · with approvers', tone: 'pending' });
    expect(swapProgressLine(swap(accepted))).toBe('Bilal Khan accepted · waiting on Confirm (Director) · FM ✓');
    expect(swapProgressLine(asPartner(accepted))).toBe('You accepted · waiting on Confirm (Director) · FM ✓');
  });
  it('declined by the partner — with or without a note', () => {
    const declined = { status: 'rejected' as const, partnerStatus: 'declined' as const, decidedRole: 'Partner', partnerNote: 'Out of town', decisionNote: 'Out of town' };
    expect(swapStatus(swap(declined))).toEqual({ label: 'Declined', tone: 'rejected' });
    expect(swapProgressLine(swap(declined))).toBe('Bilal Khan declined — Out of town');
    expect(swapProgressLine(asPartner({ ...declined, partnerNote: '', decisionNote: 'Declined by Bilal Khan' }))).toBe('You declined');
  });
  it('rejected by a level of the chain', () => {
    const r = swap({ status: 'rejected', partnerStatus: 'accepted', decidedRole: 'FinanceManager', decisionNote: 'Audit that Saturday' });
    expect(swapStatus(r)).toEqual({ label: 'Rejected', tone: 'rejected' });
    expect(swapProgressLine(r)).toBe('Rejected by FM — Audit that Saturday');
  });
  it('approved and withdrawn', () => {
    expect(swapStatus(swap({ status: 'approved', partnerStatus: 'accepted' }))).toEqual({ label: 'Approved', tone: 'approved' });
    expect(swapStatus(swap({ status: 'cancelled' }))).toEqual({ label: 'Withdrawn', tone: 'cancelled' });
    expect(swapProgressLine(swap({ status: 'cancelled' }))).toBe('You withdrew it');
    expect(swapProgressLine(asPartner({ status: 'cancelled' }))).toBe('Asha withdrew it');
  });
});

describe('swapHistory', () => {
  it('mine + answered incoming, newest first; open asks to me stay out', () => {
    const mine = [swap({ id: 'a', appliedAt: '2026-10-01T00:00:00Z' })];
    const incoming = [
      asPartner({ id: 'b', appliedAt: '2026-10-05T00:00:00Z' }), // still mine to answer
      asPartner({ id: 'c', appliedAt: '2026-10-03T00:00:00Z', partnerStatus: 'accepted' }),
      asPartner({ id: 'd', appliedAt: '2026-10-04T00:00:00Z', status: 'cancelled' }),
    ];
    expect(swapHistory(mine, incoming).map((r) => r.id)).toEqual(['d', 'c', 'a']);
    expect(swapHistory(undefined, null)).toEqual([]);
  });
});

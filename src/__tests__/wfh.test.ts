import { isPaidLeaveRow, pendingWfhDays, waitingLine, wfhDecisionLine, wfhDraftError } from '../logic/wfh';
import { MAX_SPAN_DAYS } from '../logic/leave';

const TODAY = '2026-10-12';

describe('wfhDraftError (the leave bounds: 62 back, 370 ahead, ≤ 31 days)', () => {
  const ok = { from: '2026-10-14', to: '2026-10-15', reason: 'plumber visit' };
  it('null for a valid draft', () => {
    expect(wfhDraftError(ok, TODAY)).toBeNull();
    expect(wfhDraftError({ ...ok, from: '2026-10-12', to: '2026-10-12' }, TODAY)).toBeNull();
  });
  it('flags missing dates, reversed spans, empty reason', () => {
    expect(wfhDraftError({ ...ok, from: '' }, TODAY)).toMatch(/first day/);
    expect(wfhDraftError({ ...ok, to: '' }, TODAY)).toMatch(/last day/);
    expect(wfhDraftError({ ...ok, to: '2026-10-13' }, TODAY)).toMatch(/before the first/);
    expect(wfhDraftError({ ...ok, reason: '   ' }, TODAY)).toMatch(/Say why/);
  });
  it('caps span and reach', () => {
    expect(wfhDraftError({ ...ok, from: '2026-10-01', to: '2026-11-05' }, TODAY)).toMatch(new RegExp(`${MAX_SPAN_DAYS} days`));
    expect(wfhDraftError({ ...ok, from: '2026-08-10', to: '2026-08-10' }, TODAY)).toMatch(/too far back/);
    expect(wfhDraftError({ ...ok, from: '2026-08-11', to: '2026-08-11' }, TODAY)).toBeNull(); // exactly 62 back
    expect(wfhDraftError({ ...ok, from: '2027-10-20', to: '2027-10-20' }, TODAY)).toMatch(/year ahead/);
  });
});

describe('waitingLine', () => {
  it('names the level it waits on and ticks the ones signed', () => {
    expect(waitingLine({ status: 'pending', waitingOn: 'Review (FM)', signedBy: [] })).toBe('Waiting on Review (FM)');
    expect(waitingLine({ status: 'pending', waitingOn: 'Confirm (Director)', signedBy: ['FM'] })).toBe('Waiting on Confirm (Director) · FM ✓');
  });
  it('is empty once decided', () => {
    expect(waitingLine({ status: 'approved', waitingOn: '', signedBy: ['FM', 'Director', 'Owner'] })).toBe('');
  });
});

describe('wfhDecisionLine', () => {
  const base = { decisionNote: '', decidedRole: '', markedDays: [] as string[], skippedDays: [] as { day: string; reason: string }[] };
  it('approved: marked and skipped days, reasons once each', () => {
    expect(wfhDecisionLine({ ...base, status: 'approved', markedDays: ['2026-10-14', '2026-10-15'] })).toBe('Approved · 2 days marked WFH');
    expect(wfhDecisionLine({
      ...base, status: 'approved', markedDays: ['2026-10-16'],
      skippedDays: [{ day: '2026-10-17', reason: 'week off — no work that day' }, { day: '2026-10-18', reason: 'week off — no work that day' }],
    })).toBe('Approved · 1 day marked WFH · 2 skipped (week off — no work that day)');
  });
  it('rejected names the level and the note', () => {
    expect(wfhDecisionLine({ ...base, status: 'rejected', decidedRole: 'FM', decisionNote: 'Needed in office' })).toBe('Rejected by FM — Needed in office');
    expect(wfhDecisionLine({ ...base, status: 'rejected' })).toBe('Rejected');
  });
  it('pending says nothing; withdrawn says so', () => {
    expect(wfhDecisionLine({ ...base, status: 'pending' })).toBe('');
    expect(wfhDecisionLine({ ...base, status: 'cancelled' })).toBe('Withdrawn');
  });
});

describe('pendingWfhDays', () => {
  it('covers each day of a pending ask only', () => {
    const days = pendingWfhDays([
      { status: 'pending', from: '2026-10-30', to: '2026-11-02' },
      { status: 'approved', from: '2026-10-20', to: '2026-10-20' },
      { status: 'pending', from: 'bad', to: '2026-10-20' },
    ]);
    expect([...days]).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(pendingWfhDays(null).size).toBe(0);
  });
});

describe('isPaidLeaveRow', () => {
  it('keeps leave (and an older server without kind), drops WFH and swaps', () => {
    expect(isPaidLeaveRow({})).toBe(true);
    expect(isPaidLeaveRow({ kind: 'leave' })).toBe(true);
    expect(isPaidLeaveRow({ kind: 'wfh' })).toBe(false);
    expect(isPaidLeaveRow({ kind: 'swap' })).toBe(false);
  });
});

import { leaveDraftError, shiftDay, spanCount, MAX_SPAN_DAYS } from '../logic/leave';

const TODAY = '2026-09-08';

describe('spanCount / shiftDay', () => {
  it('inclusive count; malformed or reversed → 0', () => {
    expect(spanCount('2026-09-01', '2026-09-03')).toBe(3);
    expect(spanCount('2026-09-03', '2026-09-01')).toBe(0);
    expect(spanCount('x', '2026-09-01')).toBe(0);
  });
  it('shiftDay crosses month ends', () => {
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01');
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31');
  });
});

describe('leaveDraftError (mirrors the server bounds)', () => {
  const ok = { from: '2026-09-10', to: '2026-09-11', reason: 'family function' };
  it('null for a valid draft', () => {
    expect(leaveDraftError(ok, TODAY)).toBeNull();
  });
  it('flags missing dates, reversed spans, empty reason', () => {
    expect(leaveDraftError({ ...ok, from: '' }, TODAY)).toMatch(/first day/);
    expect(leaveDraftError({ ...ok, to: '2026-09-09' }, TODAY)).toMatch(/before the first/);
    expect(leaveDraftError({ ...ok, reason: '  ' }, TODAY)).toMatch(/Say why/);
  });
  it('caps span and reach', () => {
    expect(leaveDraftError({ ...ok, from: '2026-09-01', to: '2026-10-05' }, TODAY)).toMatch(new RegExp(`${MAX_SPAN_DAYS} days`));
    expect(leaveDraftError({ ...ok, from: '2026-06-01', to: '2026-06-02' }, TODAY)).toMatch(/too far back/);
    expect(leaveDraftError({ ...ok, from: '2027-09-20', to: '2027-09-21' }, TODAY)).toMatch(/year ahead/);
  });
});

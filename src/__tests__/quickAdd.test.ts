import { parseQuickAdd, whenLabel } from '../logic/quickAdd';

// Parser for the iOS-style Reminders quick add — ported from the design handoff prototype.
// Frozen clock: Tue Sep 8 2026 (getDay() = 2).

beforeAll(() => {
  jest.useFakeTimers({ now: new Date(2026, 8, 8, 10, 0, 0) });
});
afterAll(() => {
  jest.useRealTimers();
});

describe('parseQuickAdd', () => {
  it('parses "tomorrow at 3pm" and strips the matched text', () => {
    expect(parseQuickAdd('Pay vendor tomorrow at 3pm')).toEqual({ title: 'Pay vendor', day: 1, time: '3:00 PM', hasDate: true });
  });

  it('parses today / next week', () => {
    expect(parseQuickAdd('Call bank today')).toMatchObject({ title: 'Call bank', day: 0, hasDate: true });
    expect(parseQuickAdd('Renew license next week')).toMatchObject({ title: 'Renew license', day: 7, hasDate: true });
  });

  it('parses weekday names as the next occurrence (same-day rolls a full week)', () => {
    expect(parseQuickAdd('Standup on friday')).toMatchObject({ title: 'Standup', day: 3 });
    expect(parseQuickAdd('Review tuesday')).toMatchObject({ title: 'Review', day: 7 });
  });

  it('parses explicit dates in all three forms', () => {
    expect(parseQuickAdd('Pay rent 26 sept')).toMatchObject({ title: 'Pay rent', day: 18, hasDate: true });
    expect(parseQuickAdd('Pay rent sept 26')).toMatchObject({ title: 'Pay rent', day: 18 });
    expect(parseQuickAdd('Pay rent 26/9')).toMatchObject({ title: 'Pay rent', day: 18 });
  });

  it('rolls a past date without a year to next year', () => {
    // Jan 5 has passed in 2026 → Jan 5 2027 = 119 days out from Sep 8 2026.
    expect(parseQuickAdd('Audit 5 jan')).toMatchObject({ day: 119, hasDate: true });
  });

  it('parses a bare time with minutes', () => {
    expect(parseQuickAdd('Sync 5:30 pm')).toMatchObject({ title: 'Sync', day: 0, time: '5:30 PM', hasDate: true });
  });

  it('returns the text untouched when nothing matches', () => {
    expect(parseQuickAdd('Buy stapler')).toEqual({ title: 'Buy stapler', day: 0, time: '', hasDate: false });
  });
});

describe('whenLabel', () => {
  it('labels relative days', () => {
    expect(whenLabel(-1, '3:00 PM')).toBe('Yesterday, 3:00 PM');
    expect(whenLabel(-3, '')).toBe('3 days ago');
    expect(whenLabel(0, '')).toBe('Today');
    expect(whenLabel(1, '10:00 AM')).toBe('Tomorrow, 10:00 AM');
  });

  it('labels far dates as "Sat, Sep 26"', () => {
    expect(whenLabel(18, '5:00 PM')).toBe('Sat, Sep 26, 5:00 PM');
  });
});

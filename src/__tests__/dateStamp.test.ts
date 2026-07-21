import { dateStamp, daySeparator, isDifferentDay } from '../utils/time';

// Fixed "now": Tue 21 Jul 2026, 14:00 local.
const NOW = new Date(2026, 6, 21, 14, 0, 0).getTime();
const at = (y: number, m: number, d: number, hh = 10, mm = 30): number => new Date(y, m, d, hh, mm).getTime();

describe('dateStamp (event/list time — today→time, yesterday→"Yesterday", older→date)', () => {
  it('today → clock time, not a relative "ago"', () => {
    const s = dateStamp(at(2026, 6, 21, 9, 5), NOW);
    expect(s).toMatch(/\d/); // a time like "9:05 AM"
    expect(s).not.toMatch(/ago/);
  });
  it('yesterday → "Yesterday"', () => {
    expect(dateStamp(at(2026, 6, 20), NOW)).toBe('Yesterday');
  });
  it('older same-year → day + month, no year, no "ago"', () => {
    const s = dateStamp(at(2026, 6, 17), NOW); // 4 days back — the reported bug case
    expect(s).toMatch(/17/);
    expect(s).toMatch(/Jul/);
    expect(s).not.toMatch(/ago|2026/);
  });
  it('older different-year → includes the year', () => {
    expect(dateStamp(at(2025, 11, 25), NOW)).toMatch(/2025/);
  });
});

describe('daySeparator (chat pill — Today / Yesterday / full date)', () => {
  it('today → "Today"', () => { expect(daySeparator(at(2026, 6, 21, 8), NOW)).toBe('Today'); });
  it('yesterday → "Yesterday"', () => { expect(daySeparator(at(2026, 6, 20), NOW)).toBe('Yesterday'); });
  it('older → full date with year', () => {
    const s = daySeparator(at(2026, 6, 15), NOW);
    expect(s).toMatch(/15/);
    expect(s).toMatch(/July/);
    expect(s).toMatch(/2026/);
  });
});

describe('isDifferentDay', () => {
  it('same day, different times → false', () => {
    expect(isDifferentDay(at(2026, 6, 21, 9), at(2026, 6, 21, 23))).toBe(false);
  });
  it('across midnight → true', () => {
    expect(isDifferentDay(at(2026, 6, 20, 23), at(2026, 6, 21, 1))).toBe(true);
  });
});

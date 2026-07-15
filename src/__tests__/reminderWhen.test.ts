import { presetDue, formatWhenLabel, formatTime, secondsUntil } from '../logic/reminderWhen';

// Fixed "now": Wednesday 15 Jul 2026, 10:30 local.
const NOW = new Date(2026, 6, 15, 10, 30, 0, 0);

describe('presetDue', () => {
  it('today_evening → today 17:00 when still ahead', () => {
    const d = presetDue('today_evening', NOW);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([15, 17, 0]);
  });
  it('today_evening rolls to tomorrow once 17:00 has passed', () => {
    const evening = new Date(2026, 6, 15, 18, 0);
    const d = presetDue('today_evening', evening);
    expect([d.getDate(), d.getHours()]).toEqual([16, 17]);
  });
  it('tomorrow_morning → next day 09:00', () => {
    const d = presetDue('tomorrow_morning', NOW);
    expect([d.getDate(), d.getHours()]).toEqual([16, 9]);
  });
  it('next_monday → the following Monday 09:00', () => {
    const d = presetDue('next_monday', NOW);
    expect(d.getDay()).toBe(1);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(9);
  });
  it('next_monday from a Monday goes a full week ahead', () => {
    const monday = new Date(2026, 6, 13, 10, 0);
    const d = presetDue('next_monday', monday);
    expect([d.getDay(), d.getDate()]).toEqual([1, 20]);
  });
  it('in_1_hour → exactly +3600s', () => {
    expect(presetDue('in_1_hour', NOW).getTime() - NOW.getTime()).toBe(3600_000);
  });
});

describe('formatTime', () => {
  it('formats 12-hour times', () => {
    expect(formatTime(new Date(2026, 0, 1, 0, 5))).toBe('12:05 AM');
    expect(formatTime(new Date(2026, 0, 1, 12, 0))).toBe('12:00 PM');
    expect(formatTime(new Date(2026, 0, 1, 17, 30))).toBe('5:30 PM');
  });
});

describe('formatWhenLabel', () => {
  it('same day → Today', () => {
    expect(formatWhenLabel(new Date(2026, 6, 15, 17, 0), NOW)).toBe('Today · 5:00 PM');
  });
  it('next day → Tomorrow', () => {
    expect(formatWhenLabel(new Date(2026, 6, 16, 9, 0), NOW)).toBe('Tomorrow · 9:00 AM');
  });
  it('within the week → weekday name', () => {
    expect(formatWhenLabel(new Date(2026, 6, 20, 9, 0), NOW)).toBe('Mon · 9:00 AM');
  });
  it('beyond a week, same year → day + month', () => {
    expect(formatWhenLabel(new Date(2026, 7, 3, 14, 15), NOW)).toBe('3 Aug · 2:15 PM');
  });
  it('different year includes the year', () => {
    expect(formatWhenLabel(new Date(2027, 0, 5, 9, 0), NOW)).toBe('5 Jan 2027 · 9:00 AM');
  });
});

describe('secondsUntil', () => {
  it('returns the whole-second delta', () => {
    expect(secondsUntil(new Date(NOW.getTime() + 90_000), NOW)).toBe(90);
  });
  it('clamps past times to 1', () => {
    expect(secondsUntil(new Date(NOW.getTime() - 5000), NOW)).toBe(1);
  });
});

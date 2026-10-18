import { defaultTimeFor, dueAtFor, dueText, formatTimeOfDay, isPastTime, timeOfDue } from '../logic/reminderTime';

const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('reminder due time', () => {
  it('a day with no time is due at 23:59 that day; with a time, at that minute', () => {
    const end = dueAtFor('2026-10-19', null);
    expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([19, 23, 59]);
    const noon = dueAtFor('2026-10-19', { hour: 12, minute: 0 });
    expect([noon.getDate(), noon.getHours(), noon.getMinutes()]).toEqual([19, 12, 0]);
  });

  it('reads 23:59 back as "no time" and anything else as the time', () => {
    expect(timeOfDue(dueAtFor('2026-10-19', null))).toBeNull();
    expect(timeOfDue(dueAtFor('2026-10-19', { hour: 17, minute: 30 }))).toEqual({ hour: 17, minute: 30 });
  });

  it('formats on a 12-hour clock', () => {
    expect(formatTimeOfDay({ hour: 12, minute: 0 })).toBe('12:00 PM');
    expect(formatTimeOfDay({ hour: 0, minute: 5 })).toBe('12:05 AM');
    expect(formatTimeOfDay({ hour: 17, minute: 30 })).toBe('5:30 PM');
  });

  it('opens on the next full hour today, 10 AM on a later day', () => {
    const now = new Date(2026, 9, 18, 15, 28);
    expect(defaultTimeFor(ymd(now), now)).toEqual({ hour: 16, minute: 0 });
    expect(defaultTimeFor('2026-10-19', now)).toEqual({ hour: 10, minute: 0 });
    expect(defaultTimeFor(ymd(now), new Date(2026, 9, 18, 23, 40))).toEqual({ hour: 23, minute: 0 });
  });

  it('knows a time that has already gone by', () => {
    const now = new Date(2026, 9, 18, 15, 28);
    expect(isPastTime('2026-10-18', { hour: 15, minute: 0 }, now)).toBe(true);
    expect(isPastTime('2026-10-18', { hour: 16, minute: 0 }, now)).toBe(false);
    expect(isPastTime('2026-10-19', { hour: 9, minute: 0 }, now)).toBe(false);
  });

  it('list text adds the time only when one was chosen', () => {
    const date = (d: Date): string => `${d.getDate()}/${d.getMonth() + 1}`;
    expect(dueText(dueAtFor('2026-10-19', null).toISOString(), date)).toBe('19/10');
    expect(dueText(dueAtFor('2026-10-19', { hour: 12, minute: 0 }).toISOString(), date)).toBe('19/10 · 12:00 PM');
    expect(dueText(undefined, date)).toBe('No due date');
  });
});

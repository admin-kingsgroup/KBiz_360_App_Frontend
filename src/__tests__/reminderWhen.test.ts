import { presetDue, formatWhenLabel, formatTime, secondsUntil, parseWhen } from '../logic/reminderWhen';

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

// ── natural-language parsing (composer auto-fills "When" from what you type) ──
describe('parseWhen', () => {
  const p = (s: string) => parseWhen(s, NOW); // NOW = Wed 15 Jul 2026, 10:30
  const dhm = (s: string) => { const r = p(s)!; return [r.due.getDate(), r.due.getHours(), r.due.getMinutes()]; };

  it('returns null when there is no date or time in the text', () => {
    expect(p('send the PO to the supplier')).toBeNull();
    expect(p('')).toBeNull();
  });

  it('reads a bare time as today, or tomorrow once it has passed', () => {
    expect(dhm('call the agent at 5pm')).toEqual([15, 17, 0]);
    expect(dhm('call at 9am')).toEqual([16, 9, 0]); // 09:00 already gone at 10:30
    expect(dhm('sync at 17:30')).toEqual([15, 17, 30]);
    expect(dhm('standup 11:15')).toEqual([15, 11, 15]);
  });

  it('handles am/pm edge hours', () => {
    expect(dhm('ping at 12pm')).toEqual([15, 12, 0]);
    expect(dhm('ping at 12am')).toEqual([16, 0, 0]); // midnight → next one
    expect(dhm('ping 5:45 P.M.')).toEqual([15, 17, 45]);
  });

  it('combines a day word with a time', () => {
    expect(dhm('tomorrow 5pm')).toEqual([16, 17, 0]);
    expect(dhm('day after tomorrow at 9:30am')).toEqual([17, 9, 30]);
    expect(dhm('today at 4pm')).toEqual([15, 16, 0]);
  });

  it('defaults a bare date to 9 AM, and tonight to 8 PM', () => {
    expect(dhm('tomorrow')).toEqual([16, 9, 0]);
    expect(p('tomorrow')!.hasTime).toBe(false);
    expect(dhm('tonight')).toEqual([15, 20, 0]);
    expect(dhm('tonight at 9pm')).toEqual([15, 21, 0]); // an explicit time still wins
  });

  it('resolves a weekday to its next occurrence', () => {
    expect(dhm('monday 9am')).toEqual([20, 9, 0]);       // Wed → next Mon
    expect(dhm('on friday')).toEqual([17, 9, 0]);
    expect(dhm('next wednesday')).toEqual([22, 9, 0]);   // today is Wed → a week out, never today
  });

  it('reads written dates in either order, rolling past dates to next year', () => {
    expect(p('meet on 25 July at 3pm')!.due.getTime()).toBe(new Date(2026, 6, 25, 15, 0).getTime());
    expect(p('meet Jul 25')!.due.getTime()).toBe(new Date(2026, 6, 25, 9, 0).getTime());
    expect(p('audit 3rd August')!.due.getTime()).toBe(new Date(2026, 7, 3, 9, 0).getTime());
    expect(p('renewal 2 Jan')!.due.getFullYear()).toBe(2027); // already past in 2026
  });

  it('reads day-first numeric dates', () => {
    expect(p('file by 25/07 at 6pm')!.due.getTime()).toBe(new Date(2026, 6, 25, 18, 0).getTime());
    expect(p('file by 25-12-2026')!.due.getTime()).toBe(new Date(2026, 11, 25, 9, 0).getTime());
  });

  it('rejects impossible and already-past instants rather than guessing', () => {
    expect(p('31 February')).toBeNull();
    expect(p('today at 9am')).toBeNull(); // 09:00 has passed — a bare "9am" would roll, a dated one must not
  });

  it('does not mistake ordinary numbers for a time', () => {
    expect(p('call 5 people about the invoice')).toBeNull();
    expect(p('book 12 seats')).toBeNull();
  });

  it('reports the phrase it matched, for the UI hint', () => {
    expect(p('send it tomorrow 5pm please')!.match).toBe('tomorrow 5pm');
    expect(p('ping at 5pm')!.match).toBe('at 5pm');
  });
});

// The wider grammar — relative offsets, time-of-day words, week/month boundaries, bare "at 5".
describe('parseWhen — extended phrasings', () => {
  const p = (s: string) => parseWhen(s, NOW); // NOW = Wed 15 Jul 2026, 10:30
  const iso = (s: string) => p(s)!.due.getTime();
  const dhm = (s: string) => { const r = p(s)!; return [r.due.getDate(), r.due.getHours(), r.due.getMinutes()]; };

  it('relative minute/hour offsets are an exact instant', () => {
    expect(iso('remind me in 20 mins')).toBe(NOW.getTime() + 20 * 60_000);
    expect(iso('in 2 hours')).toBe(NOW.getTime() + 2 * 3600_000);
    expect(iso('in an hour')).toBe(NOW.getTime() + 3600_000);
    expect(iso('after 45 minutes')).toBe(NOW.getTime() + 45 * 60_000);
  });

  it('relative day/week/month offsets default to 9 AM but accept a time', () => {
    expect(dhm('in 3 days')).toEqual([18, 9, 0]);
    expect(dhm('in 3 days at 5pm')).toEqual([18, 17, 0]);
    expect(dhm('in a week')).toEqual([22, 9, 0]);
    expect(p('in 2 months')!.due.getMonth()).toBe(8); // Jul → Sep
  });

  it('time-of-day words', () => {
    expect(dhm('tomorrow morning')).toEqual([16, 9, 0]);
    expect(dhm('tomorrow afternoon')).toEqual([16, 14, 0]);
    expect(dhm('monday evening')).toEqual([20, 17, 0]);
    expect(dhm('call by noon')).toEqual([15, 12, 0]);
    expect(dhm('finish by eod')).toEqual([15, 18, 0]);
    expect(dhm('submit by midnight')).toEqual([15, 23, 59]);
    expect(dhm('tomorrow night')).toEqual([16, 20, 0]);
  });

  it('week and month boundaries', () => {
    expect(dhm('by end of week')).toEqual([17, 9, 0]);      // Friday
    expect(dhm('this weekend')).toEqual([18, 9, 0]);        // Saturday
    expect(dhm('next week')).toEqual([20, 9, 0]);           // Monday
    expect(iso('by end of month')).toBe(new Date(2026, 6, 31, 9, 0).getTime());
    expect(p('next month')!.due.getMonth()).toBe(7);        // August
  });

  it('bare "at 5" resolves to the next sensible 5 o\'clock, not 5 AM tomorrow', () => {
    expect(dhm('call the agent at 5')).toEqual([15, 17, 0]); // 5 AM gone → 5 PM today
    expect(dhm('call at 11')).toEqual([15, 11, 0]);          // 11 AM still ahead
  });

  it('"coming"/"this" weekday reads the same as a bare one', () => {
    expect(dhm('coming friday')).toEqual([17, 9, 0]);
    expect(dhm('this friday at 4pm')).toEqual([17, 16, 0]);
  });

  it('day of month behind a preposition, rolling into next month', () => {
    expect(iso('pay by the 25th')).toBe(new Date(2026, 6, 25, 9, 0).getTime());
    expect(iso('pay by 3rd')).toBe(new Date(2026, 7, 3, 9, 0).getTime()); // 3 Jul gone → 3 Aug
    expect(p('send the 1st draft')).toBeNull();             // no preposition → not a date
  });

  it('an explicit year is honoured instead of rolling forward', () => {
    expect(p('renew on 2 Jan 2028')!.due.getFullYear()).toBe(2028);
  });

  it('"day after" without "tomorrow", and short forms', () => {
    expect(dhm('day after')).toEqual([17, 9, 0]);
    expect(dhm('tomo 6pm')).toEqual([16, 18, 0]);
  });

  it('still declines when there is nothing real to act on', () => {
    expect(p('call 5 people about the invoice')).toBeNull();
    expect(p('check the 2 pending bills')).toBeNull();
    expect(p('in some time')).toBeNull();
  });
});

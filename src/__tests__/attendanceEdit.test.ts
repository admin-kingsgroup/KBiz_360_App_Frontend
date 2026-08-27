import { buildDayTimes, dayInstant, localDayKey, seedDayTimes, DEFAULT_IN, DEFAULT_OUT, type DayTimesDraft } from '../logic/attendanceEdit';

// Every instant here is built on the device clock (new Date(y, m, d, h, min)) so the suite reads
// the same in whatever TZ the runner happens to be in.
const NOW = new Date(2026, 7, 27, 15, 30); // 27 Aug 2026, 3:30 PM local
const TODAY = localDayKey(NOW);
const YESTERDAY = localDayKey(new Date(2026, 7, 26, 12, 0));
const iso = (d: number, h: number, min: number) => new Date(2026, 7, d, h, min).toISOString();

describe('localDayKey / dayInstant (device-clock day keys)', () => {
  it('round-trips a key through an instant', () => {
    expect(TODAY).toBe('2026-08-27');
    expect(dayInstant(TODAY, 9, 40).getTime()).toBe(new Date(2026, 7, 27, 9, 40).getTime());
    expect(localDayKey(dayInstant(YESTERDAY, 23, 59))).toBe(YESTERDAY);
  });
});

describe('seedDayTimes (what the sheet opens with)', () => {
  it('a recorded punch pre-fills its own in/out on the device clock', () => {
    expect(seedDayTimes({ date: YESTERDAY, inTime: iso(26, 9, 42), outTime: iso(26, 18, 5) }, NOW))
      .toEqual({ inHour: 9, inMinute: 42, outHour: 18, outMinute: 5, hasOut: true });
  });
  it('an absent past day starts at the 10:00–19:00 defaults, with a check-out', () => {
    expect(seedDayTimes({ date: YESTERDAY, inTime: null, outTime: null }, NOW))
      .toEqual({ inHour: DEFAULT_IN.hour, inMinute: DEFAULT_IN.minute, outHour: DEFAULT_OUT.hour, outMinute: DEFAULT_OUT.minute, hasOut: true });
  });
  it('today with no check-out yet stays open (still in) — punched or absent', () => {
    expect(seedDayTimes({ date: TODAY, inTime: iso(27, 9, 42), outTime: null }, NOW).hasOut).toBe(false);
    expect(seedDayTimes({ date: TODAY, inTime: null, outTime: null }, NOW).hasOut).toBe(false);
  });
  it('today already closed keeps its check-out', () => {
    expect(seedDayTimes({ date: TODAY, inTime: iso(27, 9, 42), outTime: iso(27, 14, 0) }, NOW).hasOut).toBe(true);
  });
});

describe('buildDayTimes (draft → request body, or why not)', () => {
  const draft = (o: Partial<DayTimesDraft> = {}): DayTimesDraft => ({ inHour: 9, inMinute: 40, outHour: 18, outMinute: 0, hasOut: true, ...o });

  it('a valid past day → both instants as ISO', () => {
    expect(buildDayTimes(YESTERDAY, draft(), NOW)).toEqual({ ok: true, checkInAt: iso(26, 9, 40), checkOutAt: iso(26, 18, 0) });
  });
  it('today left open → checkOutAt null', () => {
    expect(buildDayTimes(TODAY, draft({ hasOut: false }), NOW)).toEqual({ ok: true, checkInAt: iso(27, 9, 40), checkOutAt: null });
  });
  it('a past day cannot be left open', () => {
    expect(buildDayTimes(YESTERDAY, draft({ hasOut: false }), NOW)).toEqual({ ok: false, error: 'A past day needs a check-out time' });
  });
  it('check-out at or before check-in is refused', () => {
    expect(buildDayTimes(YESTERDAY, draft({ outHour: 9, outMinute: 40 }), NOW).ok).toBe(false);
    expect(buildDayTimes(YESTERDAY, draft({ outHour: 8, outMinute: 0 }), NOW)).toMatchObject({ ok: false, error: 'Check-out must be after check-in' });
  });
  it('nothing may be in the future (3:30 PM now)', () => {
    expect(buildDayTimes(TODAY, draft({ inHour: 16, outHour: 17 }), NOW)).toMatchObject({ ok: false, error: 'Check-in can’t be in the future' });
    expect(buildDayTimes(TODAY, draft({ outHour: 16 }), NOW)).toMatchObject({ ok: false, error: 'Check-out can’t be in the future' });
    expect(buildDayTimes(TODAY, draft({ outHour: 15, outMinute: 30 }), NOW).ok).toBe(true); // exactly now is fine
  });
});

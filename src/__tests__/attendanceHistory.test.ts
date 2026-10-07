import { historyDayView } from '../logic/attendanceHistory';

describe('historyDayView', () => {
  it('a punched day is present, whatever the HR state', () => {
    expect(historyDayView({ date: '2026-10-02', inTime: '2026-10-02T05:00:00.000Z', state: 'holiday' })).toMatchObject({ kind: 'present', badge: 'PRESENT', canAsk: true });
  });

  it('a holiday without a punch is a holiday, not an absence, and offers no Ask', () => {
    expect(historyDayView({ date: '2026-10-02', inTime: null, state: 'holiday', holidayName: 'Gandhi Jayanti' }))
      .toEqual({ kind: 'holiday', note: 'Holiday · Gandhi Jayanti', badge: 'HOLIDAY', canAsk: false });
  });

  it('a week off reads as a week off and offers no Ask', () => {
    expect(historyDayView({ date: '2026-10-02', inTime: null, state: 'weekOff' })).toMatchObject({ kind: 'weekOff', badge: 'WEEK OFF', canAsk: false });
  });

  it('paid leave reads as leave, half days say so', () => {
    expect(historyDayView({ date: '2026-10-02', inTime: null, state: 'leave', halfLeave: true })).toMatchObject({ kind: 'leave', note: 'Paid leave · half day', canAsk: false });
  });

  it('a real absence still offers Ask', () => {
    expect(historyDayView({ date: '2026-10-02', inTime: null, state: 'absent' })).toMatchObject({ kind: 'absent', badge: 'ABSENT', canAsk: true });
  });

  it('no state from the server falls back to the punch-only reading', () => {
    expect(historyDayView({ date: '2026-10-02', inTime: null })).toMatchObject({ kind: 'absent', canAsk: true });
  });

  // Merged with #38 (owner 2026-10-06: Sunday is a week off, no ASK on it).
  it('no state on a Sunday still reads Week off (older server / failed HR read)', () => {
    expect(historyDayView({ date: '2026-10-04', inTime: null })).toEqual({ kind: 'weekOff', note: 'Week off', badge: 'WEEK OFF', canAsk: false });
  });

  it('a worked weekly off stays PRESENT but offers no Ask', () => {
    expect(historyDayView({ date: '2026-10-04', inTime: '2026-10-04T05:00:00.000Z' })).toMatchObject({ kind: 'present', canAsk: false });
    expect(historyDayView({ date: '2026-10-02', inTime: '2026-10-02T05:00:00.000Z', state: 'present', weekOff: true })).toMatchObject({ kind: 'present', canAsk: false });
  });

  it('the server state wins over the Sunday guess: a working Sunday is a real absence', () => {
    expect(historyDayView({ date: '2026-10-04', inTime: null, state: 'absent', weekOff: false })).toMatchObject({ kind: 'absent', canAsk: true });
  });
});

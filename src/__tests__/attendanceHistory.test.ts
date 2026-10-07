import { historyDayView } from '../logic/attendanceHistory';

describe('historyDayView', () => {
  it('a punched day is present, whatever the HR state', () => {
    expect(historyDayView({ inTime: '2026-10-02T05:00:00.000Z', state: 'holiday' })).toMatchObject({ kind: 'present', badge: 'PRESENT', canAsk: true });
  });

  it('a holiday without a punch is a holiday, not an absence, and offers no Ask', () => {
    expect(historyDayView({ inTime: null, state: 'holiday', holidayName: 'Gandhi Jayanti' }))
      .toEqual({ kind: 'holiday', note: 'Holiday · Gandhi Jayanti', badge: 'HOLIDAY', canAsk: false });
  });

  it('a week off reads as a week off and offers no Ask', () => {
    expect(historyDayView({ inTime: null, state: 'weekOff' })).toMatchObject({ kind: 'weekOff', badge: 'WEEK OFF', canAsk: false });
  });

  it('paid leave reads as leave, half days say so', () => {
    expect(historyDayView({ inTime: null, state: 'leave', halfLeave: true })).toMatchObject({ kind: 'leave', note: 'Paid leave · half day', canAsk: false });
  });

  it('a real absence still offers Ask', () => {
    expect(historyDayView({ inTime: null, state: 'absent' })).toMatchObject({ kind: 'absent', badge: 'ABSENT', canAsk: true });
  });

  it('no state from the server falls back to the punch-only reading', () => {
    expect(historyDayView({ inTime: null })).toMatchObject({ kind: 'absent', canAsk: true });
  });
});

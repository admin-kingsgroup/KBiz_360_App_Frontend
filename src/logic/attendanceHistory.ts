import type { AttendanceHistoryEntry } from '../api/attendance';
import { isWeekOffEntry } from './attendance';

// How one Attendance-history day reads. The server stamps each entry with its HR state (the same
// classifier My Attendance and the ERP muster use), so a day with no punch is told apart:
// a holiday, a week off or paid leave is NOT an absence. A punched day is always "present" (the
// punch is the evidence). An entry with no state (older server, or the HR read failed) falls back
// to the punch-only reading — except a weekly off (the server's weekOff flag, else Sunday), which
// reads "Week off", as it has since 2026-10-06.
// Owner 2026-10-06: "don't show the option on Sunday" — ASK is never offered on a weekly off, even
// on one somebody worked (the punch still shows as PRESENT).

export type HistoryDayKind = 'present' | 'absent' | 'holiday' | 'weekOff' | 'leave' | 'noData' | 'notEmployed' | 'future';

export interface HistoryDayView {
  kind: HistoryDayKind;
  /** Second line for a day without a punch ('' for a punched day — its times are shown instead). */
  note: string;
  badge: string;
  /** Whether "Ask for a correction" is offered. Not on a day nobody was meant to work. */
  canAsk: boolean;
}

export function historyDayView(e: Pick<AttendanceHistoryEntry, 'date' | 'inTime' | 'state' | 'holidayName' | 'halfLeave' | 'weekOff'>): HistoryDayView {
  // A weekly off by the server's word (state or flag); with no state at all, the old Sunday reading.
  const offDay = e.state ? e.state === 'weekOff' || e.weekOff === true : isWeekOffEntry(e);
  if (e.inTime) return { kind: 'present', note: '', badge: 'PRESENT', canAsk: !offDay };
  if (!e.state && offDay) return { kind: 'weekOff', note: 'Week off', badge: 'WEEK OFF', canAsk: false };
  switch (e.state) {
    case 'holiday':
      return { kind: 'holiday', note: e.holidayName ? `Holiday · ${e.holidayName}` : 'Holiday', badge: 'HOLIDAY', canAsk: false };
    case 'weekOff':
      return { kind: 'weekOff', note: 'Week off', badge: 'WEEK OFF', canAsk: false };
    case 'leave':
      return { kind: 'leave', note: e.halfLeave ? 'Paid leave · half day' : 'Paid leave', badge: 'LEAVE', canAsk: false };
    case 'noData':
      return { kind: 'noData', note: 'Before your first punch', badge: 'NO DATA', canAsk: false };
    case 'notEmployed':
      return { kind: 'notEmployed', note: 'Not employed on this day', badge: '—', canAsk: false };
    case 'future':
      return { kind: 'future', note: 'Upcoming', badge: '—', canAsk: false };
    default:
      return { kind: 'absent', note: 'Absent · no check-in', badge: 'ABSENT', canAsk: true };
  }
}

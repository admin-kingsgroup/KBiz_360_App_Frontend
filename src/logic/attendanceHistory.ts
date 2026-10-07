import type { AttendanceHistoryEntry } from '../api/attendance';

// How one Attendance-history day reads. The server stamps each entry with its HR state (the same
// classifier My Attendance and the ERP muster use), so a day with no punch is told apart:
// a holiday, a week off or paid leave is NOT an absence. A punched day is always "present" (the
// punch is the evidence). An entry with no state (older server, or the HR read failed) falls back
// to the punch-only reading: no check-in = absent.

export type HistoryDayKind = 'present' | 'absent' | 'holiday' | 'weekOff' | 'leave' | 'noData' | 'notEmployed' | 'future';

export interface HistoryDayView {
  kind: HistoryDayKind;
  /** Second line for a day without a punch ('' for a punched day — its times are shown instead). */
  note: string;
  badge: string;
  /** Whether "Ask for a correction" is offered. Not on a day nobody was meant to work. */
  canAsk: boolean;
}

export function historyDayView(e: Pick<AttendanceHistoryEntry, 'inTime' | 'state' | 'holidayName' | 'halfLeave'>): HistoryDayView {
  if (e.inTime) return { kind: 'present', note: '', badge: 'PRESENT', canAsk: true };
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

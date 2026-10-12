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
// Owner 2026-10-12: an approved work-from-home day is PRESENT with no punch, shown "WFH"; a Saturday
// swap turns a working Saturday into a week off ('off') or a week-off Saturday into a working day
// ('work' — an unpunched one is a real absence, so ASK stays).

export type HistoryDayKind = 'present' | 'wfh' | 'absent' | 'holiday' | 'weekOff' | 'leave' | 'noData' | 'notEmployed' | 'future';

export interface HistoryDayView {
  kind: HistoryDayKind;
  /** Second line for a day without a punch ('' for a punched day — its times are shown instead). */
  note: string;
  badge: string;
  /** Whether "Ask for a correction" is offered. Not on a day nobody was meant to work. */
  canAsk: boolean;
}

export function historyDayView(e: Pick<AttendanceHistoryEntry, 'date' | 'inTime' | 'state' | 'holidayName' | 'halfLeave' | 'weekOff' | 'wfh' | 'swap'>): HistoryDayView {
  const view = baseView(e);
  // A swapped-in working Saturday with no punch says why it is a working day at all.
  if (e.swap === 'work' && !e.inTime) {
    if (view.kind === 'absent') return { ...view, note: 'Absent · swapped Saturday' };
    if (view.kind === 'leave' || view.kind === 'future') return { ...view, note: `${view.note} · swapped Saturday` };
  }
  return view;
}

function baseView(e: Pick<AttendanceHistoryEntry, 'date' | 'inTime' | 'state' | 'holidayName' | 'halfLeave' | 'weekOff' | 'wfh' | 'swap'>): HistoryDayView {
  // A weekly off by the server's word (state or flag); with no state at all, the old Sunday reading.
  const offDay = e.state ? e.state === 'weekOff' || e.weekOff === true : isWeekOffEntry(e);
  const weekOffNote = e.swap === 'off' ? 'Week off · Saturday swap' : 'Week off';
  if (e.inTime) return { kind: 'present', note: '', badge: 'PRESENT', canAsk: !offDay };
  // Approved work from home: present without a punch — nothing to correct.
  if (e.wfh && (!e.state || e.state === 'present')) return { kind: 'wfh', note: 'Work from home · approved', badge: 'WFH', canAsk: false };
  if (!e.state && offDay) return { kind: 'weekOff', note: weekOffNote, badge: 'WEEK OFF', canAsk: false };
  switch (e.state) {
    case 'holiday':
      return { kind: 'holiday', note: e.holidayName ? `Holiday · ${e.holidayName}` : 'Holiday', badge: 'HOLIDAY', canAsk: false };
    case 'weekOff':
      return { kind: 'weekOff', note: weekOffNote, badge: 'WEEK OFF', canAsk: false };
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

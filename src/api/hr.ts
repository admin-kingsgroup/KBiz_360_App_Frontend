import { apiFetch } from './client';

// HR self-service: paid-leave balance + applications (approved by HR on the ERP) and attendance
// regularisation requests (approved in-app by a manager). Identity is always the JWT's.

// The ERP's leaveBalance object — computed server-side, "as at the end of the as-of month".
export interface LeaveBalance {
  asOf: string; // 'YYYY-MM-DD' the balance was computed against
  asOfMonth: string; // 'YYYY-MM'
  openingBalance: number;
  openingAsOf: string; // 'YYYY-MM' HR keyed the opening against ('' = none keyed yet)
  monthlyAccrual: number; // days credited on the 1st of each month (2.5)
  policyStart: string;
  eligibleFrom: string;
  accrualFrom: string;
  creditedMonths: number;
  accrued: number;
  taken: number;
  takenDays: string[];
  balance: number; // the figure to show
  nextCreditOn: string; // 'YYYY-MM-01' ('' = no further credits — person left)
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveApplication {
  id: string;
  from: string; // 'YYYY-MM-DD'
  to: string;
  dayType: 'full' | 'half'; // half = one day, the other half worked (draws 0.5 when worked)
  days: number; // 0.5 for a half-day
  reason: string;
  status: LeaveStatus;
  appliedAt: string | null;
  decidedBy: string;
  decidedAt: string | null;
  decisionNote: string;
  markedDays: string[]; // days the ERP approval actually wrote as paid leave
  skippedDays: { day: string; reason: string }[];
}

export interface MyLeave {
  today: string;
  hasRecord: boolean; // false = no HR record linked to this login yet
  balance: LeaveBalance | null;
  applications: LeaveApplication[];
  features: { halfDay: boolean }; // server-gated: half-day asks are offered only once the ERP understands them
}

export const getMyLeave = (): Promise<MyLeave> => apiFetch('/api/hr/my-leave');
export const applyLeave = (body: { from: string; to: string; reason: string; dayType?: 'full' | 'half' }): Promise<LeaveApplication> =>
  apiFetch('/api/hr/my-leave', { method: 'POST', body });
export const cancelLeaveApplication = (id: string): Promise<LeaveApplication> =>
  apiFetch(`/api/hr/my-leave/${id}/cancel`, { method: 'PUT' });

// Regularisation: ask for one day's punch to be corrected; a manager approves (the day is then
// corrected through the same evidence-preserving path the admin time editor uses) or rejects.
export interface Regularization {
  id: string;
  userId: string;
  date: string; // 'YYYY-MM-DD'
  checkInAt: string; // ISO
  checkOutAt: string | null; // null = leave today open
  reason: string;
  status: LeaveStatus;
  appliedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  name?: string; // attached on the manager queue only
  branch?: string;
}

// ── My Attendance month view (the ERP muster, self-scoped) ──
export type DayState = 'present' | 'absent' | 'holiday' | 'weekOff' | 'leave' | 'future' | 'notEmployed' | 'noData';

export interface MonthDay {
  day: string; // 'YYYY-MM-DD'
  weekday: string;
  state: DayState;
  checkInAt: string | null;
  checkOutAt: string | null;
  method: string;
  hours: number | null;
  holiday: { name: string; kind: string } | null;
  weekOff: boolean;
  granted: boolean;
  onLeave: boolean;
  halfLeave: boolean; // half-day paid leave rides the day (present when worked, leave when not)
  open: boolean;
  autoClosed: boolean;
  adjusted: boolean;
  markedAbsent: boolean;
  late: boolean;
  lateMinutes: number | null;
}

export interface MonthSummary {
  calendarDays: number; workingDays: number; present: number; absent: number; leave: number;
  holidays: number; weekOffs: number; future: number; notEmployed: number; noData: number; halfLeaves: number;
  hoursTotal: number; avgHours: number; autoClosed: number; adjusted: number; stillOpen: number;
  lateMarks: number; workedOnHoliday: number; workedOnWeekOff: number; granted: number;
}

export interface MyAttendanceMonth {
  month: string; // 'YYYY-MM'
  today: string;
  tz: string;
  weekOffDays: number[];
  employee: {
    name: string; designation: string; branch: string; hasRecord: boolean;
    dateOfJoining: string; dateOfLeaving: string;
    weekOff: { days: number[]; saturdays: string } | null;
    shift: { start: string; end: string; graceMinutes: number } | null;
  };
  leaveBalance: LeaveBalance | null;
  exempt: boolean;
  days: MonthDay[];
  summary: MonthSummary;
  firstPunchDay: string;
  beforeFirstPunch: boolean;
}

export const getMyAttendanceMonth = (month?: string): Promise<MyAttendanceMonth> =>
  apiFetch(`/api/hr/my-attendance${month ? `?month=${month}` : ''}`);

// ── My Payslip (the salary register's own arithmetic, shown to its owner; indicative) ──
export interface Payslip {
  month: string;
  hasRecord: boolean;
  structured: boolean; // false = no salary structure keyed on the HR record
  indicative: true;
  employee: { name: string; empCode: string; designation: string; branch: string };
  days: {
    calendarDays: number; absentDays: number; leaveDays: number; notEmployedDays: number;
    lateMarks: number; noDataDays: number; payableDays: number; presentDays: number; lopDays: number;
  };
  salary: { basic: number; hra: number; otherAllowance: number; gross: number };
  earned: { basic: number; hra: number; otherAllowance: number; total: number };
  deductions: {
    pt: number; ptNote: string; tds: number;
    loanRecovered: number; loanShortfall: number;
    loanLines: { id: string; kind: string; reference: string; instalment: number; due: number; closing: number; instalmentNo: number; willClose: boolean }[];
    total: number;
  };
  netPay: number;
  lopAmount: number;
  leaveBalance: LeaveBalance | null;
  payMode: string;
}

export const getMyPayslip = (month?: string): Promise<Payslip> =>
  apiFetch(`/api/hr/my-payslip${month ? `?month=${month}` : ''}`);

// ── Holiday list for the caller's branch country ──
export interface HolidayRow { date: string; name: string; kind: 'closed' | 'optional'; movable: boolean; weekday: string }
export interface HolidayList {
  year: number;
  country: string;
  branch: string;
  published: boolean;
  holidays: HolidayRow[];
  notice: { issuedBy: string; issuedOn: string; company: string; notes: string[] } | null;
  today: string;
}

export const getHolidays = (year?: number): Promise<HolidayList> =>
  apiFetch(`/api/hr/holidays${year ? `?year=${year}` : ''}`);

export const getMyRegularizations = (): Promise<Regularization[]> => apiFetch('/api/hr/regularizations');
export const requestRegularization = (body: { date: string; checkInAt: string; checkOutAt: string | null; reason: string }): Promise<Regularization> =>
  apiFetch('/api/hr/regularizations', { method: 'POST', body });
export const cancelRegularization = (id: string): Promise<Regularization> =>
  apiFetch(`/api/hr/regularizations/${id}/cancel`, { method: 'PUT' });
// Manager-only.
export const getPendingRegularizations = (): Promise<Regularization[]> => apiFetch('/api/hr/regularizations/pending');
export const decideRegularization = (id: string, action: 'approve' | 'reject', note?: string): Promise<Regularization> =>
  apiFetch(`/api/hr/regularizations/${id}/decision`, { method: 'PUT', body: { action, ...(note ? { note } : {}) } });

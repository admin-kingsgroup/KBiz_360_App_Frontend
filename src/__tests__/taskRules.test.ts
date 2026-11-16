import type { Task } from '../api/tasks';
import { actionLabel, commentRequired, counterpart, historyLine, isOverdue, needsMe, primaryAction, repeatLabel, STATUS_LABEL, validateTaskForm } from '../logic/taskRules';

const NOW = new Date(2026, 10, 18, 10, 0, 0);
const iso = (y: number, mo: number, d: number, h = 18): string => new Date(y, mo, d, h).toISOString();
const t = (over: Partial<Task> = {}): Pick<Task, 'status' | 'dueAt' | 'assignedTo' | 'assignedBy' | 'isSelf'> => ({
  status: 'accepted', dueAt: iso(2026, 10, 25), assignedTo: { id: 'satish', name: 'Satish' }, assignedBy: { id: 'afshin', name: 'Afshin' }, isSelf: false, ...over,
});

describe('task status words', () => {
  it('uses the spec labels exactly', () => {
    expect(STATUS_LABEL).toEqual({
      assigned: 'Assigned', date_change_requested: 'Date change requested', accepted: 'Accepted', in_progress: 'In progress',
      waiting: 'Waiting on someone', done: 'Done – to close', closed: 'Closed', reopened: 'Reopened', cancelled: 'Cancelled',
    });
  });
  it('needs a comment for a date change, waiting, reopen and cancel only', () => {
    expect(['date_change_requested', 'waiting', 'reopened', 'cancelled'].every((s) => commentRequired(s as never))).toBe(true);
    expect(['accepted', 'in_progress', 'done', 'closed'].some((s) => commentRequired(s as never))).toBe(false);
  });
  it('words the buttons for where the task is coming from', () => {
    expect(actionLabel('accepted', { status: 'assigned', isSelf: false })).toBe('Accept');
    expect(actionLabel('accepted', { status: 'date_change_requested', isSelf: false })).toBe('Approve new date');
    expect(actionLabel('in_progress', { status: 'waiting', isSelf: false })).toBe('Back in progress');
    expect(actionLabel('done', { status: 'in_progress', isSelf: true })).toBe('Done');
    expect(actionLabel('done', { status: 'in_progress', isSelf: false })).toBe('Mark done');
  });
  it('picks the forward action as the main button', () => {
    expect(primaryAction(['cancelled', 'accepted', 'date_change_requested'])).toBe('accepted');
    expect(primaryAction(['reopened', 'closed'])).toBe('closed');
    expect(primaryAction(['cancelled'])).toBeNull();
  });
});

describe('overdue and what needs me', () => {
  it('overdue = open and past due; done, closed and undated never are', () => {
    const now = NOW.getTime();
    expect(isOverdue({ status: 'in_progress', dueAt: iso(2026, 10, 17) }, now)).toBe(true);
    expect(isOverdue({ status: 'done', dueAt: iso(2026, 10, 17) }, now)).toBe(false);
    expect(isOverdue({ status: 'closed', dueAt: iso(2026, 10, 17) }, now)).toBe(false);
    expect(isOverdue({ status: 'accepted', dueAt: null }, now)).toBe(false);
  });
  it('the assignee: not yet accepted, sent back, or overdue', () => {
    const now = NOW.getTime();
    expect(needsMe(t({ status: 'assigned' }), 'satish', now)).toBe(true);
    expect(needsMe(t({ status: 'reopened' }), 'satish', now)).toBe(true);
    expect(needsMe(t({ status: 'in_progress', dueAt: iso(2026, 10, 17) }), 'satish', now)).toBe(true);
    expect(needsMe(t({ status: 'in_progress' }), 'satish', now)).toBe(false);
  });
  it('the assigner: done (waiting for my check) or a new date asked for', () => {
    const now = NOW.getTime();
    expect(needsMe(t({ status: 'done' }), 'afshin', now)).toBe(true);
    expect(needsMe(t({ status: 'date_change_requested' }), 'afshin', now)).toBe(true);
    expect(needsMe(t({ status: 'in_progress' }), 'afshin', now)).toBe(false);
  });
  it('names the other side of the task', () => {
    expect(counterpart(t(), 'satish')).toEqual({ label: 'From', name: 'Afshin' });
    expect(counterpart(t(), 'afshin')).toEqual({ label: 'To', name: 'Satish' });
    expect(counterpart(t({ isSelf: true, assignedTo: { id: 'me', name: 'Me' }, assignedBy: { id: 'me', name: 'Me' } }), 'me')).toEqual({ label: 'For', name: 'Myself' });
  });
});

describe('task form check', () => {
  const base = { title: 'Bank reco', description: '', assignedTo: 'satish', branchId: 'b1', dueDate: '2026-11-19', dueTime: null };
  it('passes a complete form', () => {
    expect(validateTaskForm(base, NOW)).toBeNull();
  });
  it('title is required and at most 120 characters', () => {
    expect(validateTaskForm({ ...base, title: '  ' }, NOW)).toBe('Add a title');
    expect(validateTaskForm({ ...base, title: 'x'.repeat(121) }, NOW)).toMatch(/120/);
    expect(validateTaskForm({ ...base, title: 'x'.repeat(120) }, NOW)).toBeNull();
  });
  it('details at most 2,000 characters', () => {
    expect(validateTaskForm({ ...base, description: 'x'.repeat(2001) }, NOW)).toMatch(/2,000/);
  });
  it('the due date cannot be in the past; today needs a later time (6 pm by default)', () => {
    expect(validateTaskForm({ ...base, dueDate: '2026-11-17' }, NOW)).toMatch(/past/);
    expect(validateTaskForm({ ...base, dueDate: '2026-11-18' }, NOW)).toBeNull(); // 6 pm today
    expect(validateTaskForm({ ...base, dueDate: '2026-11-18', dueTime: { hour: 9, minute: 0 } }, NOW)).toMatch(/gone by/);
  });
  it('needs a person and a business or branch', () => {
    expect(validateTaskForm({ ...base, assignedTo: null }, NOW)).toMatch(/who/);
    expect(validateTaskForm({ ...base, branchId: null }, NOW)).toMatch(/branch/);
  });
});

describe('repeat and history words', () => {
  it('repeat rules', () => {
    expect(repeatLabel(null)).toBe('Does not repeat');
    expect(repeatLabel({ kind: 'weekly', days: [4, 1] })).toBe('Every week · Mon, Thu');
    expect(repeatLabel({ kind: 'monthly', dayOfMonth: 31 })).toBe('Every month · day 31');
  });
  it('history rows, with stored user ids turned into names', () => {
    expect(historyLine({ field: 'status', oldValue: 'in_progress', newValue: 'done' })).toBe('Done – to close');
    const id = '0123456789abcdef01234567';
    expect(historyLine({ field: 'assignedTo', oldValue: null, newValue: id }, (x) => (x === id ? 'Faiz' : undefined))).toBe('Reassigned to Faiz');
  });
});

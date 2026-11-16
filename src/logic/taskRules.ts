import type { Task, TaskPriority, TaskStatus } from '../api/tasks';

// Words, colours and small rules for tasks (spec 2026-11-16, section 4). Pure — no RN, no stores.
// The SERVER decides who may do what (Task.actions); this file only names things and draws them.

export const STATUS_LABEL: Record<TaskStatus, string> = {
  assigned: 'Assigned',
  date_change_requested: 'Date change requested',
  accepted: 'Accepted',
  in_progress: 'In progress',
  waiting: 'Waiting on someone',
  done: 'Done – to close',
  closed: 'Closed',
  reopened: 'Reopened',
  cancelled: 'Cancelled',
};

// Pill colours: text on a soft fill of the same hue.
export const STATUS_COLOR: Record<TaskStatus, string> = {
  assigned: '#4F8BFF',
  date_change_requested: '#E8A13A',
  accepted: '#0B6E60',
  in_progress: '#0E7490',
  waiting: '#A4400B',
  done: '#6D3FD0',
  closed: '#5B6472',
  reopened: '#E3674E',
  cancelled: '#98A2B3',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = { urgent: 'Urgent', high: 'High', normal: 'Normal' };
export const PRIORITY_COLOR: Record<TaskPriority, string> = { urgent: '#DC2626', high: '#E8A13A', normal: '#5B6472' };
export const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'normal'];
const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2 };
export const priorityRank = (p: TaskPriority): number => PRIORITY_RANK[p] ?? 2;

export const OPEN_STATUSES: TaskStatus[] = ['assigned', 'date_change_requested', 'accepted', 'in_progress', 'waiting', 'reopened'];
export const ALL_STATUSES: TaskStatus[] = [...OPEN_STATUSES, 'done', 'closed', 'cancelled'];

/** Still being worked on (not finished, closed or cancelled). */
export const isOpenStatus = (s: TaskStatus): boolean => OPEN_STATUSES.includes(s);
/** Closed or cancelled — the task is over. Its chat (if one was started) leaves the chat list and is read-only. */
export const isFinished = (s: TaskStatus): boolean => s === 'closed' || s === 'cancelled';

/** These four need a comment: the server refuses them without one. */
export const COMMENT_REQUIRED: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['date_change_requested', 'waiting', 'reopened', 'cancelled']);
export const commentRequired = (to: TaskStatus): boolean => COMMENT_REQUIRED.has(to);

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};
export const dueMs = (t: Pick<Task, 'dueAt'>): number | null => ms(t.dueAt);

/**
 * Overdue is a flag, never a status: an OPEN task whose due time has passed. "Done – to close" is not
 * overdue (the work is finished), and a task with no due date (an old undated reminder) never is.
 */
export function isOverdue(t: Pick<Task, 'status' | 'dueAt'>, now: number = Date.now()): boolean {
  const due = dueMs(t);
  return due !== null && isOpenStatus(t.status) && due < now;
}

/** The button a person presses to move a task to `to` — worded for where it is coming from. */
export function actionLabel(to: TaskStatus, t: Pick<Task, 'status' | 'isSelf'>): string {
  switch (to) {
    case 'accepted': return t.status === 'date_change_requested' ? 'Approve new date' : 'Accept';
    case 'date_change_requested': return 'Ask for a new date';
    case 'in_progress': return t.status === 'waiting' ? 'Back in progress' : t.status === 'reopened' ? 'Start again' : 'Start';
    case 'waiting': return 'Waiting on someone';
    case 'done': return t.isSelf ? 'Done' : 'Mark done';
    case 'closed': return 'Close task';
    case 'reopened': return 'Reopen';
    case 'cancelled': return 'Cancel task';
    default: return STATUS_LABEL[to];
  }
}

/** The question the comment sheet asks before a status change. */
export function commentPrompt(to: TaskStatus): string {
  switch (to) {
    case 'date_change_requested': return 'Why do you need a new date?';
    case 'waiting': return 'Who or what are you waiting on?';
    case 'reopened': return 'What still needs doing?';
    case 'cancelled': return 'Why is it no longer needed?';
    default: return 'Add a comment (optional)';
  }
}

// ── the task's chat (owner, 2026-11-17) ──
// No chat comes with a task any more. The person who gave it, or the one doing it, starts one from the
// task while it is open. It stays open through "Done – to close"; when the task is closed or cancelled
// the server takes it off everyone's chat list and it can only be read (from the task). Reopening the
// task puts it back. Watchers join a chat once it exists; a manager above the assignee reads it.
export type TaskChatButtonKind = 'start' | 'open' | 'read' | 'none';
export interface TaskChatButton { kind: TaskChatButtonKind; label: string; sub: string }

export function taskChatButton(t: Pick<Task, 'chatId' | 'status' | 'myRole'> & { watchers?: Task['watchers'] }): TaskChatButton {
  const finished = isFinished(t.status);
  const party = t.myRole === 'assigner' || t.myRole === 'assignee' || t.myRole === 'both';
  if (!t.chatId) {
    // A personal to-do with nobody watching: a chat would hold only you — nothing to start.
    if (t.myRole === 'both' && !(t.watchers?.length)) return { kind: 'none', label: 'No chat', sub: 'A personal to-do has no chat — add a watcher to talk it through.' };
    if (!finished && party) return { kind: 'start', label: 'Start chat', sub: 'Talk it through here — every status change is posted in it' };
    return { kind: 'none', label: 'No chat yet', sub: finished ? 'No chat was started for this task.' : 'The person who gave the task, or the one doing it, can start one.' };
  }
  if (finished) return { kind: 'read', label: 'View chat (read-only)', sub: 'The task is closed — its chat can be read, not written to' };
  if (t.myRole === 'viewer') return { kind: 'read', label: 'Read chat', sub: 'Read-only until you watch the task' };
  return { kind: 'open', label: 'Open chat', sub: 'Discuss the task — every status change is posted here' };
}

/** Destructive-looking buttons (drawn in red). */
export const isDangerAction = (to: TaskStatus): boolean => to === 'cancelled';
/** The main action — drawn filled; the rest are outlined. */
export function primaryAction(actions: TaskStatus[]): TaskStatus | null {
  const order: TaskStatus[] = ['accepted', 'in_progress', 'done', 'closed'];
  return order.find((a) => actions.includes(a)) ?? null;
}

/**
 * Does this task need ME to act? Drives the Tasks tab badge:
 * - assigned to me and not yet accepted, or sent back to me (reopened), or overdue;
 * - given by me to someone else and waiting for my check (done) or asking me for a new date.
 */
export function needsMe(t: Pick<Task, 'status' | 'dueAt' | 'assignedTo' | 'assignedBy'>, meId: string, now: number = Date.now()): boolean {
  const mine = t.assignedTo.id === meId;
  const gaveIt = t.assignedBy.id === meId && t.assignedTo.id !== meId;
  if (mine && (t.status === 'assigned' || t.status === 'reopened' || isOverdue(t, now))) return true;
  if (gaveIt && (t.status === 'done' || t.status === 'date_change_requested')) return true;
  return false;
}

/** "Satish" / "Myself" — the other side of the task as the list row shows it. */
export function counterpart(t: Pick<Task, 'assignedTo' | 'assignedBy' | 'isSelf'>, meId: string): { label: string; name: string } {
  if (t.isSelf || (t.assignedTo.id === meId && t.assignedBy.id === meId)) return { label: 'For', name: 'Myself' };
  if (t.assignedTo.id === meId) return { label: 'From', name: t.assignedBy.name };
  if (t.assignedBy.id === meId) return { label: 'To', name: t.assignedTo.name };
  return { label: 'To', name: `${t.assignedTo.name} · from ${t.assignedBy.name}` };
}

/** "Mon 18 Nov · 6:00 PM" — the due moment in the phone's own clock. */
export function dueLabel(t: Pick<Task, 'dueAt'>): string {
  const due = dueMs(t);
  if (due === null) return 'No due date';
  const d = new Date(due);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

const pad = (n: number): string => String(n).padStart(2, '0');
/** Local calendar day of a moment, 'YYYY-MM-DD'. */
export const dayKeyOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 18:00 → '18:00'. */
export const hhmmOf = (t: { hour: number; minute: number }): string => `${pad(t.hour)}:${pad(t.minute)}`;

/** The spec's default due time: 6 pm (the server applies it in the assignee's zone). */
export const DEFAULT_DUE_TIME = { hour: 18, minute: 0 };

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

/** Form check for create/edit — returns the first problem, or null. */
export function validateTaskForm(f: { title: string; description: string; assignedTo: string | null; branchId: string | null; dueDate: string | null; dueTime: { hour: number; minute: number } | null }, now: Date = new Date()): string | null {
  const title = f.title.trim();
  if (!title) return 'Add a title';
  if (title.length > TITLE_MAX) return `Keep the title under ${TITLE_MAX} characters`;
  if (f.description.length > DESCRIPTION_MAX) return `Keep the details under ${DESCRIPTION_MAX.toLocaleString('en-US')} characters`;
  if (!f.assignedTo) return 'Choose who it is for';
  if (!f.branchId) return 'Choose the business or branch';
  if (!f.dueDate) return 'Choose a due date';
  if (f.dueDate < dayKeyOf(now)) return 'The due date cannot be in the past';
  if (f.dueDate === dayKeyOf(now)) {
    const t = f.dueTime ?? DEFAULT_DUE_TIME;
    const [y, m, d] = f.dueDate.split('-').map(Number);
    if (new Date(y, m - 1, d, t.hour, t.minute).getTime() <= now.getTime()) return 'That time has already gone by — pick a later time';
  }
  return null;
}

/** Repeat rule in words. */
export function repeatLabel(r: Task['repeat']): string {
  if (!r || r.kind === 'none') return 'Does not repeat';
  if (r.kind === 'daily') return 'Every day';
  if (r.kind === 'weekly') {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = [...r.days].sort((a, b) => a - b).map((d) => names[d] ?? '').filter(Boolean);
    return days.length ? `Every week · ${days.join(', ')}` : 'Every week';
  }
  return `Every month · day ${r.dayOfMonth}`;
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;
/** The history row in words: "Done – to close". `nameOf` turns a stored user id into a name. */
export function historyLine(h: { field: string; oldValue: string | null; newValue: string | null }, nameOf?: (id: string) => string | undefined): string {
  const who = (v: string | null): string | null => {
    if (!v) return v;
    return v.split(',').map((part) => {
      const id = part.trim();
      return OBJECT_ID.test(id) ? nameOf?.(id) ?? 'someone' : id;
    }).join(', ');
  };
  switch (h.field) {
    case 'created': return 'Created the task';
    case 'status': return `${h.newValue && h.newValue in STATUS_LABEL ? STATUS_LABEL[h.newValue as TaskStatus] : h.newValue ?? ''}`;
    case 'dueAt': return `Due date ${h.oldValue ? `${fmtIso(h.oldValue)} → ` : ''}${h.newValue ? fmtIso(h.newValue) : 'cleared'}`;
    case 'priority': return `Priority ${h.oldValue ? `${PRIORITY_LABEL[h.oldValue as TaskPriority] ?? h.oldValue} → ` : ''}${PRIORITY_LABEL[h.newValue as TaskPriority] ?? h.newValue ?? ''}`;
    case 'title': return `Title changed to "${h.newValue ?? ''}"`;
    case 'description': return 'Details changed';
    case 'assignedTo': return `Reassigned${h.newValue ? ` to ${who(h.newValue)}` : ''}`;
    case 'watchers': return h.newValue ? `Watchers: ${who(h.newValue)}` : 'Watchers changed';
    case 'attachment': return `Attached ${h.newValue ?? 'a file'}`;
    case 'repeat': return 'Repeat changed';
    case 'branchId': return 'Business / branch changed';
    case 'link': return 'Link changed';
    default: return `${h.field} changed`;
  }
}
function fmtIso(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

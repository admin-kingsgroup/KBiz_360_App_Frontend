import type { Task, TaskPriority, TaskStatus } from '../api/tasks';
import { dueMs, isFinished, isOverdue, priorityRank } from './taskRules';

// How the Tasks lists are cut into sections (spec 2026-11-16, section 7). Pure — no RN, no stores.
//   My tasks:        Overdue · Due today · This week · Later · Done – waiting to close
//   Assigned by me:  Waiting for my check (done) first, then Overdue · Due today · This week · Later
// "This week" = after today, up to the end of this Sunday (the phone's own calendar). A task with no
// due date (an old undated reminder) files under Later, after everything dated. Closed and cancelled
// tasks only appear when the Closed filter is on, in their own two sections at the end.

export type SectionKey = 'check' | 'overdue' | 'today' | 'week' | 'later' | 'done' | 'closed' | 'cancelled';
export interface TaskSection { key: SectionKey; title: string; tasks: Task[] }

export const SECTION_TITLE: Record<SectionKey, string> = {
  check: 'Waiting for my check',
  overdue: 'Overdue',
  today: 'Due today',
  week: 'This week',
  later: 'Later',
  done: 'Done – waiting to close',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const MINE_ORDER: SectionKey[] = ['overdue', 'today', 'week', 'later', 'done', 'closed', 'cancelled'];
const ASSIGNED_ORDER: SectionKey[] = ['check', 'overdue', 'today', 'week', 'later', 'closed', 'cancelled'];

/** End of today, and end of this week's Sunday, on the phone's clock. */
export function dayBounds(now: number): { endOfToday: number; endOfWeek: number } {
  const d = new Date(now);
  const endOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
  const daysToSunday = (7 - d.getDay()) % 7; // Sunday → 0
  const endOfWeek = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysToSunday, 23, 59, 59, 999).getTime();
  return { endOfToday, endOfWeek };
}

/** Which time bucket an open task falls in. */
export function timeBucket(t: Pick<Task, 'status' | 'dueAt'>, now: number): 'overdue' | 'today' | 'week' | 'later' {
  if (isOverdue(t, now)) return 'overdue';
  const due = dueMs(t);
  if (due === null) return 'later';
  const { endOfToday, endOfWeek } = dayBounds(now);
  if (due <= endOfToday) return 'today';
  if (due <= endOfWeek) return 'week';
  return 'later';
}

/** Soonest due first (undated last); on a tie, Urgent before High before Normal, then newest. */
export function compareTasks(a: Task, b: Task): number {
  const da = dueMs(a) ?? Number.MAX_SAFE_INTEGER;
  const db = dueMs(b) ?? Number.MAX_SAFE_INTEGER;
  if (da !== db) return da - db;
  const p = priorityRank(a.priority) - priorityRank(b.priority);
  if (p !== 0) return p;
  return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
}

function build(tasks: Task[], order: SectionKey[], keyOf: (t: Task) => SectionKey): TaskSection[] {
  const by = new Map<SectionKey, Task[]>();
  for (const t of tasks) {
    const k = keyOf(t);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(t);
  }
  return order
    .filter((k) => (by.get(k)?.length ?? 0) > 0)
    .map((k) => ({ key: k, title: SECTION_TITLE[k], tasks: by.get(k)!.sort(k === 'closed' || k === 'cancelled' ? compareFinished : compareTasks) }));
}

// Finished tasks read newest first.
const finishedAt = (t: Task): string => t.closedAt ?? t.cancelledAt ?? t.doneAt ?? t.createdAt ?? '';
const compareFinished = (a: Task, b: Task): number => finishedAt(b).localeCompare(finishedAt(a));

const finishedKey = (s: TaskStatus): SectionKey | null => (s === 'closed' ? 'closed' : s === 'cancelled' ? 'cancelled' : null);

/** My tasks (and Watching / Team): Overdue, Due today, This week, Later, Done – waiting to close. */
export function groupMine(tasks: Task[], now: number = Date.now()): TaskSection[] {
  return build(tasks, MINE_ORDER, (t) => finishedKey(t.status) ?? (t.status === 'done' ? 'done' : timeBucket(t, now)));
}

/** Assigned by me: the same, with the tasks marked done first under "Waiting for my check". */
export function groupAssigned(tasks: Task[], now: number = Date.now()): TaskSection[] {
  return build(tasks, ASSIGNED_ORDER, (t) => finishedKey(t.status) ?? (t.status === 'done' ? 'check' : timeBucket(t, now)));
}

export interface TaskFilters {
  personId?: string | null;
  branchId?: string | null;
  priority?: TaskPriority | null;
  status?: TaskStatus | null;
  dueFrom?: string | null; // 'YYYY-MM-DD', inclusive
  dueTo?: string | null; // 'YYYY-MM-DD', inclusive
  q?: string;
}

const dayStart = (day: string): number => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
const dayEnd = (day: string): number => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime(); };

/** The list filters (person, business/branch, priority, status, due range) and the title search. */
export function filterTasks(tasks: Task[], f: TaskFilters): Task[] {
  const q = (f.q ?? '').trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.personId && t.assignedTo.id !== f.personId && t.assignedBy.id !== f.personId) return false;
    if (f.branchId && t.branchId !== f.branchId && t.companyId !== f.branchId) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.dueFrom || f.dueTo) {
      const due = dueMs(t);
      if (due === null) return false;
      if (f.dueFrom && due < dayStart(f.dueFrom)) return false;
      if (f.dueTo && due > dayEnd(f.dueTo)) return false;
    }
    if (q && !t.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** How many filters are on (search excluded) — the badge on the Filter button. */
export const activeFilterCount = (f: TaskFilters): number =>
  [f.personId, f.branchId, f.priority, f.status, f.dueFrom || f.dueTo].filter(Boolean).length;

/** One task per id — merging lists from several views (mine, assigned, watching, team). Later wins. */
export function mergeTasks(...lists: Task[][]): Task[] {
  const by = new Map<string, Task>();
  for (const list of lists) for (const t of list) by.set(t.id, t);
  return [...by.values()];
}

// ── task chats in the chat list ──
// A task's chat never locks (decision 4). Once the task is closed or cancelled the chat files under
// "Closed task chats"; until then it sits with the other chats and under the Task chats filter.
export interface TaskChatLike { type: string; taskId?: string | null; taskStatus?: string | null }
/** The task status for a task chat: what the conversation carries, else what the tasks we loaded say. */
export function taskChatStatus(c: TaskChatLike, statusByTaskId: Record<string, TaskStatus | undefined>): TaskStatus | null {
  if (c.type !== 'task') return null;
  if (c.taskStatus) return c.taskStatus as TaskStatus;
  return c.taskId ? statusByTaskId[c.taskId] ?? null : null;
}
export const isClosedTaskChat = (c: TaskChatLike, statusByTaskId: Record<string, TaskStatus | undefined>): boolean => {
  const s = taskChatStatus(c, statusByTaskId);
  return !!s && isFinished(s);
};

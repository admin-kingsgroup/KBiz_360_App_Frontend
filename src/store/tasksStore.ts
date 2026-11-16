import { create } from 'zustand';
import { listTaskNotifications, listTasks, type Task, type TaskState, type TaskStatus, type TaskView } from '../api/tasks';
import type { ReminderTopItem } from './reminderBadgeStore';
import { dueMs, isOpenStatus, needsMe } from '../logic/taskRules';
import { compareTasks } from '../logic/taskGroups';

// Tasks state (spec 2026-11-16). The server is the source of truth: lists are fetched per view
// (mine / assigned / watching / team) and per state (open / closed), and replaced wholesale. A task
// changed in one place (detail screen, chat quick action) is upserted into every list holding it, so
// the list behind the screen is already right when the user goes back.
//
// Also the Tasks tab badge (tasks that need ME) and the home-screen widget's list, which used to read
// the reminders (services/widget.ts) — the widget's JSON keeps its `reminders` shape, so the native
// widgets need no rebuild.

const listKey = (view: TaskView, state: TaskState): string => `${view}:${state}`;
const WIDGET_CAP = 40;

interface TasksState {
  lists: Record<string, Task[]>;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  /** Last known status of every task seen, by id — lets the chat list file a task's chat as open or closed. */
  statusById: Record<string, TaskStatus>;
  /** Tasks needing my action (badge). */
  badge: number;
  /** My open tasks (assigned to me, incl. personal to-dos) — the widget's count. */
  mineOpen: number;
  /** My open tasks, soonest first, in the widget's item shape. */
  top: ReminderTopItem[];
  /** The last task the server said changed (socket 'task:update') — open screens showing it refetch. */
  touched: { taskId: string | null; at: number };
  /** Unread in-app task notifications (the bell on the Tasks screen). */
  notifUnread: number;
  load: (view: TaskView, state?: TaskState) => Promise<Task[]>;
  markTouched: (taskId: string | null | undefined) => void;
  refreshNotifications: () => Promise<void>;
  upsert: (task: Task) => void;
  refreshBadge: (meId: string | null | undefined) => Promise<void>;
  reset: () => void;
}

const toTopItem = (t: Task, meId: string): ReminderTopItem => ({
  id: t.id,
  text: t.title.slice(0, 160),
  when: '',
  dueAt: dueMs(t),
  by: t.assignedBy.id !== meId ? t.assignedBy.name : '',
});

const withStatuses = (cur: Record<string, TaskStatus>, tasks: Task[]): Record<string, TaskStatus> => {
  const next = { ...cur };
  for (const t of tasks) next[t.id] = t.status;
  return next;
};

export const useTasksStore = create<TasksState>((set, get) => ({
  lists: {},
  loading: {},
  errors: {},
  statusById: {},
  badge: 0,
  mineOpen: 0,
  top: [],
  touched: { taskId: null, at: 0 },
  notifUnread: 0,
  markTouched: (taskId) => set({ touched: { taskId: taskId ?? null, at: Date.now() } }),
  refreshNotifications: async () => {
    try {
      const list = await listTaskNotifications();
      set({ notifUnread: list.filter((n) => !n.opened).length });
    } catch { /* keep the last value */ }
  },
  load: async (view, state = 'open') => {
    const key = listKey(view, state);
    set((s) => ({ loading: { ...s.loading, [key]: true }, errors: { ...s.errors, [key]: null } }));
    try {
      const tasks = await listTasks({ view, state });
      set((s) => ({ lists: { ...s.lists, [key]: tasks }, loading: { ...s.loading, [key]: false }, statusById: withStatuses(s.statusById, tasks) }));
      return tasks;
    } catch (e) {
      set((s) => ({ loading: { ...s.loading, [key]: false }, errors: { ...s.errors, [key]: (e as Error).message || 'Could not load tasks' } }));
      return get().lists[key] ?? [];
    }
  },
  upsert: (task) => set((s) => {
    const lists: Record<string, Task[]> = {};
    for (const [key, list] of Object.entries(s.lists)) {
      const state = key.split(':')[1] as TaskState;
      const belongs = state === 'all' || (state === 'open' ? !['closed', 'cancelled'].includes(task.status) : ['closed', 'cancelled'].includes(task.status));
      const had = list.some((t) => t.id === task.id);
      if (had && belongs) lists[key] = list.map((t) => (t.id === task.id ? task : t));
      else if (had) lists[key] = list.filter((t) => t.id !== task.id);
      else lists[key] = list;
    }
    return { lists, statusById: { ...s.statusById, [task.id]: task.status } };
  }),
  refreshBadge: async (meId) => {
    if (!meId) return;
    try {
      const [mine, assigned] = await Promise.all([listTasks({ view: 'mine', state: 'open' }), listTasks({ view: 'assigned', state: 'open' })]);
      const now = Date.now();
      const ids = new Set<string>();
      for (const t of [...mine, ...assigned]) if (needsMe(t, meId, now)) ids.add(t.id);
      const mineOpenList = mine.filter((t) => t.assignedTo.id === meId && isOpenStatus(t.status)).sort(compareTasks);
      set((s) => ({
        badge: ids.size,
        mineOpen: mineOpenList.length,
        top: mineOpenList.slice(0, WIDGET_CAP).map((t) => toTopItem(t, meId)),
        lists: { ...s.lists, [listKey('mine', 'open')]: mine, [listKey('assigned', 'open')]: assigned },
        statusById: withStatuses(s.statusById, [...mine, ...assigned]),
      }));
    } catch {
      /* offline / older server without /api/tasks — keep the last value */
    }
  },
  reset: () => set({ lists: {}, loading: {}, errors: {}, statusById: {}, badge: 0, mineOpen: 0, top: [], touched: { taskId: null, at: 0 }, notifUnread: 0 }),
}));

export { listKey };

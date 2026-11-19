import { apiFetch } from './client';
import type { ChatMessage } from './chat';

// Smart Connect Tasks (spec 2026-11-16) — the app backend's /api/tasks. Tasks replace reminders:
// one assignee (or yourself), watchers, a status flow, a history and a chat of their own.
// The server enforces every rule; `actions` on a task is the list of statuses the CALLER may move it
// to right now, so the app never re-derives permissions — it only draws those buttons.

export type TaskStatus =
  | 'assigned'
  | 'date_change_requested'
  | 'accepted'
  | 'in_progress'
  | 'waiting'
  | 'done'
  | 'closed'
  | 'reopened'
  | 'cancelled';
export type TaskPriority = 'urgent' | 'high' | 'normal';
// Owner, 2026-11-19: the branch group a task is shared in — "BOM Operations" / "BOM Accounts".
export type TaskDepartment = 'operations' | 'accounts';
export type RepeatRule =
  | { kind: 'none' }
  | { kind: 'daily' }
  | { kind: 'weekly'; days: number[] } // 0 = Sunday
  | { kind: 'monthly'; dayOfMonth: number }; // 1–31, clamps to the month's last day
export type TaskRole = 'assigner' | 'assignee' | 'both' | 'watcher' | 'viewer';
// 'all' = everything the caller may see (theirs, given, watched, their team's) — the dashboard counts
// are computed from exactly this, so its drill-downs use view=all with the same flag/person/branch.
export type TaskView = 'mine' | 'assigned' | 'watching' | 'team' | 'all';
export type TaskFlag = 'overdue' | 'due_today' | 'waiting_check';
export type TaskState = 'open' | 'closed' | 'all';

export interface TaskPerson { id: string; name: string }
export interface TaskAttachment { url: string; name: string; size: number; mime: string; uploadedBy?: string; uploadedAt?: string }
export interface TaskLink { label: string; url: string }

export interface Task {
  id: string;
  title: string;
  description: string;
  companyId: string | null;
  companyName: string | null;
  branchId: string | null;
  branchName: string | null;
  assignedTo: TaskPerson;
  assignedBy: TaskPerson;
  watchers: TaskPerson[];
  priority: TaskPriority;
  // Optional: servers before 2026-11-19 do not send it; null on older tasks.
  department?: TaskDepartment | null;
  dueAt: string | null; // ISO; null only on tasks converted from an undated reminder
  status: TaskStatus;
  requestedDueAt: string | null; // the date the assignee asked for (status date_change_requested)
  waitingOn: string | null; // who or what it is blocked on (status waiting)
  attachments: TaskAttachment[];
  repeat: RepeatRule | null;
  link: TaskLink | null;
  chatId: string | null;
  unread: number; // unread messages in the task's chat, for the caller (0 when not a member)
  overdue: boolean;
  isSelf: boolean;
  myRole: TaskRole;
  actions: TaskStatus[];
  canEdit: boolean;
  canReassign: boolean;
  source?: 'app' | 'erp' | 'reminder';
  createdAt: string;
  acceptedAt: string | null;
  doneAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
}

export interface TaskHistoryItem {
  id: string;
  userId: string;
  userName?: string;
  field: string; // created | status | title | description | dueAt | priority | branchId | assignedTo | watchers | attachment | repeat | link
  oldValue: string | null;
  newValue: string | null;
  comment: string | null;
  at: string; // when it happened (ISO)
  createdAt?: string; // older name for `at`
}

/** When a history row happened, whichever name the server used. */
export const historyAt = (h: Pick<TaskHistoryItem, 'at' | 'createdAt'>): string => h.at ?? h.createdAt ?? '';

export interface TaskDetail { task: Task; history: TaskHistoryItem[] }

export interface TaskListParams {
  view: TaskView;
  state?: TaskState;
  flag?: TaskFlag;
  status?: TaskStatus[];
  priority?: TaskPriority;
  branchId?: string;
  companyId?: string;
  personId?: string;
  dueFrom?: string;
  dueTo?: string;
  q?: string;
}

export interface TaskDashboard {
  counts: { open: number; dueToday: number; overdue: number; waitingForMyCheck: number };
  byPerson: Array<{ userId: string; name: string; open: number; overdue: number; avgDaysLate: number; closedThisMonth: number }>;
  byBranch: Array<{ branchId: string; branchName: string; companyName?: string | null; open: number; overdue: number }>;
}

// The in-app notification list (newest first). Every task event that is pushed or emailed lands here too.
export interface TaskNotification {
  id: string;
  taskId: string;
  event: string;
  title: string;
  body: string;
  sentAt: string;
  opened: boolean;
}

// Due date + time are sent as the calendar day and the clock time the person picked; the server reads
// them in the ASSIGNEE's time zone (18:00 when dueTime is left out), so a task given from Mumbai to
// Nairobi is due at 6 pm Nairobi time. The same pair is used for a date-change request and an edit.
export interface DueInput { dueDate?: string; dueTime?: string }

export interface CreateTaskInput extends DueInput {
  title: string;
  description?: string;
  assignedTo: string; // a user id — your own id for a personal to-do
  watcherIds?: string[];
  branchId: string;
  companyId?: string | null;
  priority: TaskPriority;
  department?: TaskDepartment;
  repeat?: RepeatRule;
  link?: TaskLink | null;
  attachments?: Array<Pick<TaskAttachment, 'url' | 'name' | 'size' | 'mime'>>;
}

export interface PatchTaskInput extends DueInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  department?: TaskDepartment | null;
  branchId?: string;
  companyId?: string | null;
  repeat?: RepeatRule;
  link?: TaskLink | null;
  comment?: string;
}

// Lists come back as an array; a { tasks } envelope is accepted too so either server shape works.
const asList = (res: Task[] | { tasks: Task[] }): Task[] => (Array.isArray(res) ? res : res?.tasks ?? []);
const asTask = (res: Task | { task: Task }): Task => ('task' in res && res.task && typeof res.task === 'object' && 'id' in res.task ? res.task : (res as Task));

export function listTasks(p: TaskListParams): Promise<Task[]> {
  const q = new URLSearchParams({ view: p.view, state: p.state ?? 'open' });
  if (p.flag) q.set('flag', p.flag);
  if (p.status?.length) q.set('status', p.status.join(','));
  if (p.priority) q.set('priority', p.priority);
  if (p.branchId) q.set('branchId', p.branchId);
  if (p.companyId) q.set('companyId', p.companyId);
  if (p.personId) q.set('personId', p.personId);
  if (p.dueFrom) q.set('dueFrom', p.dueFrom);
  if (p.dueTo) q.set('dueTo', p.dueTo);
  if (p.q) q.set('q', p.q);
  return apiFetch<Task[] | { tasks: Task[] }>(`/api/tasks?${q.toString()}`).then(asList);
}

export const getTask = (id: string): Promise<TaskDetail> => apiFetch<TaskDetail>(`/api/tasks/${encodeURIComponent(id)}`);

export const createTask = (body: CreateTaskInput): Promise<Task> =>
  apiFetch<Task | { task: Task }>('/api/tasks', { method: 'POST', body }).then(asTask);

export const patchTask = (id: string, body: PatchTaskInput): Promise<Task> =>
  apiFetch<Task | { task: Task }>(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body }).then(asTask);

export const changeTaskStatus = (id: string, body: { to: TaskStatus; comment?: string } & DueInput): Promise<Task> =>
  apiFetch<Task | { task: Task }>(`/api/tasks/${encodeURIComponent(id)}/status`, { method: 'POST', body }).then(asTask);

export const reassignTask = (id: string, body: { assignedTo: string; comment?: string }): Promise<Task> =>
  apiFetch<Task | { task: Task }>(`/api/tasks/${encodeURIComponent(id)}/reassign`, { method: 'POST', body }).then(asTask);

export const setTaskWatchers = (id: string, body: { add?: string[]; remove?: string[] }): Promise<Task> =>
  apiFetch<Task | { task: Task }>(`/api/tasks/${encodeURIComponent(id)}/watchers`, { method: 'POST', body }).then(asTask);

export const addTaskAttachment = (id: string, body: Pick<TaskAttachment, 'url' | 'name' | 'size' | 'mime'>): Promise<Task> =>
  apiFetch<Task | { task: Task }>(`/api/tasks/${encodeURIComponent(id)}/attachments`, { method: 'POST', body }).then(asTask);

// Read-only chat for someone who can see the task (a manager above the assignee) but is not in its chat.
export const getTaskMessages = (id: string, opts: { before?: string; limit?: number } = {}): Promise<ChatMessage[]> => {
  const q = new URLSearchParams();
  if (opts.before) q.set('before', opts.before);
  if (opts.limit) q.set('limit', String(opts.limit));
  const qs = q.toString();
  return apiFetch<ChatMessage[] | { messages: ChatMessage[] }>(`/api/tasks/${encodeURIComponent(id)}/messages${qs ? `?${qs}` : ''}`)
    .then((r) => (Array.isArray(r) ? r : r?.messages ?? []));
};

export const getTaskDashboard = (opts: { companyId?: string; branchId?: string } = {}): Promise<TaskDashboard> => {
  const q = new URLSearchParams();
  if (opts.companyId) q.set('companyId', opts.companyId);
  if (opts.branchId) q.set('branchId', opts.branchId);
  const qs = q.toString();
  return apiFetch<TaskDashboard>(`/api/tasks/dashboard${qs ? `?${qs}` : ''}`);
};

// A task converted from an old reminder has no chat until someone opens it: this makes it (or returns
// the existing one). Call it whenever task.chatId is null and the chat is needed.
export const ensureTaskChat = (id: string): Promise<{ chatId: string }> =>
  apiFetch<{ chatId: string }>(`/api/tasks/${encodeURIComponent(id)}/chat`, { method: 'POST' });

export const listTaskNotifications = (): Promise<TaskNotification[]> =>
  apiFetch<TaskNotification[] | { notifications: TaskNotification[] }>('/api/tasks/notifications')
    .then((r) => (Array.isArray(r) ? r : r?.notifications ?? []));

/** Mark in-app notifications read — the given ids, or all of them when none are given. */
export const markTaskNotificationsOpened = (ids?: string[]): Promise<void> =>
  apiFetch<void>('/api/tasks/notifications/opened', { method: 'POST', body: ids?.length ? { ids } : {} });

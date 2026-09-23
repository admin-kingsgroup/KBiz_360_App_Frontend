import type { DirectoryBranch, DirectoryUser } from '../api/directory';
import type { ReminderRecord } from '../data/reminders';

export type UserReminderGroup = { userId: string; userName: string; tasks: ReminderRecord[] };
export type BranchReminderGroup = { branchId: string; branchName: string; branchCode: string; overdueCount: number; tasks: ReminderRecord[] };

const timeOf = (value?: string | number): number => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
};

export const isTodayReminder = (r: ReminderRecord, now = new Date()): boolean => {
  if (r.section === 'today') return true;
  if (!r.dueAt) return false;
  const due = new Date(r.dueAt);
  return !Number.isNaN(due.getTime()) && due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth() && due.getDate() === now.getDate();
};

export const isOverdueReminder = (r: ReminderRecord): boolean => r.overdue === true;

export const deduplicateReminders = (items: ReminderRecord[]): ReminderRecord[] =>
  [...new Map(items.filter((r) => !!r.id).map((r) => [r.id, r])).values()];

// Avoid an avoidable 403 loop: only known super-admins request the privileged all endpoint.
export const canUseAllEndpoint = (isSuper: boolean): boolean => isSuper;

export const sortReminders = (items: ReminderRecord[], now = new Date()): ReminderRecord[] =>
  [...items].sort((a, b) => Number(isOverdueReminder(b)) - Number(isOverdueReminder(a)) || timeOf(a.dueAt) - timeOf(b.dueAt) || (timeOf((b as ReminderRecord & { createdAt?: string | number }).createdAt) === Number.MAX_SAFE_INTEGER ? 0 : timeOf((b as ReminderRecord & { createdAt?: string | number }).createdAt)) - (timeOf((a as ReminderRecord & { createdAt?: string | number }).createdAt) === Number.MAX_SAFE_INTEGER ? 0 : timeOf((a as ReminderRecord & { createdAt?: string | number }).createdAt)));

export const groupByUser = (items: ReminderRecord[], now = new Date()): UserReminderGroup[] => {
  const groups = new Map<string, UserReminderGroup>();
  sortReminders(items.filter((r) => isOverdueReminder(r) && r.state !== 'approved'), now).forEach((r) => {
    const group = groups.get(r.forId) ?? { userId: r.forId, userName: r.forName || 'Unassigned', tasks: [] };
    group.tasks.push(r); groups.set(r.forId, group);
  });
  return [...groups.values()].sort((a, b) => timeOf(a.tasks[0]?.dueAt) - timeOf(b.tasks[0]?.dueAt));
};

/** Groups only records/users/branches supplied by authorized endpoints; no client-side scope is invented. */
export const groupByBranch = (items: ReminderRecord[], users: DirectoryUser[], branches: DirectoryBranch[], now = new Date()): BranchReminderGroup[] => {
  const usersById = new Map(users.map((u) => [u.id, u]));
  const branchesById = new Map(branches.map((b) => [b.id, b]));
  const groups = new Map<string, BranchReminderGroup>();
  items.filter((r) => isOverdueReminder(r) && r.state !== 'approved').forEach((r) => {
    const user = usersById.get(r.forId);
    user?.branchIds?.forEach((branchId) => {
      const branch = branchesById.get(branchId);
      if (!branch) return;
      const group = groups.get(branch.id) ?? { branchId: branch.id, branchName: branch.name || 'Unnamed branch', branchCode: branch.code || '', overdueCount: 0, tasks: [] };
      if (!group.tasks.some((task) => task.id === r.id)) { group.tasks.push(r); group.overdueCount++; }
      groups.set(branch.id, group);
    });
  });
  return [...groups.values()].map((g) => ({ ...g, tasks: sortReminders(g.tasks, now) })).sort((a, b) => b.overdueCount - a.overdueCount || a.branchName.localeCompare(b.branchName));
};

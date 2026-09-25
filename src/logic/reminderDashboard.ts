import type { DirectoryBranch, DirectoryUser } from '../api/directory';
import type { ReminderRecord } from '../data/reminders';
import { adminUsers, PERSON_META } from '../data/users';
import { branches as staticBranches } from '../data/businesses';
import { useAccessStore } from '../store/accessStore';

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
  sortReminders(items.filter((r) => r.state !== 'approved'), now).forEach((r) => {
    const group = groups.get(r.forId) ?? { userId: r.forId, userName: r.forName || 'Unassigned', tasks: [] };
    group.tasks.push(r); groups.set(r.forId, group);
  });
  return [...groups.values()].sort((a, b) =>
    Number(isOverdueReminder(b.tasks[0])) - Number(isOverdueReminder(a.tasks[0])) ||
    timeOf(a.tasks[0]?.dueAt) - timeOf(b.tasks[0]?.dueAt));
};

export const buildBranchRefMap = (branches: DirectoryBranch[] = []): Map<string, DirectoryBranch> => {
  const map = new Map<string, DirectoryBranch>();

  // Static branch fallbacks
  staticBranches.forEach((sb) => {
    const defaultBranch: DirectoryBranch = {
      id: sb.id,
      code: sb.code,
      name: sb.city || sb.code,
      city: sb.city ?? null,
      country: sb.country ?? null,
      isHO: false,
      companyId: sb.companyId ?? null,
    };
    if (sb.id) {
      map.set(sb.id, defaultBranch);
      map.set(sb.id.toLowerCase(), defaultBranch);
    }
    if (sb.code) {
      map.set(sb.code, defaultBranch);
      map.set(sb.code.toUpperCase(), defaultBranch);
      map.set(sb.code.toLowerCase(), defaultBranch);
    }
  });

  // Dynamic directory branches take precedence
  branches.forEach((b) => {
    if (b.id) {
      map.set(b.id, b);
      map.set(b.id.toLowerCase(), b);
    }
    if (b.code) {
      map.set(b.code, b);
      map.set(b.code.toUpperCase(), b);
      map.set(b.code.toLowerCase(), b);
    }
    if (b.name) {
      map.set(b.name, b);
      map.set(b.name.toLowerCase(), b);
    }
  });

  return map;
};

export const resolveUserBranches = (
  userId: string,
  userName?: string,
  users: DirectoryUser[] = [],
  branches: DirectoryBranch[] = []
): DirectoryBranch[] => {
  const branchMap = buildBranchRefMap(branches);
  const rawRefs: string[] = [];

  // 1. Check passed users list
  const user = users.find(
    (u) => u.id === userId || (userName && u.name && u.name.trim().toLowerCase() === userName.trim().toLowerCase())
  );
  if (user) {
    if (Array.isArray(user.branches)) rawRefs.push(...user.branches);
    if (Array.isArray(user.branchIds)) rawRefs.push(...user.branchIds);
    if (user.branch && typeof user.branch === 'string') rawRefs.push(user.branch);
    if (user.branchCode && typeof user.branchCode === 'string') rawRefs.push(user.branchCode);
  }

  // 2. Check accessStore.users
  if (rawRefs.length === 0) {
    try {
      const storeUsers = useAccessStore?.getState?.()?.users ?? [];
      const su = storeUsers.find(
        (u) => u.id === userId || (userName && u.name && u.name.trim().toLowerCase() === userName.trim().toLowerCase())
      );
      if (su?.branches && Array.isArray(su.branches)) {
        rawRefs.push(...su.branches);
      }
    } catch {
      // ignore
    }
  }

  // 3. Check adminUsers
  if (rawRefs.length === 0) {
    const au = adminUsers.find(
      (u) => u.id === userId || (userName && u.name && u.name.trim().toLowerCase() === userName.trim().toLowerCase())
    );
    if (au?.branches && Array.isArray(au.branches)) {
      rawRefs.push(...au.branches);
    }
  }

  // 4. Check PERSON_META
  if (rawRefs.length === 0 && PERSON_META[userId]?.branches) {
    rawRefs.push(...PERSON_META[userId].branches);
  }

  const cleanRefs = Array.from(new Set(rawRefs.map((r) => String(r).trim()).filter(Boolean)));
  if (cleanRefs.length === 0) return [];

  const resolved: DirectoryBranch[] = [];
  const seenKeys = new Set<string>();

  for (const ref of cleanRefs) {
    let b = branchMap.get(ref) || branchMap.get(ref.toUpperCase()) || branchMap.get(ref.toLowerCase());
    if (!b) {
      b = {
        id: ref,
        code: ref.toUpperCase(),
        name: ref.toUpperCase(),
        city: null,
        country: null,
        isHO: false,
        companyId: null,
      };
      branchMap.set(ref, b);
      branchMap.set(ref.toUpperCase(), b);
    }
    const key = (b.code || b.id).toUpperCase();
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      resolved.push(b);
    }
  }

  return resolved;
};

/** Groups only records/users/branches supplied by authorized endpoints; no client-side scope is invented. */
export const groupByBranch = (
  items: ReminderRecord[],
  users: DirectoryUser[],
  branches: DirectoryBranch[],
  now = new Date()
): BranchReminderGroup[] => {
  const branchMap = buildBranchRefMap(branches);
  const groups = new Map<string, BranchReminderGroup>();

  items.filter((r) => r.state !== 'approved').forEach((r) => {
    let mappedBranches = resolveUserBranches(r.forId, r.forName, users, branches);

    // If no branch from assignee, check reminder record itself
    if (mappedBranches.length === 0) {
      const rBranchRef = (r as any).branch || (r as any).branchCode || (r as any).branchId;
      if (rBranchRef) {
        const refStr = String(rBranchRef).trim();
        const b = branchMap.get(refStr) || branchMap.get(refStr.toUpperCase()) || {
          id: refStr,
          code: refStr.toUpperCase(),
          name: refStr.toUpperCase(),
          city: null,
          country: null,
          isHO: false,
          companyId: null,
        };
        mappedBranches = [b];
      }
    }

    const destinations = mappedBranches.length ? mappedBranches : [null];
    destinations.forEach((branch) => {
      const key = branch ? (branch.code ? branch.code.toUpperCase() : branch.id) : '__unassigned__';
      const group = groups.get(key) ?? {
        branchId: key,
        branchName: branch?.name || 'No branch assigned',
        branchCode: branch?.code || '',
        overdueCount: 0,
        tasks: [],
      };
      if (!group.tasks.some((task) => task.id === r.id)) {
        group.tasks.push(r);
        if (isOverdueReminder(r)) group.overdueCount++;
      }
      groups.set(key, group);
    });
  });

  return [...groups.values()]
    .map((g) => ({ ...g, tasks: sortReminders(g.tasks, now) }))
    .sort(
      (a, b) =>
        Number(isOverdueReminder(b.tasks[0])) - Number(isOverdueReminder(a.tasks[0])) ||
        b.overdueCount - a.overdueCount ||
        a.branchName.localeCompare(b.branchName)
    );
};

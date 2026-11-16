import type { Task, TaskStatus } from '../api/tasks';
import { activeFilterCount, dayBounds, filterTasks, groupAssigned, groupMine, isClosedTaskChat, mergeTasks, taskChatStatus, timeBucket } from '../logic/taskGroups';

// Wednesday 18 Nov 2026, 10:00 on the phone's clock.
const NOW = new Date(2026, 10, 18, 10, 0, 0).getTime();
const at = (y: number, mo: number, d: number, h = 18, mi = 0): string => new Date(y, mo, d, h, mi).toISOString();

let seq = 0;
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++seq}`, title: 'Bank reco', description: '', companyId: 'c1', companyName: 'Travkings', branchId: 'b1', branchName: 'MHUB',
  assignedTo: { id: 'satish', name: 'Satish' }, assignedBy: { id: 'afshin', name: 'Afshin' }, watchers: [],
  priority: 'normal', dueAt: at(2026, 10, 25), status: 'accepted', requestedDueAt: null, waitingOn: null, attachments: [],
  repeat: null, link: null, chatId: 'c', unread: 0, overdue: false, isSelf: false, myRole: 'assignee', actions: [],
  canEdit: false, canReassign: false, createdAt: at(2026, 10, 10), acceptedAt: null, doneAt: null, closedAt: null, cancelledAt: null,
  ...over,
});

describe('task sections', () => {
  it('My tasks: Overdue, Due today, This week, Later, Done – waiting to close — in that order', () => {
    const list = [
      task({ id: 'later', dueAt: at(2026, 10, 30) }),
      task({ id: 'done', status: 'done', dueAt: at(2026, 10, 17) }),
      task({ id: 'week', dueAt: at(2026, 10, 21) }), // Saturday
      task({ id: 'today', dueAt: at(2026, 10, 18, 18) }),
      task({ id: 'over', dueAt: at(2026, 10, 17) }),
    ];
    const s = groupMine(list, NOW);
    expect(s.map((x) => x.title)).toEqual(['Overdue', 'Due today', 'This week', 'Later', 'Done – waiting to close']);
    expect(s.map((x) => x.tasks[0].id)).toEqual(['over', 'today', 'week', 'later', 'done']);
  });

  it('Assigned by me puts the tasks marked done first, under Waiting for my check', () => {
    const s = groupAssigned([task({ id: 'a', dueAt: at(2026, 10, 18, 9) }), task({ id: 'b', status: 'done' })], NOW);
    expect(s.map((x) => x.title)).toEqual(['Waiting for my check', 'Overdue']);
    expect(s[0].tasks.map((t) => t.id)).toEqual(['b']);
  });

  it('a converted task without a due date is never overdue and files last under Later', () => {
    const undated = task({ id: 'undated', dueAt: null });
    expect(timeBucket(undated, NOW)).toBe('later');
    const s = groupMine([undated, task({ id: 'dated', dueAt: at(2026, 11, 20) })], NOW);
    expect(s).toHaveLength(1);
    expect(s[0].tasks.map((t) => t.id)).toEqual(['dated', 'undated']);
  });

  it('done is not overdue even after its due time', () => {
    expect(groupMine([task({ status: 'done', dueAt: at(2026, 10, 1) })], NOW)[0].title).toBe('Done – waiting to close');
  });

  it('same due time: Urgent before High before Normal', () => {
    const due = at(2026, 10, 30);
    const s = groupMine([task({ id: 'n', dueAt: due }), task({ id: 'u', dueAt: due, priority: 'urgent' }), task({ id: 'h', dueAt: due, priority: 'high' })], NOW);
    expect(s[0].tasks.map((t) => t.id)).toEqual(['u', 'h', 'n']);
  });

  it('closed and cancelled go to their own sections at the end, newest first', () => {
    const s = groupMine([
      task({ id: 'c1', status: 'closed', closedAt: at(2026, 10, 10) }),
      task({ id: 'x', status: 'cancelled', cancelledAt: at(2026, 10, 11) }),
      task({ id: 'c2', status: 'closed', closedAt: at(2026, 10, 12) }),
    ], NOW);
    expect(s.map((x) => x.title)).toEqual(['Closed', 'Cancelled']);
    expect(s[0].tasks.map((t) => t.id)).toEqual(['c2', 'c1']);
  });

  it('this week ends on Sunday night', () => {
    const { endOfWeek } = dayBounds(NOW);
    const e = new Date(endOfWeek);
    expect([e.getDay(), e.getDate(), e.getHours()]).toEqual([0, 22, 23]);
    expect(timeBucket(task({ dueAt: at(2026, 10, 22, 20) }), NOW)).toBe('week');
    expect(timeBucket(task({ dueAt: at(2026, 10, 23, 9) }), NOW)).toBe('later');
  });
});

describe('task filters', () => {
  const list = [
    task({ id: '1', title: 'Bank reco MHUB', priority: 'urgent', branchId: 'b1' }),
    task({ id: '2', title: 'Payroll', assignedTo: { id: 'faiz', name: 'Faiz' }, branchId: 'b2', companyId: 'c2' }),
    task({ id: '3', title: 'GST return', status: 'waiting', dueAt: at(2026, 11, 5) }),
  ];
  it('person matches either side of the task', () => {
    expect(filterTasks(list, { personId: 'faiz' }).map((t) => t.id)).toEqual(['2']);
    expect(filterTasks(list, { personId: 'afshin' })).toHaveLength(3);
  });
  it('business or branch, priority, status, due range and title search', () => {
    expect(filterTasks(list, { branchId: 'c2' }).map((t) => t.id)).toEqual(['2']);
    expect(filterTasks(list, { priority: 'urgent' }).map((t) => t.id)).toEqual(['1']);
    expect(filterTasks(list, { status: 'waiting' }).map((t) => t.id)).toEqual(['3']);
    expect(filterTasks(list, { dueFrom: '2026-12-01', dueTo: '2026-12-31' }).map((t) => t.id)).toEqual(['3']);
    expect(filterTasks(list, { q: 'reco' }).map((t) => t.id)).toEqual(['1']);
  });
  it('a due range leaves out undated tasks', () => {
    expect(filterTasks([task({ dueAt: null })], { dueFrom: '2026-01-01' })).toHaveLength(0);
  });
  it('counts the filters that are on, not the search', () => {
    expect(activeFilterCount({ q: 'x' })).toBe(0);
    expect(activeFilterCount({ personId: 'a', priority: 'high', dueTo: '2026-12-01' })).toBe(3);
  });
});

describe('merging views and task chats', () => {
  it('one task per id, the later list wins', () => {
    const a = task({ id: 'same', title: 'old' });
    const b = task({ id: 'same', title: 'new' });
    expect(mergeTasks([a], [b]).map((t) => t.title)).toEqual(['new']);
  });
  it('a task chat is closed when its task is closed or cancelled', () => {
    const statuses: Record<string, TaskStatus> = { t1: 'closed', t2: 'in_progress' };
    expect(isClosedTaskChat({ type: 'task', taskId: 't1' }, statuses)).toBe(true);
    expect(isClosedTaskChat({ type: 'task', taskId: 't2' }, statuses)).toBe(false);
    expect(isClosedTaskChat({ type: 'task', taskId: 't3', taskStatus: 'cancelled' }, statuses)).toBe(true);
    expect(isClosedTaskChat({ type: 'group' }, statuses)).toBe(false);
    expect(taskChatStatus({ type: 'task', taskId: 'unknown' }, statuses)).toBeNull();
  });
});

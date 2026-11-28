// A Super Admin deleted a task (owner, 2026-11-28): the store drops it from every list, the widget's top
// list and the status map — the socket's { taskId, deleted: true } and the detail screen both call this.
jest.mock('../api/tasks', () => ({ listTasks: jest.fn(async () => []), listTaskNotifications: jest.fn(async () => []) }));

import { useTasksStore } from '../store/tasksStore';
import type { Task } from '../api/tasks';

const task = (id: string, status: Task['status'] = 'assigned'): Task => ({ id, title: id, status } as unknown as Task);

beforeEach(() => useTasksStore.getState().reset());

it('drops the task everywhere and leaves the others', () => {
  useTasksStore.setState({
    lists: { 'mine:open': [task('a'), task('b')], 'team:all': [task('a', 'closed')], 'assigned:open': [task('c')] },
    statusById: { a: 'assigned', b: 'assigned', c: 'assigned' },
    top: [{ id: 'a', text: 'a', when: '', dueAt: null, by: '' }, { id: 'b', text: 'b', when: '', dueAt: null, by: '' }] as never,
  });
  useTasksStore.getState().remove('a');
  const s = useTasksStore.getState();
  expect(s.lists['mine:open'].map((t) => t.id)).toEqual(['b']);
  expect(s.lists['team:all']).toEqual([]);
  expect(s.lists['assigned:open'].map((t) => t.id)).toEqual(['c']);
  expect(s.statusById).toEqual({ b: 'assigned', c: 'assigned' });
  expect(s.top.map((t) => t.id)).toEqual(['b']);
});

it('an unknown id changes nothing', () => {
  useTasksStore.setState({ lists: { 'mine:open': [task('b')] }, statusById: { b: 'assigned' } });
  useTasksStore.getState().remove('zzz');
  expect(useTasksStore.getState().lists['mine:open'].map((t) => t.id)).toEqual(['b']);
});

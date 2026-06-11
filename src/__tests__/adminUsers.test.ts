import { useAccessStore } from '../store/accessStore';
import { adminUsers } from '../data/users';
import type { User } from '../types';

const mk = (id: string, name: string): User => ({
  id, name, initials: 'XX', color: '#000', role: 'EMPLOYEE', email: 'x@y.com',
  bizId: 'tk', branches: ['AMD'], accessGroups: ['AMD-Accounts'], accessDepts: ['AMD-Accounts'], accessAlerts: ['AMD-accounts'],
});

describe('Admin — user create/edit via accessStore.upsertUser', () => {
  beforeEach(() => useAccessStore.getState().setUsers([...adminUsers]));

  it('create appends a new user', () => {
    const before = useAccessStore.getState().users.length;
    useAccessStore.getState().upsertUser(mk('u-new', 'Anjali'));
    const users = useAccessStore.getState().users;
    expect(users.length).toBe(before + 1);
    expect(users.find((u) => u.id === 'u-new')?.name).toBe('Anjali');
  });

  it('edit updates in place (no duplicate)', () => {
    const before = useAccessStore.getState().users.length;
    useAccessStore.getState().upsertUser({ ...mk('a6', 'Rohan Renamed'), role: 'HOD' });
    const users = useAccessStore.getState().users;
    expect(users.length).toBe(before); // same count
    expect(users.find((u) => u.id === 'a6')?.name).toBe('Rohan Renamed');
    expect(users.find((u) => u.id === 'a6')?.role).toBe('HOD');
  });

  it('edited user keeps a single canonical identity (id stable)', () => {
    useAccessStore.getState().upsertUser({ ...mk('a8', 'Nurul Updated') });
    expect(useAccessStore.getState().users.filter((u) => u.id === 'a8').length).toBe(1);
  });
});

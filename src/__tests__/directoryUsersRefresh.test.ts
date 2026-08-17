// refreshDirectoryUsers — the shared user directory (accessStore.users) re-pull used by every
// people list on focus and by mutation handlers after a save. Verifies: it hydrates the store,
// throttles back-to-back focus calls, always re-fetches with { force: true } (post-mutation), and
// de-dupes concurrent callers.
jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));

import { apiFetch } from '../api/client';
import { useAccessStore } from '../store/accessStore';
import { refreshDirectoryUsers } from '../store/directoryStore';
import type { DirectoryUser } from '../api/directory';

const du = (id: string, name: string): DirectoryUser => ({
  id, email: `${id}@x.com`, firstName: name, lastName: '', name, phone: null, role: 'employee', level: 5, status: 'active', branchIds: [],
});
const mockFetch = apiFetch as jest.Mock;

describe('refreshDirectoryUsers', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    useAccessStore.getState().setUsers([]);
  });

  it('hydrates accessStore.users from /api/users', async () => {
    mockFetch.mockResolvedValueOnce([du('u1', 'Asha')]);
    await refreshDirectoryUsers({ force: true });
    expect(mockFetch).toHaveBeenCalledWith('/api/users');
    expect(useAccessStore.getState().users.map((u) => u.name)).toEqual(['Asha']);
  });

  it('throttles back-to-back focus calls but always re-fetches when forced', async () => {
    mockFetch.mockResolvedValue([du('u1', 'Asha')]);
    await refreshDirectoryUsers({ force: true });
    const n = mockFetch.mock.calls.length;
    await refreshDirectoryUsers(); // just loaded → no network
    expect(mockFetch.mock.calls.length).toBe(n);
    mockFetch.mockResolvedValue([du('u1', 'Asha'), du('u2', 'Bilal')]);
    await refreshDirectoryUsers({ force: true }); // after a mutation → must hit the server
    expect(mockFetch.mock.calls.length).toBe(n + 1);
    expect(useAccessStore.getState().users).toHaveLength(2);
  });

  it('de-dupes concurrent callers into one request and keeps the cache on failure', async () => {
    let resolve!: (v: DirectoryUser[]) => void;
    mockFetch.mockImplementationOnce(() => new Promise<DirectoryUser[]>((r) => { resolve = r; }));
    const a = refreshDirectoryUsers({ force: true });
    const b = refreshDirectoryUsers({ force: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    resolve([du('u1', 'Asha')]);
    await Promise.all([a, b]);
    expect(useAccessStore.getState().users).toHaveLength(1);

    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(refreshDirectoryUsers({ force: true })).resolves.toBeUndefined();
    expect(useAccessStore.getState().users).toHaveLength(1); // cached list survives
  });
});

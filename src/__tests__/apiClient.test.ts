import { apiFetch, ApiError, registerRefreshHandler } from '../api/client';
import { setTokens, clearTokens, getAccessToken } from '../api/tokens';
import { login } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { useAccessStore } from '../store/accessStore';
import type { AccessControl, User } from '../types';

const res = (status: number, bodyObj: unknown, ok?: boolean) => ({
  ok: ok ?? (status >= 200 && status < 300),
  status,
  statusText: 'x',
  text: async () => (bodyObj === undefined ? '' : JSON.stringify(bodyObj)),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setFetch = (fn: unknown): void => { (global as any).fetch = fn; };

beforeEach(() => {
  clearTokens();
  useAuthStore.getState().signOut();
});

describe('api/client — apiFetch', () => {
  it('GET returns parsed json and sends the bearer token', async () => {
    setTokens('acc-token', 'ref-token');
    const fetchMock = jest.fn().mockResolvedValue(res(200, { hello: 'world' }));
    setFetch(fetchMock);

    const out = await apiFetch<{ hello: string }>('/api/x');
    expect(out).toEqual({ hello: 'world' });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer acc-token');
    expect(init.method).toBe('GET');
  });

  it('throws ApiError carrying status + code on a non-ok response', async () => {
    setFetch(jest.fn().mockResolvedValue(res(400, { error: { message: 'bad', code: 'VALIDATION' } })));
    await expect(apiFetch('/api/y', { auth: false })).rejects.toMatchObject({ status: 400, code: 'VALIDATION' });
    await expect(apiFetch('/api/y', { auth: false })).rejects.toBeInstanceOf(ApiError);
  });

  it('returns undefined on 204', async () => {
    setFetch(jest.fn().mockResolvedValue(res(204, undefined)));
    expect(await apiFetch('/api/z', { auth: false })).toBeUndefined();
  });

  it('on 401 it refreshes once and retries the original request', async () => {
    setTokens('stale', 'ref');
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(res(401, { error: { message: 'expired' } }))
      .mockResolvedValueOnce(res(200, { ok: true }));
    setFetch(fetchMock);
    const refresher = jest.fn().mockResolvedValue(true);
    registerRefreshHandler(refresher);

    const out = await apiFetch<{ ok: boolean }>('/api/secure');
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ ok: true });
  });
});

describe('api/auth — login', () => {
  it('stores tokens and signs in via the existing stores', async () => {
    const user: User = {
      id: 'a1', name: 'Afshin Dhanani', initials: 'AD', color: '#000', role: 'SUPER_ADMIN',
      bizId: null, branches: [], accessGroups: [], accessDepts: [], accessAlerts: [],
    };
    const access: AccessControl = {
      isSuper: true, role: 'SUPER_ADMIN', name: 'Afshin Dhanani',
      bizIds: null, branches: null, groups: null, depts: null, alerts: null, canManage: true,
    };
    setFetch(jest.fn().mockResolvedValue(res(200, { accessToken: 'a', refreshToken: 'r', user, access })));

    const session = await login('afshin@kbiz360.com', 'kbiz360');
    expect(session.user.name).toBe('Afshin Dhanani');
    expect(getAccessToken()).toBe('a');
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(useAccessStore.getState().access()?.isSuper).toBe(true);
  });
});

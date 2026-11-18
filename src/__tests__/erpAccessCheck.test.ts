// Approvals on a bad connection (Afshin's phone, 2026-11-17 20:25 IST): the ERP check could not reach
// the server, was read as "this person has no ERP approvals", cached for 5 minutes, and the ERP section
// silently vanished. Now "couldn't ask" is its own state — not cached, retried on the next look — and
// only the ERP's own "no" (403 / 404) hides the section.
import { ApiError } from '../api/client';

const erp = { status: jest.fn(), me: jest.fn(), configList: jest.fn() };
jest.mock('../api/erp', () => ({ erpApi: erp }));
jest.mock('../store/authStore', () => ({ useAuthStore: Object.assign(() => 'u1', { getState: () => ({ user: { id: 'u1' } }) }) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadErpAccess, resetErpAccessCache } = require('../components/erpApprovals/useErpAccess') as typeof import('../components/erpApprovals/useErpAccess');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { erpCheckFailure } = require('../logic/erpApprovals') as typeof import('../logic/erpApprovals');

beforeEach(() => {
  jest.clearAllMocks();
  resetErpAccessCache();
  erp.status.mockResolvedValue({ configured: true });
  erp.me.mockResolvedValue({ email: 'afshin@kb.test' });
  erp.configList.mockResolvedValue([]);
});

describe('a failed ERP check', () => {
  it("is a real 'no' only when the ERP says so (403 / 404)", () => {
    expect(erpCheckFailure(new ApiError(403, 'Forbidden'))).toBe('none');
    expect(erpCheckFailure(new ApiError(404, 'Not found'))).toBe('none');
  });

  it("is 'could not ask' for no connection, a timeout, a session that would not renew or a server error", () => {
    expect(erpCheckFailure(new TypeError('Network request failed'))).toBe('error');
    expect(erpCheckFailure(Object.assign(new Error('Aborted'), { name: 'AbortError' }))).toBe('error');
    expect(erpCheckFailure(new ApiError(401, 'Unauthorized'))).toBe('error');
    expect(erpCheckFailure(new ApiError(502, 'Bad gateway'))).toBe('error');
    expect(erpCheckFailure(undefined)).toBe('error');
  });

  it('is not remembered: the next look asks again and finds the ERP approvals', async () => {
    erp.me.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect((await loadErpAccess('u1')).state).toBe('error');
    expect((await loadErpAccess('u1')).state).toBe('ready');
    expect(erp.me).toHaveBeenCalledTimes(2);
  });

  it("an ERP 'no' is remembered for the usual 5 minutes", async () => {
    erp.me.mockRejectedValue(new ApiError(403, 'Forbidden'));
    expect((await loadErpAccess('u1')).state).toBe('none');
    expect((await loadErpAccess('u1')).state).toBe('none');
    expect(erp.me).toHaveBeenCalledTimes(1);
  });

  it('the app server with no ERP link set up is a plain no', async () => {
    erp.status.mockResolvedValue({ configured: false });
    expect((await loadErpAccess('u1')).state).toBe('none');
  });
});

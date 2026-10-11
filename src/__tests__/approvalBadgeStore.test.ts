// The Approvals tab badge = ERP approvals across all branches + App requests (owner, 2026-10-10).
// The APIs are mocked; what is pinned is which numbers are added, and that a failure keeps the last value.
import { ApiError } from '../api/client';

const getApprovalCounts = jest.fn();
const getRegularizationsForAdmin = jest.fn();
const erp = { changeRequests: jest.fn(), leaveApplications: jest.fn(), creditRequests: jest.fn(), closeBoard: jest.fn() };
const loadErpAccess = jest.fn();

jest.mock('../api/approvals', () => ({ getApprovalCounts: () => getApprovalCounts() }));
jest.mock('../api/hr', () => ({ getRegularizationsForAdmin: (s: string) => getRegularizationsForAdmin(s) }));
jest.mock('../api/erp', () => ({ erpApi: erp }));
jest.mock('../components/erpApprovals/useErpAccess', () => ({ loadErpAccess: (id: string) => loadErpAccess(id) }));
jest.mock('../store/authStore', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useApprovalBadgeStore } = require('../store/approvalBadgeStore') as typeof import('../store/approvalBadgeStore');
const badge = () => useApprovalBadgeStore.getState();

const pay = (branch: string) => ({ _id: `p-${branch}`, type: 'payment_request', branch, status: 'pending' });
const req = (branch: string) => ({ _id: `r-${branch}`, type: 'ledger_edit', branch, status: 'pending' });

beforeEach(() => {
  jest.clearAllMocks();
  badge().reset();
  getApprovalCounts.mockResolvedValue({ pending: 2 });
  getRegularizationsForAdmin.mockResolvedValue([{ id: 'c1' }]);
  erp.changeRequests.mockResolvedValue([pay('BOM'), pay('MHUB'), req('AMD')]);
  erp.leaveApplications.mockResolvedValue([{ _id: 'l1', branch: 'HNBO' }]);
  erp.creditRequests.mockResolvedValue([{ _id: 'cr1', branch: 'BOM' }]);
  erp.closeBoard.mockResolvedValue([{ branch: 'AMD', status: 'held' }, { branch: 'BOM', status: 'closed' }]);
});

describe('Approvals tab badge', () => {
  it('ERP user: all-branches ERP total + App requests, corrections not added twice', async () => {
    loadErpAccess.mockResolvedValue({ state: 'ready', me: { email: 'o@kb.test' } });
    await badge().refresh();
    // ERP: 2 payables + 1 request + 1 HR + 1 credit + 1 held close = 6; App requests: 2.
    expect(badge()).toMatchObject({ erp: 6, app: 2, count: 8 });
    expect(getRegularizationsForAdmin).not.toHaveBeenCalled();
  });

  it('no ERP access: App requests + time corrections, as before', async () => {
    loadErpAccess.mockResolvedValue({ state: 'none' });
    await badge().refresh();
    expect(badge()).toMatchObject({ erp: 0, app: 3, count: 3 });
    expect(erp.changeRequests).not.toHaveBeenCalled();
  });

  it('a role the ERP refuses a list to counts 0 for it', async () => {
    loadErpAccess.mockResolvedValue({ state: 'ready', me: { email: 'o@kb.test' } });
    erp.creditRequests.mockRejectedValue(new ApiError(403, 'no'));
    await badge().refresh();
    expect(badge()).toMatchObject({ erp: 5, count: 7 });
  });

  it('a failed ERP or app read keeps the last number instead of zeroing it', async () => {
    loadErpAccess.mockResolvedValue({ state: 'ready', me: { email: 'o@kb.test' } });
    await badge().refresh();
    erp.closeBoard.mockRejectedValue(new Error('offline'));
    getApprovalCounts.mockRejectedValue(new Error('offline'));
    await badge().refresh();
    expect(badge()).toMatchObject({ erp: 6, app: 2, count: 8 });
  });

  it('the screens push each part and the total follows', () => {
    badge().setErp(10);
    badge().setApp(4);
    expect(badge().count).toBe(14);
    badge().setApp(0);
    expect(badge().count).toBe(10);
  });
});

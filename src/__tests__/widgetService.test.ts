// Android: the app hands the widget snapshot to the KbizWidget native module (modules/kbiz-widget),
// which stores it for the Work Board home-screen widget. Same JSON as the iOS App Group gets.
const mockSetSnapshot = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
const mockStore = (state: object) => ({ getState: () => state, subscribe: jest.fn(() => () => undefined) });

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));
jest.mock('expo', () => ({
  isRunningInExpoGo: () => false,
  requireOptionalNativeModule: (name: string) => (name === 'KbizWidget' ? { setSnapshot: mockSetSnapshot } : null),
}));
jest.mock('../store/authStore', () => ({ useAuthStore: mockStore({ user: { name: 'Anubhav Maurya' } }) }));
jest.mock('../store/messagingStore', () => ({
  useMessagingStore: mockStore({
    conversations: [{ id: 'c1', type: 'group', name: 'MHUB - Branch Accounts', unread: 3, muted: false, archived: false, lastMessage: null, lastActivityAt: '2026-10-29T06:00:00.000Z' }],
  }),
}));
jest.mock('../store/reminderBadgeStore', () => ({
  useReminderBadgeStore: mockStore({ count: 8, forMe: 7, top: [{ id: 'r1', text: 'Send snapshot', when: '', dueAt: 123, by: '' }] }),
}));
jest.mock('../store/approvalBadgeStore', () => ({ useApprovalBadgeStore: mockStore({ count: 5 }) }));
jest.mock('../store/attendanceStore', () => ({ useAttendanceStore: mockStore({ att: { inTime: null, outTime: null, via: null } }) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const widget = require('../services/widget') as typeof import('../services/widget');

const lastJson = () => JSON.parse(mockSetSnapshot.mock.calls[mockSetSnapshot.mock.calls.length - 1][0]);

beforeEach(() => mockSetSnapshot.mockClear());

describe('Android widget feed', () => {
  it('sends the work snapshot to the native module', () => {
    widget.syncWidgetSnapshot();
    expect(mockSetSnapshot).toHaveBeenCalledTimes(1);
    expect(lastJson()).toMatchObject({
      signedIn: true, userName: 'Anubhav Maurya',
      unreadChats: 1, reminderForMe: 7, approvals: 5,
      chats: [{ id: 'c1', unread: 3, group: true }],
      reminders: [{ id: 'r1', dueAt: 123 }],
    });
  });

  it('marks the widget signed out', () => {
    widget.clearWidgetSnapshot();
    expect(lastJson()).toEqual({ signedIn: false });
  });

  it('never lets a failing native call reach the app', async () => {
    mockSetSnapshot.mockRejectedValueOnce(new Error('no widget'));
    expect(() => widget.syncWidgetSnapshot()).not.toThrow();
    await Promise.resolve();
  });
});

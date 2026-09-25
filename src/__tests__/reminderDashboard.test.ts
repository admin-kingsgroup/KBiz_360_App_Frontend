import { canUseAllEndpoint, deduplicateReminders, groupByBranch, groupByUser, isTodayReminder, sortReminders } from '../logic/reminderDashboard';
import type { ReminderRecord } from '../data/reminders';
const now = new Date('2026-09-23T12:00:00');
const r = (id: string, extra: Partial<ReminderRecord> = {}): ReminderRecord => ({ id, text: id, forId: 'u1', forName: 'Ada', byId: 'u2', section: 'week', state: 'pending', ...extra });
describe('reminder dashboard helpers', () => {
  it('detects today via section or due date', () => { expect(isTodayReminder(r('a', { section: 'today' }), now)).toBe(true); expect(isTodayReminder(r('b', { dueAt: '2026-09-23T18:00:00Z' }), now)).toBe(true); });
  it('deduplicates and sorts overdue first', () => { const items = deduplicateReminders([r('a'), r('a', { text: 'new' }), r('b', { overdue: true, dueAt: '2026-09-20T09:00:00Z' })]); expect(items).toHaveLength(2); expect(sortReminders(items, now)[0].id).toBe('b'); });
  it('groups overdue tasks by authorized user and branch', () => { const task = r('a', { overdue: true, dueAt: '2026-09-20T09:00:00Z' }); expect(groupByUser([task], now)[0].userName).toBe('Ada'); const branches = groupByBranch([task], [{ id: 'u1', name: 'Ada', email: '', firstName: '', lastName: '', phone: null, role: 'employee', level: 1, status: 'active', branchIds: ['b1', 'b2'] }], [{ id: 'b1', name: 'North', code: 'N', city: null, country: null, isHO: false, companyId: null }, { id: 'b2', name: 'South', code: 'S', city: null, country: null, isHO: false, companyId: null }], now); expect(branches).toHaveLength(2); });
  it('does not call the privileged all endpoint for a non-super user', () => { expect(canUseAllEndpoint(false)).toBe(false); expect(canUseAllEndpoint(true)).toBe(true); });
});

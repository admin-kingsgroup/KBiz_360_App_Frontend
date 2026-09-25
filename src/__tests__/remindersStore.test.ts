import { useRemindersStore } from '../store/remindersStore';
import { seedReminders } from '../data/reminders';

describe('remindersStore — complete/approve (source-faithful)', () => {
  beforeEach(() => useRemindersStore.getState().setReminders([...seedReminders]));

  it('self-assigned complete → approved immediately', () => {
    // r3: forId a, byId a (self)
    const res = useRemindersStore.getState().complete('r3');
    expect(res).toBe('archived');
    expect(useRemindersStore.getState().reminders.find((r) => r.id === 'r3')?.state).toBe('approved');
  });

  it('other-assigned complete → review (sent back to creator)', () => {
    // r4: forId p (Pravesh), byId a — but completing requires it be "for me"; here we test the state transition rule directly
    const res = useRemindersStore.getState().complete('r4');
    expect(res).toBe('review');
    expect(useRemindersStore.getState().reminders.find((r) => r.id === 'r4')?.state).toBe('review');
  });

  it('approve → approved', () => {
    useRemindersStore.getState().approve('r6'); // r6 is review
    expect(useRemindersStore.getState().reminders.find((r) => r.id === 'r6')?.state).toBe('approved');
  });

  it('add prepends a new reminder', () => {
    const before = useRemindersStore.getState().reminders.length;
    useRemindersStore.getState().add({ id: 'r-new', text: 'x', state: 'pending', section: 'today', forId: 'a', forName: 'Me', byId: 'a', byName: 'Me' });
    expect(useRemindersStore.getState().reminders.length).toBe(before + 1);
    expect(useRemindersStore.getState().reminders[0].id).toBe('r-new');
  });
});

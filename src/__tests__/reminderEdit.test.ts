import type { ReminderRecord } from '../data/reminders';
import { decodeEditMembers, encodeEditMembers, planReminderEdit } from '../logic/reminderEdit';

const copy = (id: string, forId: string, groupId?: string): ReminderRecord =>
  ({ id, forId, forName: forId, byId: 'afshin', byName: 'Afshin', text: 'OWM setup', state: 'pending', section: 'today', ...(groupId ? { groupId } : {}) } as ReminderRecord);

describe('edit members param', () => {
  it('round-trips the copies through the route param', () => {
    const raw = encodeEditMembers([copy('c1', 'afshin', 'g1'), copy('c2', 'shehzad')]);
    expect(decodeEditMembers(raw)).toEqual([
      { id: 'c1', forId: 'afshin', forName: 'afshin', groupId: 'g1' },
      { id: 'c2', forId: 'shehzad', forName: 'shehzad' },
    ]);
  });

  it('reads nothing from a missing or broken param', () => {
    expect(decodeEditMembers(undefined)).toEqual([]);
    expect(decodeEditMembers('not json')).toEqual([]);
    expect(decodeEditMembers('{"id":"c1"}')).toEqual([]);
    expect(decodeEditMembers('[{"id":"c1"},{"id":"c2","forId":"x"}]')).toEqual([{ id: 'c2', forId: 'x' }]);
  });
});

describe('planReminderEdit', () => {
  const afshinOnly = decodeEditMembers(encodeEditMembers([copy('c1', 'afshin')]));

  it('adding Sughra keeps Afshin\'s copy and creates hers in the same reminder', () => {
    const plan = planReminderEdit(afshinOnly, ['afshin', 'sughra']);
    expect(plan.keep.map((m) => m.id)).toEqual(['c1']);
    expect(plan.add).toEqual(['sughra']);
    expect(plan.remove).toEqual([]);
    expect(plan.peopleChanged).toBe(true);
    expect(plan.groupId).toBe('c1'); // an older reminder: the group is one of its copies' ids
  });

  it('swapping people removes the old copy and adds the new person', () => {
    const plan = planReminderEdit(afshinOnly, ['sughra']);
    expect(plan.keep).toEqual([]);
    expect(plan.remove.map((m) => m.id)).toEqual(['c1']);
    expect(plan.add).toEqual(['sughra']);
  });

  it('uses the shared groupId when the copies have one', () => {
    const members = decodeEditMembers(encodeEditMembers([copy('c1', 'afshin', 'g9'), copy('c2', 'shehzad', 'g9')]));
    const plan = planReminderEdit(members, ['afshin']);
    expect(plan.groupId).toBe('g9');
    expect(plan.remove.map((m) => m.id)).toEqual(['c2']);
  });

  it('same people = no people change', () => {
    const plan = planReminderEdit(afshinOnly, ['afshin', 'afshin']);
    expect(plan.peopleChanged).toBe(false);
    expect(plan.keep.map((m) => m.id)).toEqual(['c1']);
  });
});

import type { ReminderRecord } from '../data/reminders';

// Editing WHO a reminder is for (owner 2026-10-18: "I don't see for whom the reminder is made so I can
// change it and add a person"). A reminder is one copy per person on the server, so an edit becomes:
//   keep    copies whose person is still ticked    → PATCH text / date / picture
//   add     people newly ticked                    → POST new copies INTO the same group
//   remove  copies whose person was unticked       → DELETE
// Pure — no RN, no API — so the plan is unit-tested.

/** One copy of the reminder being edited, as the Reminders screen hands it to the composer. */
export interface EditMember { id: string; forId: string; forName?: string; groupId?: string }

/** Route params are strings: the copies travel as JSON. */
export const encodeEditMembers = (members: ReminderRecord[]): string =>
  JSON.stringify(members.map((m) => ({ id: m.id, forId: m.forId, forName: m.forName, ...(m.groupId ? { groupId: m.groupId } : {}) })));

export function decodeEditMembers(raw?: string): EditMember[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((m): m is EditMember => !!m && typeof m.id === 'string' && !!m.id && typeof m.forId === 'string' && !!m.forId);
  } catch {
    return [];
  }
}

export interface ReminderEditPlan {
  /** The group new copies join and every kept copy is stamped with: the copies' shared groupId, or
   *  (a reminder from before groups existed) the id of one of its copies. */
  groupId: string;
  keep: EditMember[];
  remove: EditMember[];
  add: string[];
  peopleChanged: boolean;
}

export function planReminderEdit(members: EditMember[], nextForIds: string[]): ReminderEditPlan {
  const next = [...new Set(nextForIds.filter(Boolean))];
  const had = new Set(members.map((m) => m.forId));
  const keep = members.filter((m) => next.includes(m.forId));
  const remove = members.filter((m) => !next.includes(m.forId));
  const add = next.filter((id) => !had.has(id));
  const groupId = members.find((m) => m.groupId)?.groupId ?? members[0]?.id ?? '';
  return { groupId, keep, remove, add, peopleChanged: add.length > 0 || remove.length > 0 };
}

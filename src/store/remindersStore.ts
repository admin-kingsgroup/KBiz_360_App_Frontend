import { create } from 'zustand';
import { seedReminders, CURRENT_USER_ID, type ReminderRecord } from '../data/reminders';

// Reminders state. complete/approve logic copied verbatim from source RemindersScreen:
//  - self-assigned (byId===forId): complete -> approved (no review)
//  - assigned by other: complete -> review (sent back to creator)
//  - approve: review -> approved
export interface RemindersState {
  reminders: ReminderRecord[];
  setReminders: (r: ReminderRecord[]) => void;
  add: (r: ReminderRecord) => void;
  complete: (id: string) => 'archived' | 'review' | null;
  approve: (id: string) => void;
}

export const useRemindersStore = create<RemindersState>((set, get) => ({
  reminders: [...seedReminders],
  setReminders: (reminders) => set({ reminders }),
  add: (r) => set((s) => ({ reminders: [r, ...s.reminders] })),
  complete: (id) => {
    const r = get().reminders.find((x) => x.id === id);
    if (!r) return null;
    const selfAssigned = r.byId === r.forId;
    set((s) => ({
      reminders: s.reminders.map((x) => {
        if (x.id !== id) return x;
        return selfAssigned
          ? { ...x, state: 'approved' as const, completedAt: Date.now(), approvedAt: Date.now() }
          : { ...x, state: 'review' as const, completedAt: Date.now() };
      }),
    }));
    return selfAssigned ? 'archived' : 'review';
  },
  approve: (id) => set((s) => ({ reminders: s.reminders.map((r) => (r.id === id ? { ...r, state: 'approved' as const, approvedAt: Date.now() } : r)) })),
}));

export { CURRENT_USER_ID };

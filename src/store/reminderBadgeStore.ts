import { create } from 'zustand';
import { listReminders } from '../api/reminders';

// Live count for the Reminders tab badge = reminders needing my attention:
//   • "For me" pending (assigned to me, not yet done)  +  items I set that are awaiting my approval.
// Refreshed from the socket (reminder:new / reminder:update) and after the user acts. A single
// GET /api/reminders?tab=forme returns both numbers (visible + reviewCount).
interface ReminderBadgeState {
  count: number;
  refresh: () => Promise<void>;
  reset: () => void;
}

export const useReminderBadgeStore = create<ReminderBadgeState>((set) => ({
  count: 0,
  refresh: async () => {
    try {
      const r = await listReminders('forme');
      set({ count: r.visible.length + r.reviewCount });
    } catch {
      /* offline / not signed in — keep last value */
    }
  },
  reset: () => set({ count: 0 }),
}));

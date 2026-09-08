import { create } from 'zustand';
import { listReminders } from '../api/reminders';

// Live count for the Reminders tab badge = reminders needing my attention:
//   • "For me" pending (assigned to me, not yet done)  +  items I set that are awaiting my approval.
// Refreshed from the socket (reminder:new / reminder:update) and after the user acts. A single
// GET /api/reminders?tab=forme returns both numbers (visible + reviewCount).
// `top` keeps the first few visible items for the iOS home-screen widget (services/widget.ts).
export interface ReminderTopItem {
  id: string;
  text: string;
  when: string;
}

interface ReminderBadgeState {
  count: number;
  top: ReminderTopItem[];
  refresh: () => Promise<void>;
  reset: () => void;
}

export const useReminderBadgeStore = create<ReminderBadgeState>((set) => ({
  count: 0,
  top: [],
  refresh: async () => {
    try {
      const r = await listReminders('forme');
      set({
        count: r.visible.length + r.reviewCount,
        top: r.visible.slice(0, 3).map((v) => ({ id: v.id, text: v.text ?? '', when: v.when ?? '' })),
      });
    } catch {
      /* offline / not signed in — keep last value */
    }
  },
  reset: () => set({ count: 0, top: [] }),
}));

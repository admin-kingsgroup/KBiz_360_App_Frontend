import { create } from 'zustand';
import { listReminders } from '../api/reminders';
import type { ReminderRecord } from '../data/reminders';

// Live count for the Reminders tab badge = reminders needing my attention:
//   • "For me" pending (assigned to me, not yet done)  +  items I set that are awaiting my approval.
// Refreshed from the socket (reminder:new / reminder:update) and after the user acts. A single
// GET /api/reminders?tab=forme returns both numbers (visible + reviewCount).
// `top` keeps my pending items (soonest-due first, as the server sends them) for the home-screen
// widgets (services/widget.ts). They carry the due time so a widget can tell overdue on its own clock.
export interface ReminderTopItem {
  id: string;
  text: string;
  when: string;
  /** Due time, epoch ms. The widget marks the item overdue once this passes (the server's own rule). */
  dueAt: number | null;
  /** Who set it; '' when I set it for myself. */
  by: string;
}

// Enough for every widget to count overdue / due-today on its own; a person rarely has more open.
export const WIDGET_REMINDER_CAP = 40;

const dueMs = (iso?: string): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

export const toTopItem = (v: ReminderRecord): ReminderTopItem => ({
  id: v.id,
  text: (v.text ?? v.title ?? '').slice(0, 160),
  when: v.when ?? '',
  dueAt: dueMs(v.dueAt),
  by: v.byId && v.byId !== v.forId ? v.byName ?? '' : '',
});

interface ReminderBadgeState {
  count: number;
  /** Pending reminders set for me (the widgets' count). */
  forMe: number;
  top: ReminderTopItem[];
  refresh: () => Promise<void>;
  reset: () => void;
}

export const useReminderBadgeStore = create<ReminderBadgeState>((set) => ({
  count: 0,
  forMe: 0,
  top: [],
  refresh: async () => {
    try {
      const r = await listReminders('forme');
      set({
        count: r.visible.length + r.reviewCount,
        forMe: r.visible.length,
        top: r.visible.slice(0, WIDGET_REMINDER_CAP).map(toTopItem),
      });
    } catch {
      /* offline / not signed in — keep last value */
    }
  },
  reset: () => set({ count: 0, forMe: 0, top: [] }),
}));

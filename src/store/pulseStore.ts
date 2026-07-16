import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { pulseEvents as seed, type PulseEvent } from '../data/pulse';
import { listAlerts, markAlertRead, markAlertChannelRead } from '../api/alerts';
import { persistStorage } from './persistStorage';

// Holds pulse (system-alert) events. Backend-fed: refresh() pulls the caller's visible events from
// /api/alerts (access-filtered server-side); read-state updates optimistically here and persists
// per-user on the server (best-effort — offline taps still clear badges locally).
// Events are persisted to AsyncStorage so a cold offline start still shows the last-known feed
// (hydrate-then-refresh: the socket-connect refresh replaces the snapshot when the network is back).
export interface PulseState {
  events: PulseEvent[];
  refresh: () => Promise<void>;
  setEvents: (e: PulseEvent[]) => void;
  markEventRead: (id: string) => void;
  markChannelRead: (channelId: string) => void;
  eventsFor: (channelId: string) => PulseEvent[];
}

export const usePulseStore = create<PulseState>()(
  persist(
    (set, get) => ({
      events: [...seed],
      refresh: async () => {
        try {
          const { events } = await listAlerts();
          set({ events });
        } catch { /* offline or signed out — keep what we have */ }
      },
      setEvents: (events) => set({ events }),
      markEventRead: (id) => {
        set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, read: true } : e)) }));
        void markAlertRead(id).catch(() => undefined);
      },
      markChannelRead: (channelId) => {
        set((s) => ({ events: s.events.map((e) => (e.channelId === channelId ? { ...e, read: true } : e)) }));
        void markAlertChannelRead(channelId).catch(() => undefined);
      },
      eventsFor: (channelId) => get().events.filter((e) => e.channelId === channelId).sort((a, b) => b.time - a.time),
    }),
    {
      name: 'kb360-pulse',
      storage: createJSONStorage(() => persistStorage),
      partialize: (s) => ({ events: s.events }),
    },
  ),
);

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { pulseEvents as seed, type PulseEvent } from '../data/pulse';
import { listAlerts, markAlertRead, markAlertChannelRead, setAlertMute } from '../api/alerts';
import type { AlertMuteMap } from '../logic/alertMutes';
import { persistStorage } from './persistStorage';

// Holds pulse (system-alert) events. Backend-fed: refresh() pulls the caller's visible events from
// /api/alerts (access-filtered server-side); read-state updates optimistically here and persists
// per-user on the server (best-effort — offline taps still clear badges locally).
// Events are persisted to AsyncStorage so a cold offline start still shows the last-known feed
// (hydrate-then-refresh: the socket-connect refresh replaces the snapshot when the network is back).
// `mutes` = the channels this user muted (logic/alertMutes) — server-held, since the server is what
// stops the push; persisted here too so an offline start still hides their badge.
export interface PulseState {
  events: PulseEvent[];
  mutes: AlertMuteMap;
  refresh: () => Promise<void>;
  setEvents: (e: PulseEvent[]) => void;
  markEventRead: (id: string) => void;
  markChannelRead: (channelId: string) => void;
  eventsFor: (channelId: string) => PulseEvent[];
  // Mute channels for `hours` (null = always), or unmute them with muted=false. Optimistic; throws
  // (after putting the old mutes back) when the server refuses, so the caller can say so.
  setMuted: (channelIds: string[], muted: boolean, hours?: number | null) => Promise<void>;
  reset: () => void; // clear the persisted alert feed on sign-out (else it leaks to the next user)
}

export const usePulseStore = create<PulseState>()(
  persist(
    (set, get) => ({
      events: [...seed],
      mutes: {},
      refresh: async () => {
        try {
          const { events, mutes } = await listAlerts();
          set(mutes ? { events, mutes } : { events });
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
      setMuted: async (channelIds, muted, hours = null) => {
        const before = get().mutes;
        const next = { ...before };
        const until = muted && hours ? Date.now() + hours * 3600_000 : null;
        for (const id of channelIds) { if (muted) next[id] = until; else delete next[id]; }
        set({ mutes: next });
        try {
          const { mutes } = await setAlertMute(channelIds, muted, hours);
          set({ mutes });
        } catch (e) {
          set({ mutes: before });
          throw e;
        }
      },
      reset: () => set({ events: [], mutes: {} }),
    }),
    {
      name: 'kb360-pulse',
      storage: createJSONStorage(() => persistStorage),
      partialize: (s) => ({ events: s.events, mutes: s.mutes }),
    },
  ),
);

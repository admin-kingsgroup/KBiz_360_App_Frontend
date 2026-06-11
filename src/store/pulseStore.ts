import { create } from 'zustand';
import { pulseEvents as seed, type PulseEvent } from '../data/pulse';

// Holds pulse (system-alert) events with mutable read-state. Alert detail marks events read;
// the Home System Alerts segment reads from here so unread badges stay consistent. No backend.
export interface PulseState {
  events: PulseEvent[];
  setEvents: (e: PulseEvent[]) => void;
  markEventRead: (id: string) => void;
  markChannelRead: (channelId: string) => void;
  eventsFor: (channelId: string) => PulseEvent[];
}

export const usePulseStore = create<PulseState>((set, get) => ({
  events: [...seed],
  setEvents: (events) => set({ events }),
  markEventRead: (id) => set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, read: true } : e)) })),
  markChannelRead: (channelId) => set((s) => ({ events: s.events.map((e) => (e.channelId === channelId ? { ...e, read: true } : e)) })),
  eventsFor: (channelId) => get().events.filter((e) => e.channelId === channelId).sort((a, b) => b.time - a.time),
}));

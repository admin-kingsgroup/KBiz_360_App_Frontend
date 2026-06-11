import { create } from 'zustand';
import type { CallMediaType, CallParticipant } from '../api/calls';

// Live call state — the single source of truth for the in-call UI and the incoming-call overlay.
// Driven by the CallManager service; survives navigation because it is a global store (zustand).
export type CallPhase = 'calling' | 'ringing' | 'connecting' | 'active' | 'reconnecting' | 'ended';
export type CallQuality = 'good' | 'poor' | 'unknown';

export interface IncomingCall {
  callId: string;
  type: CallMediaType;
  caller: CallParticipant;
  startedAt: number;
}

export interface ActiveCall {
  callId: string;
  peer: CallParticipant;
  type: CallMediaType;
  direction: 'incoming' | 'outgoing';
  phase: CallPhase;
  startedAt: number;
  connectedAt: number | null; // when media connected (drives the timer)
  endReason?: string;
}

interface CallSessionState {
  incoming: IncomingCall | null;
  active: ActiveCall | null;
  muted: boolean;
  speaker: boolean;
  quality: CallQuality;

  setIncoming: (c: IncomingCall | null) => void;
  setActive: (c: ActiveCall | null) => void;
  patchActive: (p: Partial<ActiveCall>) => void;
  setMuted: (v: boolean) => void;
  setSpeaker: (v: boolean) => void;
  setQuality: (q: CallQuality) => void;
  reset: () => void;
}

export const useCallSessionStore = create<CallSessionState>((set) => ({
  incoming: null,
  active: null,
  muted: false,
  speaker: false,
  quality: 'unknown',

  setIncoming: (incoming) => set({ incoming }),
  setActive: (active) => set({ active }),
  patchActive: (p) => set((s) => (s.active ? { active: { ...s.active, ...p } } : {})),
  setMuted: (muted) => set({ muted }),
  setSpeaker: (speaker) => set({ speaker }),
  setQuality: (quality) => set({ quality }),
  reset: () => set({ incoming: null, active: null, muted: false, speaker: false, quality: 'unknown' }),
}));

import { create } from 'zustand';
import type { CallRecord, CallContact, CallType, CallFilter } from '../types';
import { callHistory } from '../data/calls';

// Transport-agnostic call state. History is mock today; real calling (signalling + WebRTC/PSTN)
// is [NEEDS BACKEND]. placeCall logs an outgoing entry — the actual media session is started by
// the in-call screen. A real provider would replace placeCall with: create session -> connect.
export interface CallState {
  calls: CallRecord[];
  filter: CallFilter;
  search: string;
  setFilter: (f: CallFilter) => void;
  setSearch: (q: string) => void;
  setCalls: (calls: CallRecord[]) => void; // for api hydration
  placeCall: (contact: CallContact, type: CallType) => CallRecord;
}

const makeId = () => `call-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

export const useCallStore = create<CallState>((set) => ({
  calls: callHistory,
  filter: 'all',
  search: '',
  setFilter: (filter) => set({ filter, search: '' }),
  setSearch: (search) => set({ search }),
  setCalls: (calls) => set({ calls }),
  placeCall: (contact, type) => {
    const rec: CallRecord = { id: makeId(), contact, type, direction: 'outgoing', ts: Date.now(), durationSec: 0 };
    set((s) => ({ calls: [rec, ...s.calls] }));
    return rec;
  },
}));

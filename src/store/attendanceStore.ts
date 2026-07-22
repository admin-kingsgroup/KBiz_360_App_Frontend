import { create } from 'zustand';
import type { AttendanceRecord, Permissions } from '../types';
import { autoPunch, canFacePunch, computePresence, facePunch } from '../logic/attendance';
import type { Coords, OfficeGeo, OfficePresence } from '../types';

// Shared daily punch record + device perms + consent. Persistence (perms/consent/today)
// is wired at the app edge (AsyncStorage); the store stays pure.
export interface AttendanceState {
  att: AttendanceRecord;
  perms: Permissions;
  consent: boolean;
  presence: OfficePresence | null;
  setConsent: (v: boolean) => void;
  setPerm: (k: keyof Permissions, v: boolean) => void;
  hydrate: (p: { perms?: Permissions; consent?: boolean }) => void;
  setAtt: (att: AttendanceRecord) => void; // adopt the server's record (today's punch)
  refreshPresence: (input: { wifiOn: boolean; wifiConfigured: boolean; coords: Coords | null; office: OfficeGeo }) => OfficePresence;
  runAutoPunch: (now?: Date) => boolean;        // returns true if a transition fired
  punchByFace: (now?: Date) => boolean;         // returns true if punched
  reset: () => void;
}

const emptyAtt: AttendanceRecord = { inTime: null, outTime: null, via: null };

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  att: { ...emptyAtt },
  perms: { location: false, notifications: false, network: false },
  consent: false,
  presence: null,
  setConsent: (consent) => set({ consent }),
  setPerm: (k, v) => set((s) => ({ perms: { ...s.perms, [k]: v } })),
  setAtt: (att) => set({ att }),
  hydrate: ({ perms, consent }) =>
    set((s) => ({ perms: perms ?? s.perms, consent: consent ?? s.consent })),
  refreshPresence: (input) => {
    const presence = computePresence(input);
    // Only publish a new presence object when a field ACTUALLY changed. computePresence returns a
    // fresh object every call, so an unconditional set() re-rendered every subscriber on each 15s
    // heartbeat even when nothing moved. Idempotent set → no needless re-renders.
    const cur = get().presence;
    if (!cur || cur.present !== presence.present || cur.inside !== presence.inside || cur.distance !== presence.distance || cur.viaNow !== presence.viaNow || cur.wifiOn !== presence.wifiOn || cur.wifiConfigured !== presence.wifiConfigured) {
      set({ presence });
    }
    return presence;
  },
  runAutoPunch: (now = new Date()) => {
    const { att, presence } = get();
    if (!presence) return false;
    const next = autoPunch(att, presence.present, presence.viaNow, now);
    if (next) { set({ att: next }); return true; }
    return false;
  },
  punchByFace: (now = new Date()) => {
    const { att, presence } = get();
    const present = presence ? presence.present : false;
    if (!canFacePunch(present, att, false)) return false;
    set({ att: facePunch(att, now) });
    return true;
  },
  reset: () => set({ att: { ...emptyAtt }, presence: null }),
}));

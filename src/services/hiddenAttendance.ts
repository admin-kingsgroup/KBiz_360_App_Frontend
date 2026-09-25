import { isRunningInExpoGo } from 'expo';
import type * as LocationModuleT from 'expo-location';
import { getMyAttendance, getOffices, checkIn, checkOut } from '../api/attendance';
import { distanceMeters } from '../logic/geo';
import { useAttendanceStore } from '../store/attendanceStore';
import { syncAttendanceGeofencing, disarmAttendanceGeofencing } from './backgroundAttendance';
import type { PunchMethod } from '../types';

// HIDDEN (background) attendance for company directors (owner call, 07-31). For accounts the
// server flags `hidden`, attendance is fully automatic and invisible: inside an office geofence →
// checked in; outside with the day open → checked out; re-entry re-opens the day (server model:
// first-in stays, last-out wins). No face photo, no punch UI, no toasts — completely silent.
//
// Detection is two-layered:
//   • FOREGROUND (this module): reconcile on app open / return-to-foreground / a light interval
//     while the app is up — one GPS fix, compare against every office, punch if state disagrees.
//   • BACKGROUND: the OS-geofence module (backgroundAttendance) is re-armed for hidden accounts
//     ONLY, so entries/exits still punch with the app closed. For everyone else it stays disarmed.
//
// For non-hidden accounts reconcile() only reconciles the ARMING state (disarms leftovers) and
// exits — it never reads location or punches.

let inFlight = false;
let lastRun = 0;
let armedFor: boolean | null = null; // last arming state applied (null = not yet checked)

const adopt = (m: { inTime: string | null; outTime: string | null; via: string | null } | null): void => {
  if (!m) return;
  useAttendanceStore.getState().setAtt({
    inTime: m.inTime ? new Date(m.inTime) : null,
    outTime: m.outTime ? new Date(m.outTime) : null,
    via: (m.via as PunchMethod | null) ?? null,
  });
};

export async function reconcileHiddenAttendance(): Promise<void> {
  if (inFlight || Date.now() - lastRun < 60_000) return; // debounce foreground flaps
  lastRun = Date.now();
  inFlight = true;
  try {
    const me = await getMyAttendance();
    const hidden = !!me.hidden;
    // Keep OS geofencing armed exactly for hidden accounts (idempotent, applied on state change).
    if (armedFor !== hidden) {
      armedFor = hidden;
      void (hidden ? syncAttendanceGeofencing() : disarmAttendanceGeofencing());
    }
    if (!hidden) return;

    const offices = await getOffices();
    if (!offices.length) return;

    let coords: { lat: number; lng: number } | null = null;
    if (!isRunningInExpoGo()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Location = require('expo-location') as typeof LocationModuleT;
        if ((await Location.getForegroundPermissionsAsync()).status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch { return; /* no fix — the next reconcile retries */ }
    }
    if (!coords) return;

    const inside = offices.some((o) => distanceMeters(coords as { lat: number; lng: number }, o) <= o.radius);
    const dayOpen = !!me.inTime && !me.outTime;
    if (inside === dayOpen) { adopt(me); return; } // state agrees — nothing to do

    try {
      const m = inside
        ? await checkIn({ coords, method: 'auto' }) // opens the day, or re-opens after an earlier out
        : await checkOut({ coords, method: 'auto' });
      adopt(m);
    } catch {
      adopt(await getMyAttendance().catch(() => null)); // raced another device/punch — server wins
    }
  } catch { /* offline — silent, retried on next foreground/interval */ }
  finally { inFlight = false; }
}

import { isRunningInExpoGo } from 'expo';
import type * as LocationModuleT from 'expo-location';
import { getMyAttendance, getOffices, checkIn, checkOut } from '../api/attendance';
import { distanceMeters } from '../logic/geo';
import { autoMayOpenDay, confirmGeofenceEntry, provablyOutside } from '../logic/attendance';
import { useAttendanceStore } from '../store/attendanceStore';
import { useUiStore } from '../store/uiStore';
import { syncAttendanceGeofencing, disarmAttendanceGeofencing } from './backgroundAttendance';
import { syncLocationTrail } from './locationTrail';
import { peekPendingExit, clearPendingExit } from './pendingExit';
import type { PunchMethod } from '../types';

// AUTOMATIC attendance, foreground half. Runs on every app open / return to foreground / a light
// interval while the app is up: read today's record, take one GPS fix, and punch if the record
// disagrees with where the phone is.
//
// Two kinds of account use it:
//   • EVERY tracked employee (owner decision, 2026-10-05 — "fully automatic, manual as fallback"):
//     at the office with no open day → checked in; provably away with the day open → checked out.
//     No face photo (nobody tapped anything); a toast says what happened. The Attendance screen's
//     face-photo button stays for when the automatic punch did not fire. A day the person closed
//     BY HAND is never re-opened automatically (autoMayOpenDay), and a foreground check-out needs
//     a fix that clears the fence by its own error (provablyOutside) — one indoor fix on app open
//     is weak evidence, and the server's trail-driven check-out is the primary path anyway.
//   • HIDDEN director accounts (owner call, 07-31): the same, but silent and on the original
//     simpler rule (inside ⇄ day open), with no punch UI and no toasts.
//
// BACKGROUND half: the OS-geofence module (backgroundAttendance) is kept armed for every tracked
// account, so entries/exits punch with the app closed. Exempt (untracked) accounts are disarmed.

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
const hhmm = (iso: string | null): string => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');

export async function reconcileAutoAttendance(): Promise<void> {
  if (inFlight || Date.now() - lastRun < 60_000) return; // debounce foreground flaps
  lastRun = Date.now();
  inFlight = true;
  try {
    const me = await getMyAttendance();
    const hidden = !!me.hidden;
    const tracked = hidden || !me.exempt;
    // Work-hours location trail: this reconcile runs on every app open / return to foreground,
    // which is when a trail the OS killed (reboot, force-stop) may be restarted, one started
    // headlessly is upgraded to the foreground service, and one left running after the day closed
    // elsewhere is stopped. Never shows UI from here.
    void syncLocationTrail(me);
    // Keep OS geofencing armed for every tracked account (idempotent, applied on state change).
    if (armedFor !== tracked) {
      armedFor = tracked;
      void (tracked ? syncAttendanceGeofencing() : disarmAttendanceGeofencing());
    }
    if (!tracked) return;

    const offices = await getOffices();
    if (!offices.length) return; // no office to be at or away from → manual punches only

    let fix: { coords: { lat: number; lng: number }; accuracy: number | null } | null = null;
    if (!isRunningInExpoGo()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Location = require('expo-location') as typeof LocationModuleT;
        if ((await Location.getForegroundPermissionsAsync()).status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: hidden ? Location.Accuracy.Balanced : Location.Accuracy.High });
        fix = { coords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, accuracy: pos.coords.accuracy ?? null };
      } catch { return; /* no fix — the next reconcile retries */ }
    }
    if (!fix) return;
    const coords = fix.coords;
    const dayOpen = !!me.inTime && !me.outTime;

    if (hidden) {
      const inside = offices.some((o) => distanceMeters(coords, o) <= o.radius);
      if (inside === dayOpen) { adopt(me); return; } // state agrees — nothing to do
      try {
        adopt(inside
          ? await checkIn({ coords, method: 'auto' }) // opens the day, or re-opens after an earlier out
          : await checkOut({ coords, method: 'auto' }));
      } catch {
        adopt(await getMyAttendance().catch(() => null)); // raced another device/punch — server wins
      }
      return;
    }

    const regions = offices.map((o) => ({ lat: o.lat, lng: o.lng, radius: o.radius }));
    const wantIn = !dayOpen && autoMayOpenDay(me) && confirmGeofenceEntry(fix, regions);
    const wantOut = dayOpen && provablyOutside(fix, regions);
    if (!wantIn && !wantOut) { adopt(me); return; }
    try {
      if (wantIn) {
        const m = await checkIn({ coords, method: 'auto', source: 'geofence' });
        await clearPendingExit(); // presence at the office refutes any pending exit
        adopt(m);
        void syncLocationTrail(m);
        useUiStore.getState().showToast(`Checked in automatically · ${hhmm(m.inTime)}`);
      } else {
        // Carry the instant the OS first saw the departure, if it did — the server back-dates to it.
        const exitAt = await peekPendingExit();
        const m = await checkOut({ coords, method: 'auto', source: 'geofence', ...(exitAt ? { exitAt } : {}) });
        await clearPendingExit();
        adopt(m);
        void syncLocationTrail(m);
        useUiStore.getState().showToast(`Checked out automatically · ${hhmm(m.outTime)}`);
      }
    } catch {
      // Refused (server's own checks) or raced the background engine / the trail check-out — the
      // server's record wins; the manual button is still there.
      const now = await getMyAttendance().catch(() => null);
      adopt(now);
      if (now) void syncLocationTrail(now);
    }
  } catch { /* offline — silent, retried on next foreground/interval */ }
  finally { inFlight = false; }
}

// Former name (directors-only era) — kept so existing call sites read the same.
export const reconcileHiddenAttendance = reconcileAutoAttendance;

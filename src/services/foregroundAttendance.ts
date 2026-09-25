import { isRunningInExpoGo } from 'expo';
import type * as LocationModuleT from 'expo-location';
import { getOffices, checkIn, getMyAttendance, type MyAttendance } from '../api/attendance';
import { getCurrentSsid } from './wifi';
import { clearPendingExit } from './pendingExit';
import { computePresence } from '../logic/attendance';
import { ssidMatches, cleanSsid } from '../logic/wifi';
import { useAttendanceStore } from '../store/attendanceStore';
import { useUiStore } from '../store/uiStore';
import type { PunchMethod } from '../types';

let inFlight = false;
let lastRun = 0;

const hhmm = (d: Date): string => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function adoptRecord(m: MyAttendance): void {
  useAttendanceStore.getState().setAtt({
    inTime: m.inTime ? new Date(m.inTime) : null,
    outTime: m.outTime ? new Date(m.outTime) : null,
    via: (m.via as PunchMethod | null) ?? null,
  });
}

// Foreground auto CHECK-IN. Call when the app opens or returns to the foreground: if the user is at
// the office (office Wi-Fi OR inside the geofence) and the day is not open — never checked in, OR
// already checked out (a drift exit / a real leave-and-return) — punch them in. The server re-opens
// a checked-out day on a verified re-entry (first-in stays, last-out wins), so simply OPENING the
// app at the office always converges the record to "present".
//
// Deliberately CHECK-IN only. A one-shot "outside" reading must never close the day (you might just
// be opening the app from home in the evening) — auto check-OUT stays with the background geofence
// and the Attendance screen's sustained-outside grace logic. The server re-verifies location + SSID
// on the punch, so this can't mark anyone present from outside.
export async function autoCheckInOnForeground(): Promise<void> {
  if (inFlight || Date.now() - lastRun < 15_000) return; // debounce rapid foreground toggles / double-fire
  lastRun = Date.now();
  inFlight = true;
  try {
    // Day already open (or exempt) → adopt the server record and stop. A closed day (outTime set)
    // continues: presence at the office below re-opens it.
    const me = await getMyAttendance();
    adoptRecord(me);
    if (me.exempt || (me.inTime && !me.outTime)) return;

    const offices = await getOffices();
    if (offices.length === 0) return;

    // One-shot GPS fix. Foreground location is required to enter the app, but this is best-effort —
    // office Wi-Fi alone can still confirm presence when there's no fix.
    let coords: { lat: number; lng: number } | null = null;
    if (!isRunningInExpoGo()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Location = require('expo-location') as typeof LocationModuleT;
        const fg = await Location.getForegroundPermissionsAsync();
        if (fg.status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch { /* no fix — rely on Wi-Fi */ }
    }
    const ssid = await getCurrentSsid();

    // Present at ANY of the user's offices? STRICT: inside the geofence AND on the office Wi-Fi
    // (offices without a configured SSID stay geofence-only).
    const office = offices.find((o) => {
      const wifiOn = ssidMatches(ssid, o.wifiSsid);
      const wifiConfigured = !!cleanSsid(o.wifiSsid);
      return computePresence({ wifiOn, wifiConfigured, coords, office: { lat: o.lat, lng: o.lng, radius: o.radius } }).present;
    });
    if (!office) return; // not at the office — leave it for a later open / manual punch

    const m = await checkIn({ coords, method: 'auto', wifiSsid: ssid });
    adoptRecord(m);
    // Checked in = provably at the office — any pending-exit marker was drift; refute it.
    void clearPendingExit();
    useUiStore.getState().showToast(`Checked in · ${m.inTime ? hhmm(new Date(m.inTime)) : 'now'}`);
  } catch { /* offline / server rejected on re-verify — silent; the user can still punch manually */ }
  finally { inFlight = false; }
}

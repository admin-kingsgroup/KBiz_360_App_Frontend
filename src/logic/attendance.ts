import type { AttendanceRecord, Coords, OfficeGeo, OfficePresence, PunchMethod } from '../types';
import { distanceMeters } from './geo';

// Presence model — STRICT: present requires being INSIDE the geofence AND on the office Wi-Fi
// (when the office has an SSID configured). An office with no configured SSID falls back to
// geofence-only so attendance isn't bricked for branches that haven't set their network yet.
export function computePresence(input: {
  wifiOn: boolean;
  wifiConfigured: boolean;
  coords: Coords | null;
  office: OfficeGeo;
}): OfficePresence {
  const { wifiOn, wifiConfigured, coords, office } = input;
  const distance = coords ? distanceMeters(coords, office) : null;
  const inside = distance != null && distance <= office.radius;
  const present = inside && (wifiOn || !wifiConfigured);
  const viaNow: OfficePresence['viaNow'] = present ? (wifiOn ? 'Wi-Fi' : 'Geofence') : '';
  return { distance, inside, wifiOn, wifiConfigured, present, viaNow };
}

// AUTOMATIC punch reducer. Extracted verbatim from the attendance auto-effect.
// Returns the NEXT record if a transition fires, else null (no change). `now` injected for testability.
export function autoPunch(
  att: AttendanceRecord,
  present: boolean,
  viaNow: OfficePresence['viaNow'],
  now: Date,
): AttendanceRecord | null {
  if (present && !att.inTime) {
    return { ...att, inTime: now, via: (viaNow || 'Auto') as PunchMethod };
  }
  if (!present && att.inTime && !att.outTime) {
    return { ...att, outTime: now };
  }
  return null;
}

// ── auto check-out: immediate the moment either required signal breaks ──
// STRICT rule: presence needs office Wi-Fi AND the geofence together, so the day auto-closes
// IMMEDIATELY when either leg provably breaks:
//   - the device is not on the office Wi-Fi (when the office has an SSID configured), OR
//   - a real GPS fix places the device CLEARLY beyond the geofence (radius + buffer).
// The buffer keeps indoor GPS drift (30–80 m wobbles are routine) from closing the day; a LOST
// fix (distance null) is UNKNOWN, not an exit — only real evidence checks someone out.
export const AUTO_OUT_BUFFER_M = 50;

export function confirmedAway(p: OfficePresence, radius: number): boolean {
  if (p.present) return false;
  if (p.wifiConfigured && !p.wifiOn) return true; // office Wi-Fi required and not connected → out now
  return p.distance != null && p.distance > radius + AUTO_OUT_BUFFER_M;
}

// ── background geofence exit verification ──
// The OS fires Exit events on indoor GPS drift while the user is still at their desk. Before the
// headless task punches out, it takes a FRESH fix and confirms the exit against the armed regions:
//   - fix inside any region (+EXIT_BUFFER_M hysteresis) → drift, don't punch
//   - fix accuracy worse than EXIT_MAX_ACCURACY_M      → unreliable, don't punch
//   - no fix at all → DON'T punch. Same principle as the foreground rule: a missing fix is
//     UNKNOWN, not an exit. "Punch anyway" checked real people out while they sat at their desk —
//     indoors GPS often has no fix at all, and the OS fires a bogus Exit the moment the geofences
//     (re)arm (fresh login / app reopen), so the old rule fired a false check-out on login.
//     A REAL exit is confirmed minutes later anyway: outdoors a fix arrives and the next Exit
//     event (or the hourly refresh) verifies it with evidence.
export const EXIT_BUFFER_M = 50;
export const EXIT_MAX_ACCURACY_M = 150;
export interface ArmedRegion { lat: number; lng: number; radius: number }
export function confirmGeofenceExit(
  fix: { coords: Coords; accuracy: number | null } | null,
  regions: ArmedRegion[],
): boolean {
  if (!fix) return false; // no evidence → no punch (a lost fix is unknown, not an exit)
  if (fix.accuracy != null && fix.accuracy > EXIT_MAX_ACCURACY_M) return false;
  return !regions.some((r) => distanceMeters(fix.coords, r) <= r.radius + EXIT_BUFFER_M);
}

// FALLBACK face punch guard. Extracted from faceScan(): blocked off-site; no-op once both punched.
export function canFacePunch(present: boolean, att: AttendanceRecord, scanning: boolean): boolean {
  if (!present) return false;
  if (scanning || (att.inTime && att.outTime)) return false;
  return true;
}

// Apply a face punch (in if not yet in, else out). Mirrors faceScan success path. `now` injected.
export function facePunch(att: AttendanceRecord, now: Date): AttendanceRecord {
  if (!att.inTime) return { ...att, inTime: now, via: 'Face' };
  if (!att.outTime) return { ...att, outTime: now };
  return att;
}

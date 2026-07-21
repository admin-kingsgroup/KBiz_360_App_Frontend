import type { AttendanceRecord, Coords, OfficeGeo, OfficePresence, PunchMethod } from '../types';
import { distanceMeters } from './geo';

// Presence model. Extracted from AttendanceScreen: distance -> inside -> present -> viaNow.
// present = wifiOn || inside; viaNow = wifiOn ? 'Wi-Fi' : (inside ? 'Geofence' : '').
export function computePresence(input: {
  wifiOn: boolean;
  coords: Coords | null;
  office: OfficeGeo;
}): OfficePresence {
  const { wifiOn, coords, office } = input;
  const distance = coords ? distanceMeters(coords, office) : null;
  const inside = distance != null && distance <= office.radius;
  const present = wifiOn || inside;
  const viaNow: OfficePresence['viaNow'] = wifiOn ? 'Wi-Fi' : (inside ? 'Geofence' : '');
  return { distance, inside, present, viaNow };
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

// ── auto check-out: immediate on a confirmed exit ──
// The day auto-closes the MOMENT the user is confirmed away: they're off the office Wi-Fi AND a real
// GPS fix places them CLEARLY beyond the geofence (radius + buffer). No time grace. Two safeguards
// keep this from mis-firing at the desk: (1) the Wi-Fi anchor — while on office Wi-Fi `present` is
// true, so GPS drift can never close the day; (2) the buffer — a boundary wobble just past the
// radius isn't "clearly beyond". A LOST GPS fix (distance null) is UNKNOWN and never auto-closes.
export const AUTO_OUT_BUFFER_M = 50;

export function confirmedAway(p: OfficePresence, radius: number): boolean {
  return !p.present && p.distance != null && p.distance > radius + AUTO_OUT_BUFFER_M;
}

// ── background geofence exit verification ──
// The OS fires Exit events on indoor GPS drift while the user is still at their desk. Before the
// headless task punches out, it takes a FRESH fix and confirms the exit against the armed regions:
//   - fix inside any region (+EXIT_BUFFER_M hysteresis) → drift, don't punch
//   - fix accuracy worse than EXIT_MAX_ACCURACY_M      → unreliable, don't punch
//   - no fix at all → punch anyway (the server's own drift guard is the backstop)
export const EXIT_BUFFER_M = 50;
export const EXIT_MAX_ACCURACY_M = 150;
export interface ArmedRegion { lat: number; lng: number; radius: number }
export function confirmGeofenceExit(
  fix: { coords: Coords; accuracy: number | null } | null,
  regions: ArmedRegion[],
): boolean {
  if (!fix) return true; // couldn't re-verify — let the server decide
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

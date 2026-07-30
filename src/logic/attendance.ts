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

// ── "provably away" definition (NOT wired to any auto check-out since 07-28) ──
// The foreground auto check-out was removed by policy: even with the 5-minute grace it produced
// false exits (Wi-Fi flaps, indoor GPS drift), so a check-out now comes ONLY from the verified
// background geofence Exit (confirmGeofenceExit below + the server's drift guard) or an explicit
// manual/face punch. confirmedAway stays as the documented, tested definition of "provably away":
//   - the device is not on the office Wi-Fi (when the office has an SSID configured), OR
//   - a real GPS fix places the device CLEARLY beyond the geofence (radius + buffer).
// A LOST fix (distance null) is UNKNOWN, not an exit — only real evidence counts as away.
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
//     event (or the 15-min background reconcile) verifies it with evidence.
// Buffer is ZERO (owner call, 07-28): check-out fires the moment a fix provably beyond the fence
// arrives — no spatial hysteresis. Evidence quality is judged in two tiers (07-30, the "checkout
// stamped hours late" fix):
//   - a TIGHT fix (accuracy ≤ EXIT_MAX_ACCURACY_M) confirms the exit as soon as it lands beyond
//     the fence itself — prompt near-boundary behaviour, unchanged;
//   - a COARSE fix also confirms the exit when it clears every fence by its own error radius
//     (distance − accuracy > radius): worst-case-still-outside is proof no matter how blurry the
//     fix is. Cell/Wi-Fi fixes in a car or at home are ±100–1000 m; the old flat 50 m bar threw
//     them away even 5 km from the office, deferring the punch — and the recorded checkout time —
//     to a Doze-delayed reconcile hours later.
// A coarse fix NEAR the boundary (can't clear the fence by its error) stays rejected: it defers
// to the next Exit event / the 15-min background reconcile instead of guessing.
export const EXIT_BUFFER_M = 0;
export const EXIT_MAX_ACCURACY_M = 50;
export interface ArmedRegion { lat: number; lng: number; radius: number }
export function confirmGeofenceExit(
  fix: { coords: Coords; accuracy: number | null } | null,
  regions: ArmedRegion[],
): boolean {
  if (!fix) return false; // no evidence → no punch (a lost fix is unknown, not an exit)
  const acc = fix.accuracy ?? 0; // a fix with no reported accuracy is treated as trusted (as before)
  const margin = acc <= EXIT_MAX_ACCURACY_M ? 0 : acc; // coarse fixes must clear each fence by their own error
  return regions.every((r) => distanceMeters(fix.coords, r) - margin > r.radius + EXIT_BUFFER_M);
}

// ── background geofence entry verification ──
// Mirror of confirmGeofenceExit for the periodic reconcile: a check-in may be attempted headlessly
// only when a REAL, accurate fix places the device INSIDE an armed region (no buffer — the server
// rejects anything beyond the office radius anyway, so a borderline fix just wastes a punch).
// This is what turns a MISSED OS Enter event (Doze, OEM battery saver, reboot-cleared fences, or a
// boundary punch the strict Wi-Fi rule rejected before the phone joined the office network) into a
// check-in on the next background refresh instead of "nothing until the app is opened".
export const ENTRY_MAX_ACCURACY_M = 150;
export function confirmGeofenceEntry(
  fix: { coords: Coords; accuracy: number | null } | null,
  regions: ArmedRegion[],
): boolean {
  if (!fix) return false; // no evidence → no punch
  if (fix.accuracy != null && fix.accuracy > ENTRY_MAX_ACCURACY_M) return false;
  return regions.some((r) => distanceMeters(fix.coords, r) <= r.radius);
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

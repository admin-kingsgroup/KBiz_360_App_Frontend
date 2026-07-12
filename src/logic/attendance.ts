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

// ── auto check-out grace ──
// GPS drops indoors constantly, and a lost fix must read as UNKNOWN, not "left the office".
// Auto check-out therefore requires a CONFIRMED outside reading (real coords, outside the fence,
// no office Wi-Fi) sustained for AWAY_GRACE_MS. Check-in stays instant.
export const AWAY_GRACE_MS = 5 * 60 * 1000;

// Reducer for the "away since" timestamp. present → null; unknown (no fix, no Wi-Fi) → null
// (never accumulate away-time on missing data); confirmed outside → keep/start the timer.
export function nextAwaySince(p: OfficePresence, awaySince: number | null, now: number): number | null {
  if (p.present) return null;
  const confirmedOutside = p.distance != null && !p.inside;
  if (!confirmedOutside) return null;
  return awaySince ?? now;
}

// True once the confirmed-outside timer has run for the full grace period.
export function awayLongEnough(awaySince: number | null, now: number, graceMs: number = AWAY_GRACE_MS): boolean {
  return awaySince != null && now - awaySince >= graceMs;
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

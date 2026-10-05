import { distanceMeters } from './geo';

// Work-hours location trail — the pure half (decisions + shaping; no native, no storage, no I/O).
// The device streams GPS fixes from check-in to check-out; services/locationTrail owns the OS task.

// Today's attendance record as far as the trail cares.
export interface TrailDayState {
  inTime: string | null;
  outTime: string | null;
  exempt?: boolean; // attendance not tracked for this account
  hidden?: boolean; // director account — attendance records silently, never trailed
}

// The trail runs exactly while the day is OPEN: checked in and not yet checked out. An unreadable
// record (null) is "unknown" — callers must leave the task as it is, so that is NOT handled here.
export function shouldTrackTrail(me: TrailDayState): boolean {
  if (me.exempt || me.hidden) return false;
  return !!me.inTime && !me.outTime;
}

export interface TrailPing {
  at: string; // ISO instant of the fix (device clock)
  lat: number;
  lng: number;
  accuracy: number | null; // metres
  speed: number | null; // m/s
  heading: number | null; // degrees
  altitude: number | null; // metres
  source: 'bg' | 'fg';
}

// Shape of an expo-location LocationObject, narrowed to what we read (keeps this file native-free).
export interface RawFix {
  timestamp: number;
  coords: { latitude: number; longitude: number; accuracy?: number | null; speed?: number | null; heading?: number | null; altitude?: number | null };
}

const fin = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function pingFromFix(fix: RawFix, source: 'bg' | 'fg' = 'bg'): TrailPing | null {
  const { latitude, longitude } = fix.coords ?? ({} as RawFix['coords']);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(fix.timestamp)) return null;
  const speed = fin(fix.coords.speed);
  const heading = fin(fix.coords.heading);
  return {
    at: new Date(fix.timestamp).toISOString(),
    lat: latitude,
    lng: longitude,
    accuracy: fin(fix.coords.accuracy),
    speed: speed !== null && speed >= 0 ? speed : null, // the OS reports -1 for "unknown"
    heading: heading !== null && heading >= 0 ? heading : null,
    altitude: fin(fix.coords.altitude),
    source,
  };
}

// Thinning. The OS delivers a fix every few seconds (every second on iOS); storing them all would
// be thousands of near-identical points per day. A fix is KEPT when the person has really moved
// (≥ MOVE_M since the last kept fix, and not faster than one per MIN_GAP_MS), or as a HEARTBEAT
// every HEARTBEAT_MS so a person sitting at a desk still reads "live, 2 min ago" on the admin
// screen instead of going silent for hours.
export const TRAIL_MOVE_M = 15;
export const TRAIL_MIN_GAP_MS = 15_000;
export const TRAIL_HEARTBEAT_MS = 120_000;

export function thinPings(lastKept: TrailPing | null, incoming: TrailPing[]): TrailPing[] {
  const out: TrailPing[] = [];
  let last = lastKept;
  const sorted = [...incoming].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const p of sorted) {
    if (!last) { out.push(p); last = p; continue; }
    const dt = Date.parse(p.at) - Date.parse(last.at);
    if (dt <= 0) continue; // out of order / duplicate instant
    const moved = distanceMeters(last, p) >= TRAIL_MOVE_M;
    if ((moved && dt >= TRAIL_MIN_GAP_MS) || dt >= TRAIL_HEARTBEAT_MS) { out.push(p); last = p; }
  }
  return out;
}

// The offline queue. Fixes wait here until uploaded; when the phone is offline for a long stretch
// the OLDEST are dropped first so the queue (AsyncStorage) stays bounded.
export const TRAIL_BUFFER_CAP = 3000;
export const TRAIL_BATCH_MAX = 400; // server accepts ≤ 500 per request

export function appendToBuffer(buffer: TrailPing[], incoming: TrailPing[], cap: number = TRAIL_BUFFER_CAP): TrailPing[] {
  const next = buffer.concat(incoming);
  return next.length > cap ? next.slice(next.length - cap) : next;
}

// Upload when there is something to send and either enough has piled up or the last upload is old
// enough — each upload wakes the radio, so tiny batches every few seconds would cost battery.
export const TRAIL_UPLOAD_MIN_POINTS = 8;
export const TRAIL_UPLOAD_MAX_WAIT_MS = 60_000;

export function shouldUploadNow(bufferLen: number, lastUploadAt: number, now: number): boolean {
  if (bufferLen <= 0) return false;
  return bufferLen >= TRAIL_UPLOAD_MIN_POINTS || now - lastUploadAt >= TRAIL_UPLOAD_MAX_WAIT_MS;
}

// Drop the points a successful upload carried from the CURRENT buffer (new fixes may have been
// appended while the request was in flight — those must stay queued).
export function removeUploaded(buffer: TrailPing[], uploaded: TrailPing[]): TrailPing[] {
  const sent = new Set(uploaded.map((p) => p.at));
  return buffer.filter((p) => !sent.has(p.at));
}

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

// ── admin "Live location" screen ──

export interface LiveLast { at: string; lat: number; lng: number; accuracy: number | null; today: boolean }
export interface LiveState { in: string | null; out: string | null; tracking: boolean; last: LiveLast | null }

export type LiveTone = 'live' | 'stale' | 'missing' | 'off';
export const LIVE_FRESH_MS = 10 * 60_000;

export function agoText(fromIso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(fromIso)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} h ${rem} min ago` : `${h} h ago`;
}

// One line + tone per person for the roster.
//   live    — on duty and a fix arrived within the last 10 minutes.
//   stale   — on duty, but the last fix is older (phone offline, app force-stopped, battery saver).
//   missing — on duty and nothing received today (sharing not agreed yet, or location turned off).
//   off     — not on duty (not checked in, or checked out); shows the last seen time if there is one.
export function liveStatus(p: LiveState, now: number): { tone: LiveTone; text: string } {
  const lastToday = p.last && p.last.today ? p.last : null;
  if (p.tracking) {
    if (!lastToday) return { tone: 'missing', text: 'On duty · no location received' };
    const fresh = now - Date.parse(lastToday.at) <= LIVE_FRESH_MS;
    const acc = lastToday.accuracy != null ? ` · ±${Math.round(lastToday.accuracy)} m` : '';
    return fresh
      ? { tone: 'live', text: `Live · ${agoText(lastToday.at, now)}${acc}` }
      : { tone: 'stale', text: `On duty · last update ${agoText(lastToday.at, now)}` };
  }
  if (!p.in) return { tone: 'off', text: 'Not checked in' };
  return { tone: 'off', text: lastToday ? `Checked out · last seen ${agoText(lastToday.at, now)}` : 'Checked out' };
}

// Total path length of a day's trail, in metres.
export function trailDistanceMeters(points: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceMeters(points[i - 1], points[i]);
  return total;
}

export function distanceText(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

// 'YYYY-MM-DD' ± n days (calendar arithmetic on the key itself — timezone-free).
export function shiftDayKey(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

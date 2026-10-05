import {
  shouldTrackTrail, pingFromFix, thinPings, appendToBuffer, shouldUploadNow, removeUploaded,
  TRAIL_HEARTBEAT_MS, TRAIL_MIN_GAP_MS, TRAIL_UPLOAD_MIN_POINTS, TRAIL_UPLOAD_MAX_WAIT_MS,
  type TrailPing,
} from '../logic/locationTrail';

const T0 = Date.parse('2026-10-05T04:30:00.000Z');
const ping = (ms: number, lat = 19.07, lng = 72.87, extra: Partial<TrailPing> = {}): TrailPing =>
  ({ at: new Date(T0 + ms).toISOString(), lat, lng, accuracy: 8, speed: null, heading: null, altitude: null, source: 'bg', ...extra });
// ~111 m per 0.001° of latitude.
const north = (m: number): number => 19.07 + m / 111_320;

describe('shouldTrackTrail — the trail runs exactly while the day is open', () => {
  it('runs between check-in and check-out', () => {
    expect(shouldTrackTrail({ inTime: '2026-10-05T04:30:00.000Z', outTime: null })).toBe(true);
  });
  it('does not run before check-in or after check-out', () => {
    expect(shouldTrackTrail({ inTime: null, outTime: null })).toBe(false);
    expect(shouldTrackTrail({ inTime: '2026-10-05T04:30:00.000Z', outTime: '2026-10-05T13:30:00.000Z' })).toBe(false);
  });
  it('never runs for exempt or hidden (director) accounts, even with an open day', () => {
    expect(shouldTrackTrail({ inTime: '2026-10-05T04:30:00.000Z', outTime: null, exempt: true })).toBe(false);
    expect(shouldTrackTrail({ inTime: '2026-10-05T04:30:00.000Z', outTime: null, hidden: true })).toBe(false);
  });
});

describe('pingFromFix', () => {
  it('maps an OS fix and normalises the "unknown" sentinels', () => {
    const p = pingFromFix({ timestamp: T0, coords: { latitude: 19.07, longitude: 72.87, accuracy: 6.4, speed: -1, heading: -1, altitude: 11 } });
    expect(p).toEqual({ at: new Date(T0).toISOString(), lat: 19.07, lng: 72.87, accuracy: 6.4, speed: null, heading: null, altitude: 11, source: 'bg' });
  });
  it('rejects a fix without finite coordinates', () => {
    expect(pingFromFix({ timestamp: T0, coords: { latitude: Number.NaN, longitude: 72.87 } })).toBeNull();
  });
});

describe('thinPings — store movement and a heartbeat, not every fix', () => {
  it('keeps the very first fix', () => {
    expect(thinPings(null, [ping(0)])).toHaveLength(1);
  });
  it('drops a stationary flood (iOS delivers a fix every second) but keeps a heartbeat', () => {
    const flood = Array.from({ length: 300 }, (_, i) => ping((i + 1) * 1000)); // 5 minutes at 1 Hz, same spot
    const kept = thinPings(ping(0), flood);
    expect(kept.length).toBe(Math.floor(300_000 / TRAIL_HEARTBEAT_MS));
  });
  it('keeps real movement, but not faster than the minimum gap', () => {
    const walk = [ping(5_000, north(30)), ping(TRAIL_MIN_GAP_MS, north(60)), ping(TRAIL_MIN_GAP_MS * 2, north(120))];
    const kept = thinPings(ping(0), walk);
    expect(kept.map((p) => p.at)).toEqual([walk[1].at, walk[2].at]); // the 5 s one is too soon
  });
  it('ignores GPS jitter below the movement threshold', () => {
    expect(thinPings(ping(0), [ping(30_000, north(5)), ping(60_000, north(-4))])).toHaveLength(0);
  });
  it('ignores out-of-order and duplicate instants, and sorts a shuffled batch', () => {
    const kept = thinPings(ping(60_000), [ping(30_000, north(500)), ping(60_000, north(500)), ping(200_000, north(90)), ping(100_000, north(40))]);
    expect(kept.map((p) => p.at)).toEqual([ping(100_000).at, ping(200_000).at]);
  });
});

describe('offline queue', () => {
  it('appends in order and drops the OLDEST beyond the cap', () => {
    const out = appendToBuffer([ping(1), ping(2)], [ping(3), ping(4)], 3);
    expect(out.map((p) => p.at)).toEqual([ping(2).at, ping(3).at, ping(4).at]);
  });
  it('uploads when enough piled up or the last upload is old, never when empty', () => {
    expect(shouldUploadNow(0, 0, T0)).toBe(false);
    expect(shouldUploadNow(TRAIL_UPLOAD_MIN_POINTS, T0, T0 + 1)).toBe(true);
    expect(shouldUploadNow(1, T0, T0 + TRAIL_UPLOAD_MAX_WAIT_MS - 1)).toBe(false);
    expect(shouldUploadNow(1, T0, T0 + TRAIL_UPLOAD_MAX_WAIT_MS)).toBe(true);
  });
  it('removeUploaded keeps fixes that arrived while the request was in flight', () => {
    const sent = [ping(1), ping(2)];
    expect(removeUploaded([ping(1), ping(2), ping(3)], sent).map((p) => p.at)).toEqual([ping(3).at]);
  });
});

// ── fully automatic attendance: the two client-side guards ──
import { autoMayOpenDay, provablyOutside } from '../logic/attendance';

describe('autoMayOpenDay — may an automatic check-in open or re-open today?', () => {
  const IN = '2026-10-05T04:30:00.000Z';
  const OUT = '2026-10-05T08:00:00.000Z';
  it('opens a fresh day, leaves an open day alone', () => {
    expect(autoMayOpenDay({ inTime: null, outTime: null })).toBe(true);
    expect(autoMayOpenDay({ inTime: IN, outTime: null, via: 'Geofence' })).toBe(false);
  });
  it('re-opens a day the phone closed, never one closed by hand or by an admin', () => {
    expect(autoMayOpenDay({ inTime: IN, outTime: OUT, via: 'Geofence' })).toBe(true);
    expect(autoMayOpenDay({ inTime: IN, outTime: OUT, via: 'Wi-Fi' })).toBe(true);
    expect(autoMayOpenDay({ inTime: IN, outTime: OUT, via: 'Face' })).toBe(false);
    expect(autoMayOpenDay({ inTime: IN, outTime: OUT, via: 'Manual' })).toBe(false);
  });
});

describe('provablyOutside — foreground automatic check-out needs a fix that clears the fence by its own error', () => {
  const office = { lat: 19.07, lng: 72.87, radius: 100 };
  const at = (m: number, accuracy: number | null) => ({ coords: { lat: north(m), lng: 72.87 }, accuracy });
  it('accepts a fix clearly beyond the fence', () => {
    expect(provablyOutside(at(400, 20), [office])).toBe(true);
  });
  it('rejects a fix that could still be inside, even an "accurate" one', () => {
    expect(provablyOutside(at(120, 30), [office])).toBe(false);
    expect(provablyOutside(at(60, 5), [office])).toBe(false);
  });
  it('rejects no fix, unknown accuracy, and an account with no office', () => {
    expect(provablyOutside(null, [office])).toBe(false);
    expect(provablyOutside(at(5000, null), [office])).toBe(false);
    expect(provablyOutside(at(5000, 10), [])).toBe(false);
  });
  it('must be outside every office', () => {
    const second = { lat: north(600), lng: 72.87, radius: 100 };
    expect(provablyOutside(at(590, 10), [office, second])).toBe(false);
  });
});

import {
  shouldTrackTrail, pingFromFix, thinPings, appendToBuffer, shouldUploadNow, removeUploaded,
  liveStatus, agoText, trailDistanceMeters, distanceText, shiftDayKey,
  TRAIL_HEARTBEAT_MS, TRAIL_MIN_GAP_MS, TRAIL_UPLOAD_MIN_POINTS, TRAIL_UPLOAD_MAX_WAIT_MS, LIVE_FRESH_MS,
  type TrailPing,
} from '../logic/locationTrail';
import { buildTrailMapHtml, safeJson } from '../logic/trailMap';

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

describe('liveStatus — one line per person on the admin roster', () => {
  const now = T0 + 60 * 60_000;
  const last = (agoMs: number, today = true) => ({ at: new Date(now - agoMs).toISOString(), lat: 19, lng: 72, accuracy: 7.6, today });
  it('live: on duty with a recent fix (shows age and accuracy)', () => {
    expect(liveStatus({ in: '10:00 AM', out: null, tracking: true, last: last(120_000) }, now)).toEqual({ tone: 'live', text: 'Live · 2 min ago · ±8 m' });
  });
  it('stale: on duty but the last fix is old', () => {
    const s = liveStatus({ in: '10:00 AM', out: null, tracking: true, last: last(LIVE_FRESH_MS + 60_000) }, now);
    expect(s.tone).toBe('stale');
    expect(s.text).toMatch(/last update 11 min ago/);
  });
  it('missing: on duty and nothing today (a fix from an earlier day does not count)', () => {
    expect(liveStatus({ in: '10:00 AM', out: null, tracking: true, last: null }, now).tone).toBe('missing');
    expect(liveStatus({ in: '10:00 AM', out: null, tracking: true, last: last(1000, false) }, now).tone).toBe('missing');
  });
  it('off: not checked in / checked out with a last-seen time', () => {
    expect(liveStatus({ in: null, out: null, tracking: false, last: null }, now)).toEqual({ tone: 'off', text: 'Not checked in' });
    expect(liveStatus({ in: '10:00 AM', out: '6:00 PM', tracking: false, last: last(30 * 60_000) }, now)).toEqual({ tone: 'off', text: 'Checked out · last seen 30 min ago' });
  });
});

describe('small formatters', () => {
  it('agoText', () => {
    expect(agoText(new Date(T0 - 20_000).toISOString(), T0)).toBe('just now');
    expect(agoText(new Date(T0 - 5 * 60_000).toISOString(), T0)).toBe('5 min ago');
    expect(agoText(new Date(T0 - 125 * 60_000).toISOString(), T0)).toBe('2 h 5 min ago');
    expect(agoText(new Date(T0 - 120 * 60_000).toISOString(), T0)).toBe('2 h ago');
  });
  it('trail distance and its label', () => {
    const d = trailDistanceMeters([{ lat: 19.07, lng: 72.87 }, { lat: north(500), lng: 72.87 }, { lat: north(1500), lng: 72.87 }]);
    expect(d).toBeGreaterThan(1480);
    expect(d).toBeLessThan(1520);
    expect(distanceText(1500)).toBe('1.5 km');
    expect(distanceText(240.4)).toBe('240 m');
    expect(trailDistanceMeters([])).toBe(0);
  });
  it('shiftDayKey crosses month and year boundaries', () => {
    expect(shiftDayKey('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('buildTrailMapHtml', () => {
  it('inlines the data and loads Leaflet', () => {
    const html = buildTrailMapHtml({ points: [{ at: new Date(T0).toISOString(), lat: 19.07, lng: 72.87, accuracy: 5 }], offices: [{ label: 'HQ', lat: 19.07, lng: 72.87, radius: 100 }], live: true });
    expect(html).toContain('leaflet@1.9.4');
    expect(html).toContain('"lat":19.07');
    expect(html).toContain('"live":true');
  });
  it('a name cannot break out of the script block', () => {
    const html = buildTrailMapHtml({ people: [{ name: '</script><script>alert(1)</script>', lat: 1, lng: 2, at: new Date(T0).toISOString(), accuracy: null, color: '#000', live: false }] });
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html.match(/<\/script>/g)).toHaveLength(2); // only the two real script tags close
    expect(safeJson('<&>')).toBe('"\\u003c\\u0026\\u003e"');
  });
});

import { confirmedAway, AUTO_OUT_BUFFER_M, computePresence } from '../logic/attendance';
import type { OfficePresence } from '../types';

const OFFICE = { lat: 19.146724, lng: 72.82933, radius: 150 };
const AT_OFFICE = { lat: OFFICE.lat, lng: OFFICE.lng };
const p = (over: Partial<OfficePresence>): OfficePresence =>
  ({ distance: null, inside: false, wifiOn: false, wifiConfigured: true, present: false, viaNow: '', ...over });

// STRICT rule: presence needs office Wi-Fi AND the geofence together, so auto check-out fires the
// MOMENT either leg provably breaks — Wi-Fi drop is immediate; the GPS leg still needs a real fix
// clearly beyond radius + buffer (indoor drift protection). A lost fix stays UNKNOWN.
describe('confirmedAway (immediate auto check-out)', () => {
  it('true the moment the office Wi-Fi drops, even with GPS still inside', () => {
    const wifiDropped = computePresence({ wifiOn: false, wifiConfigured: true, coords: AT_OFFICE, office: OFFICE });
    expect(wifiDropped.present).toBe(false);
    expect(confirmedAway(wifiDropped, OFFICE.radius)).toBe(true);
  });

  it('true when clearly beyond the fence + buffer even while still on office Wi-Fi', () => {
    const gpsLeft = computePresence({ wifiOn: true, wifiConfigured: true, coords: { lat: 19.2, lng: 72.9 }, office: OFFICE });
    expect(gpsLeft.present).toBe(false);
    expect(confirmedAway(gpsLeft, OFFICE.radius)).toBe(true);
  });

  it('false at a boundary wobble just past the radius while on Wi-Fi (within the buffer)', () => {
    expect(confirmedAway(p({ wifiOn: true, distance: OFFICE.radius + 10 }), OFFICE.radius)).toBe(false);
  });

  it('false on a LOST GPS fix while still on office Wi-Fi (unknown ≠ away) — the Sughra bug', () => {
    const lostFix = computePresence({ wifiOn: true, wifiConfigured: true, coords: null, office: OFFICE });
    expect(lostFix.present).toBe(false); // strict: no fix = cannot check IN either
    expect(confirmedAway(lostFix, OFFICE.radius)).toBe(false);
  });

  it('false while fully present (Wi-Fi + inside)', () => {
    const here = computePresence({ wifiOn: true, wifiConfigured: true, coords: AT_OFFICE, office: OFFICE });
    expect(here.present).toBe(true);
    expect(confirmedAway(here, OFFICE.radius)).toBe(false);
  });

  it('geofence-only office (no SSID): inside → false; clearly beyond buffer → true', () => {
    const inside = computePresence({ wifiOn: false, wifiConfigured: false, coords: AT_OFFICE, office: OFFICE });
    expect(inside.present).toBe(true);
    expect(confirmedAway(inside, OFFICE.radius)).toBe(false);
    expect(confirmedAway(p({ wifiConfigured: false, distance: OFFICE.radius + AUTO_OUT_BUFFER_M + 10 }), OFFICE.radius)).toBe(true);
  });
});

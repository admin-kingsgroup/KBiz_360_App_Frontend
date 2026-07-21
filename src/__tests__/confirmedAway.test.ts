import { confirmedAway, AUTO_OUT_BUFFER_M, computePresence } from '../logic/attendance';
import type { OfficePresence } from '../types';

const OFFICE = { lat: 19.146724, lng: 72.82933, radius: 150 };
const p = (over: Partial<OfficePresence>): OfficePresence => ({ distance: null, inside: false, present: false, viaNow: '', ...over });

// Auto check-out is IMMEDIATE once confirmedAway: off office Wi-Fi AND a real GPS fix clearly beyond
// the geofence (radius + buffer). The Wi-Fi anchor + the buffer keep it from firing at the desk; a
// lost GPS fix stays UNKNOWN.
describe('confirmedAway (immediate auto check-out)', () => {
  it('true when off Wi-Fi and clearly beyond the fence + buffer', () => {
    expect(confirmedAway(p({ present: false, inside: false, distance: OFFICE.radius + AUTO_OUT_BUFFER_M + 10 }), OFFICE.radius)).toBe(true);
  });

  it('false at a boundary wobble just past the radius (within the buffer)', () => {
    expect(confirmedAway(p({ present: false, distance: OFFICE.radius + 10 }), OFFICE.radius)).toBe(false);
  });

  it('false while on office Wi-Fi even if GPS drifts far outside (the anchor)', () => {
    const wifiButDrift = computePresence({ wifiOn: true, coords: { lat: 19.20, lng: 72.90 }, office: OFFICE });
    expect(wifiButDrift.present).toBe(true);
    expect(confirmedAway(wifiButDrift, OFFICE.radius)).toBe(false);
  });

  it('false on a LOST GPS fix (unknown ≠ away) — the Sughra bug', () => {
    const lostFix = computePresence({ wifiOn: false, coords: null, office: OFFICE });
    expect(lostFix.present).toBe(false);
    expect(confirmedAway(lostFix, OFFICE.radius)).toBe(false);
  });

  it('false when inside the geofence', () => {
    const inside = computePresence({ wifiOn: false, coords: { lat: OFFICE.lat, lng: OFFICE.lng }, office: OFFICE });
    expect(inside.present).toBe(true);
    expect(confirmedAway(inside, OFFICE.radius)).toBe(false);
  });
});

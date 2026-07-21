import { confirmGeofenceExit, EXIT_BUFFER_M, EXIT_MAX_ACCURACY_M } from '../logic/attendance';

// Background geofence Exit verification: the OS fires Exit on indoor GPS drift, so the headless
// task re-checks a FRESH fix against the armed regions before punching out.
const REGION = { lat: 19.1466, lng: 72.8293, radius: 100 };
const at = (dLatM: number) => ({ lat: REGION.lat + dLatM / 111_320, lng: REGION.lng });

describe('confirmGeofenceExit', () => {
  it('fix still inside the region → drift, do NOT check out (the 82 m case)', () => {
    expect(confirmGeofenceExit({ coords: at(82), accuracy: 20 }, [REGION])).toBe(false);
  });

  it('fix inside radius + hysteresis buffer → do NOT check out', () => {
    expect(confirmGeofenceExit({ coords: at(REGION.radius + EXIT_BUFFER_M - 5), accuracy: 20 }, [REGION])).toBe(false);
  });

  it('fix clearly beyond radius + buffer → confirmed exit, check out', () => {
    expect(confirmGeofenceExit({ coords: at(REGION.radius + EXIT_BUFFER_M + 40), accuracy: 20 }, [REGION])).toBe(true);
  });

  it('garbage accuracy → unreliable, do NOT check out', () => {
    expect(confirmGeofenceExit({ coords: at(500), accuracy: EXIT_MAX_ACCURACY_M + 1 }, [REGION])).toBe(false);
  });

  it('no fresh fix → let the server-side guard decide (punch proceeds)', () => {
    expect(confirmGeofenceExit(null, [REGION])).toBe(true);
  });

  it('no cached regions → nothing to verify against, punch proceeds', () => {
    expect(confirmGeofenceExit({ coords: at(0), accuracy: 20 }, [])).toBe(true);
  });
});

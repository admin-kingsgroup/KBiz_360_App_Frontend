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

  it('coarse fix that clears the fence by its own error radius → PROOF of exit, check out (the "checkout stamped hours late" fix: cell/Wi-Fi fixes in a car / at home are ±100–1000 m and must still close the day)', () => {
    // 500 m out, ±51 m: even at worst case ≥ 449 m from centre — provably beyond the 100 m fence.
    expect(confirmGeofenceExit({ coords: at(500), accuracy: EXIT_MAX_ACCURACY_M + 1 }, [REGION])).toBe(true);
    // 5 km out, ±800 m: worst case ≥ 4.2 km — conclusive despite the very coarse accuracy.
    expect(confirmGeofenceExit({ coords: at(5000), accuracy: 800 }, [REGION])).toBe(true);
  });

  it('coarse fix NEAR the boundary (cannot clear the fence by its error) → unreliable, do NOT check out', () => {
    // 140 m out, ±200 m: worst case could be inside the fence — defer to better evidence.
    expect(confirmGeofenceExit({ coords: at(140), accuracy: 200 }, [REGION])).toBe(false);
    // 82 m (inside) with coarse accuracy stays a non-exit regardless.
    expect(confirmGeofenceExit({ coords: at(82), accuracy: 200 }, [REGION])).toBe(false);
  });

  it('no fresh fix → UNKNOWN, do NOT check out (proven in prod: indoors GPS has no fix and the OS fires a bogus Exit the moment geofences re-arm on login — the old "punch anyway" checked people out at their desk)', () => {
    expect(confirmGeofenceExit(null, [REGION])).toBe(false);
  });

  it('no cached regions → nothing to verify against, punch proceeds', () => {
    expect(confirmGeofenceExit({ coords: at(0), accuracy: 20 }, [])).toBe(true);
  });
});

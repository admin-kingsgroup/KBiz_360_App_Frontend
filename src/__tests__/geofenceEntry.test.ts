import { confirmGeofenceEntry, ENTRY_MAX_ACCURACY_M } from '../logic/attendance';

// Background arrival reconcile: the periodic refresh task may check in headlessly only when a
// real, accurate fix proves the device is INSIDE an armed region — no buffer, since the server
// rejects any punch beyond the office radius anyway.
const REGION = { lat: 19.1466, lng: 72.8293, radius: 100 };
const at = (dLatM: number) => ({ lat: REGION.lat + dLatM / 111_320, lng: REGION.lng });

describe('confirmGeofenceEntry', () => {
  it('fix inside the region → check in', () => {
    expect(confirmGeofenceEntry({ coords: at(60), accuracy: 20 }, [REGION])).toBe(true);
  });

  it('fix at the fence itself → still inside, check in', () => {
    expect(confirmGeofenceEntry({ coords: at(REGION.radius - 1), accuracy: 20 }, [REGION])).toBe(true);
  });

  it('fix just beyond the radius → NOT inside, no punch (server would 403 it anyway)', () => {
    expect(confirmGeofenceEntry({ coords: at(REGION.radius + 20), accuracy: 20 }, [REGION])).toBe(false);
  });

  it('garbage accuracy → unreliable, no punch', () => {
    expect(confirmGeofenceEntry({ coords: at(0), accuracy: ENTRY_MAX_ACCURACY_M + 1 }, [REGION])).toBe(false);
  });

  it('no fix → no evidence, no punch', () => {
    expect(confirmGeofenceEntry(null, [REGION])).toBe(false);
  });

  it('no armed regions → nothing to be inside of, no punch', () => {
    expect(confirmGeofenceEntry({ coords: at(0), accuracy: 20 }, [])).toBe(false);
  });

  it('inside the SECOND of several regions → check in', () => {
    const far = { lat: 23.03, lng: 72.57, radius: 100 };
    expect(confirmGeofenceEntry({ coords: at(60), accuracy: 20 }, [far, REGION])).toBe(true);
  });
});

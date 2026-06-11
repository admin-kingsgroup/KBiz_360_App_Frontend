import { useEffect, useState, useCallback } from 'react';
import * as Location from 'expo-location';
import type { Coords } from '../types';

export type GeoState = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable';

// Geofence integration. Watches the device location via expo-location and exposes coords +
// state. Feeds the foundation computePresence (via the screen calling attendanceStore.refreshPresence).
// simulate() mirrors the source "at office / away" test controls so presence can be exercised
// without real GPS (e.g. in the simulator).
export function useGeoFence(office: { lat: number; lng: number } | null) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoState, setGeoState] = useState<GeoState>('idle');

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    setCoords(null);
    (async () => {
      try {
        setGeoState('locating');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') { setGeoState('denied'); return; }
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 5 },
          (pos) => { if (!cancelled) { setGeoState('ok'); setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); } },
        );
      } catch {
        if (!cancelled) setGeoState('unavailable');
      }
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [office?.lat, office?.lng]);

  // Test control: drop a coord near (inside) or far (outside) the office, like source simGeo.
  const simulate = useCallback((here: boolean) => {
    if (!office) return;
    setGeoState('ok');
    setCoords(here ? { lat: office.lat + 0.0003, lng: office.lng + 0.0003 } : { lat: office.lat + 0.05, lng: office.lng + 0.05 });
  }, [office]);

  return { coords, geoState, simulate };
}

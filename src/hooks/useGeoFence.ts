import { useEffect, useState, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { distanceMeters } from '../logic/geo';
import type { Coords } from '../types';

// Ignore fixes that moved less than this — indoor GPS jitters a few metres constantly, and every
// accepted fix re-renders the whole attendance screen. Small vs the 150 m office radius and the
// 50 m exit buffer, so presence decisions are unaffected.
const MIN_MOVE_M = 12;

export type GeoState = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable';

// Geofence integration. Watches the device location via expo-location and exposes coords +
// state. Feeds the foundation computePresence (via the screen calling attendanceStore.refreshPresence).
// simulate() mirrors the source "at office / away" test controls so presence can be exercised
// without real GPS (e.g. in the simulator).
export function useGeoFence(office: { lat: number; lng: number } | null) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoState, setGeoState] = useState<GeoState>('idle');
  const lastFix = useRef<Coords | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    lastFix.current = null;
    setCoords(null);
    (async () => {
      try {
        setGeoState('locating');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') { setGeoState('denied'); return; }
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 5 },
          (pos) => {
            if (cancelled) return;
            setGeoState('ok'); // same-value sets are free — React bails out
            const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            if (lastFix.current && distanceMeters(lastFix.current, next) < MIN_MOVE_M) return; // jitter, not movement
            lastFix.current = next;
            setCoords(next);
          },
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
    const next = here ? { lat: office.lat + 0.0003, lng: office.lng + 0.0003 } : { lat: office.lat + 0.05, lng: office.lng + 0.05 };
    lastFix.current = next;
    setCoords(next);
  }, [office]);

  return { coords, geoState, simulate };
}

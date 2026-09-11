import { useEffect, useState, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { distanceMeters } from '../logic/geo';
import type { Coords } from '../types';

// Ignore fixes that moved less than this — indoor GPS jitters constantly (fused-location wobbles
// of 30-80 m are routine), and every accepted fix re-renders the whole attendance screen. 12 m let
// ordinary indoor wander through every few seconds; 25 m swallows most of it while staying small
// vs the 150 m office radius and the 50 m exit buffer, so presence decisions are unaffected.
const MIN_MOVE_M = 25;

export type GeoState = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable';

// Geofence integration. Watches the device location via expo-location and exposes coords +
// state. Feeds the foundation computePresence (via the screen calling attendanceStore.refreshPresence).
// simulate() mirrors the source "at office / away" test controls so presence can be exercised
// without real GPS (e.g. in the simulator).
//
// NEVER PROMPTS. This hook only READS the permission: an OS dialog popping on mount, with no
// in-app disclosure in front of it, is what got the 1.1.0 update rejected by Google Play
// (Prominent Disclosure, 09-10). When permission is missing it reports 'denied' and the screen
// offers an "Allow location" action that runs requestLocationWithDisclosure() and then calls
// refresh() here to start the watch.
export function useGeoFence(office: { lat: number; lng: number } | null) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoState, setGeoState] = useState<GeoState>('idle');
  const [attempt, setAttempt] = useState(0); // bumped by refresh() to re-run the watch effect
  const lastFix = useRef<Coords | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    lastFix.current = null;
    setCoords(null);
    // No office (not loaded yet, or the caller is attendance-exempt) → no GPS watch at all.
    if (!office) { setGeoState('idle'); return; }
    (async () => {
      try {
        setGeoState('locating');
        const { status } = await Location.getForegroundPermissionsAsync(); // read-only — no dialog
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
        // Cleanup may have run while watchPositionAsync was still resolving — `sub` was null then,
        // so nothing was removed. Without this check the native High/4s watcher leaks for the life
        // of the process (one per raced open/close of the screen), silently burning GPS + memory.
        if (cancelled) { sub.remove(); sub = null; }
      } catch {
        if (!cancelled) setGeoState('unavailable');
      }
    })();
    return () => { cancelled = true; sub?.remove(); };
    // Deliberately keyed on the coordinates (not the object identity) so a re-fetched office
    // with the same location doesn't restart the GPS watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [office?.lat, office?.lng, attempt]);

  // Re-check permission and (re)start the watch — call after the user grants location.
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  // Test control: drop a coord near (inside) or far (outside) the office, like source simGeo.
  const simulate = useCallback((here: boolean) => {
    if (!office) return;
    setGeoState('ok');
    const next = here ? { lat: office.lat + 0.0003, lng: office.lng + 0.0003 } : { lat: office.lat + 0.05, lng: office.lng + 0.05 };
    lastFix.current = next;
    setCoords(next);
  }, [office]);

  return { coords, geoState, simulate, refresh };
}

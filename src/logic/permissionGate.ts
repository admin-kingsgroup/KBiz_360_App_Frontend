// Background-location gate policy. The app REQUIRES the real OS "Allow all the time" location
// permission before the user can enter, so background geofence attendance can never be silently
// broken by a missing/downgraded grant. 'unavailable' (Expo Go / no native module / permissions API
// failure) cannot be enforced — treat it as satisfied so dev flows keep working.
export type BgLocationStatus = 'granted' | 'foreground-only' | 'denied' | 'unavailable';

export function locationPermSatisfied(status: BgLocationStatus): boolean {
  return status === 'granted' || status === 'unavailable';
}

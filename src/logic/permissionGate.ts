// Location gate policy. The app STRICTLY REQUIRES background location ("Allow all the time") —
// without it the app will not open. Background location powers geofence auto check-in/out even
// when the app is closed, which is the core attendance guarantee. 'foreground-only' ("While using
// the app") does NOT pass, and 'denied' (location fully off) does not pass. 'unavailable'
// (Expo Go / no native module / permissions API failure) cannot be enforced — treat it as
// satisfied so dev flows keep working.
export type BgLocationStatus = 'granted' | 'foreground-only' | 'denied' | 'unavailable';

export function locationPermSatisfied(status: BgLocationStatus): boolean {
  return status === 'granted' || status === 'unavailable';
}

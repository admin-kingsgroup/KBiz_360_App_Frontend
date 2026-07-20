// Location gate policy. The app REQUIRES location while using the app ("While using the app" is
// enough) so the office Wi-Fi / geofence can detect presence and the user can punch. Background
// ("Allow all the time") is OPTIONAL — it only adds auto check-in/out while the app is closed; the
// app still offers to enable it, but never blocks entry on it. 'denied' (location fully off) does
// NOT pass. 'unavailable' (Expo Go / no native module / permissions API failure) cannot be enforced
// — treat it as satisfied so dev flows keep working.
export type BgLocationStatus = 'granted' | 'foreground-only' | 'denied' | 'unavailable';

export function locationPermSatisfied(status: BgLocationStatus): boolean {
  return status === 'granted' || status === 'foreground-only' || status === 'unavailable';
}

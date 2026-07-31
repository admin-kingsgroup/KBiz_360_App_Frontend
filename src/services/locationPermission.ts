import { Linking } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import type * as LocationModuleT from 'expo-location';
import type { BgLocationStatus } from '../logic/permissionGate';

// Real OS location permissions. The ENTRY GATE needs only foreground ("While using the app") —
// requestForegroundLocation. Background ("Allow all the time") powers geofence auto-punch with the
// app closed and is requested ONLY from the Attendance screen's optional nudge — never at app open
// (on Android 11+ the bg request drops the user into the system Settings page, which read as
// "Allow all the time is compulsory to open the app"). Lazy-required + Expo-Go-guarded exactly
// like backgroundAttendance: background location isn't available in Expo Go.
type LocationModule = typeof LocationModuleT;
let _loc: LocationModule | null = null;
function loc(): LocationModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!_loc) _loc = require('expo-location') as LocationModule;
  return _loc;
}

// Current status WITHOUT prompting — used by the revocation guard on app open/foreground.
export async function getBackgroundLocationStatus(): Promise<BgLocationStatus> {
  if (isRunningInExpoGo()) return 'unavailable';
  try {
    const Location = loc();
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return 'denied';
    const bg = await Location.getBackgroundPermissionsAsync();
    return bg.status === 'granted' ? 'granted' : 'foreground-only';
  } catch {
    return 'unavailable';
  }
}

// Foreground prompt ONLY ("While using the app") — what the entry gate uses. Never triggers the
// background/settings-page flow. If background was already granted earlier, still reports 'granted'
// so the UI reflects the stronger grant.
export async function requestForegroundLocation(): Promise<BgLocationStatus> {
  if (isRunningInExpoGo()) return 'unavailable';
  try {
    const Location = loc();
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return 'denied';
    const bg = await Location.getBackgroundPermissionsAsync(); // read-only — no prompt, no Settings page
    return bg.status === 'granted' ? 'granted' : 'foreground-only';
  } catch {
    return 'unavailable';
  }
}

// Fire BOTH OS prompts: foreground first, then background ("Allow all the time"; Android 11+ routes
// this through the app's location settings page). Used ONLY by the Attendance screen's optional
// auto-punch nudge — never by the entry gate.
export async function requestBackgroundLocation(): Promise<BgLocationStatus> {
  if (isRunningInExpoGo()) return 'unavailable';
  try {
    const Location = loc();
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return 'denied';
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted' ? 'granted' : 'foreground-only';
  } catch {
    return 'unavailable';
  }
}

export function openLocationSettings(): void {
  void Linking.openSettings();
}

import { Linking } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import type * as LocationModuleT from 'expo-location';
import type { BgLocationStatus } from '../logic/permissionGate';

// Real OS background-location ("Allow all the time") permission, required by the entry gate so
// background geofence attendance always works. Lazy-required + Expo-Go-guarded exactly like
// backgroundAttendance: background location isn't available in Expo Go.
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

// Fire BOTH OS prompts: foreground first, then background ("Allow all the time"; Android 11+ routes
// this through the app's location settings page). Used by the ENTRY GATE — "Allow all the time" is
// strictly required to open the app — and by the Attendance screen's re-prompt.
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

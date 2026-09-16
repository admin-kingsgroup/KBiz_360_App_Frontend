import { Linking } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import type * as LocationModuleT from 'expo-location';
import type { BgLocationStatus } from '../logic/permissionGate';
import { locationFlowStep, requestResultFrom, type LocationPurpose, type LocationRequestResult } from '../logic/locationDisclosure';
import { askLocationDisclosure } from './locationDisclosure';

// Real OS location permissions. FOREGROUND ("While using the app") is the only permission the
// Android build declares (background location was dropped from app.json after the Play rejection
// of 09-10 — staff attendance checks the office only while the screen is open). Every prompt goes
// through requestLocationWithDisclosure, which shows the in-app disclosure and waits for "I agree"
// BEFORE the OS dialog — the Play "Prominent Disclosure" rule. Nothing else in the app may call
// expo-location's request*PermissionsAsync directly. Lazy-required + Expo-Go-guarded like
// backgroundAttendance.
type LocationModule = typeof LocationModuleT;
let _loc: LocationModule | null = null;
function loc(): LocationModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!_loc) _loc = require('expo-location') as LocationModule;
  return _loc;
}

// Current status WITHOUT prompting — used by the revocation guard on app open/foreground and by
// the attendance GPS watch (which must never prompt on its own).
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

// Foreground permission, gated by the in-app disclosure:
//   already granted → 'granted' immediately (no disclosure, no dialog);
//   otherwise show the disclosure for `purpose` → "Not now" resolves 'declined' with NO OS dialog;
//   "I agree" fires the OS prompt (or, when the OS will no longer prompt, resolves 'blocked' so
//   the caller can route to Settings).
export async function requestLocationWithDisclosure(purpose: LocationPurpose): Promise<LocationRequestResult> {
  if (isRunningInExpoGo()) return 'unavailable';
  let Location: LocationModule;
  let step: ReturnType<typeof locationFlowStep>;
  try {
    Location = loc();
    const cur = await Location.getForegroundPermissionsAsync();
    step = locationFlowStep(cur.status === 'granted', cur.canAskAgain);
  } catch {
    return 'unavailable';
  }
  if (step === 'granted') return 'granted';
  const agreed = await askLocationDisclosure(purpose);
  if (!agreed) return 'declined';
  if (step === 'blocked') return 'blocked';
  try {
    const res = await Location.requestForegroundPermissionsAsync();
    return requestResultFrom(res.status, res.canAskAgain);
  } catch {
    return 'unavailable';
  }
}

export function openLocationSettings(): void {
  void Linking.openSettings();
}

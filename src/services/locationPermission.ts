import { Linking } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import type * as LocationModuleT from 'expo-location';
import { locationGateSatisfied, type BgLocationStatus } from '../logic/permissionGate';
import { locationFlowStep, requestResultFrom, type LocationPurpose, type LocationRequestResult } from '../logic/locationDisclosure';
import { askLocationDisclosure } from './locationDisclosure';
import { currentUserHasTrailConsent, recordTrailConsentForCurrentUser } from './trailConsent';

// Real OS location permissions. The ENTRY GATE requires background location ("Allow all the time"
// / "Always") — owner decision 2026-10-05, see logic/permissionGate — requested ONLY through
// requestAlwaysLocationWithDisclosure. The in-screen helpers (attendance / chat / admin) keep using
// requestLocationWithDisclosure, which asks for foreground access. Every prompt is preceded by the
// in-app disclosure and waits for "I agree" BEFORE the OS dialog — the Play "Prominent Disclosure"
// rule. Nothing else in the app may call expo-location's request*PermissionsAsync directly.
// Lazy-required + Expo-Go-guarded like backgroundAttendance.
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

// Whether the entry gate is satisfied right now, WITHOUT prompting: the OS background grant AND
// this account's accepted disclosure. Used by the revocation guard on every app open/foreground
// and by the permissions screen when the user returns from Settings.
export async function getLocationGate(): Promise<{ status: BgLocationStatus; satisfied: boolean }> {
  const status = await getBackgroundLocationStatus();
  const disclosed = status === 'granted' ? await currentUserHasTrailConsent() : false;
  return { status, satisfied: locationGateSatisfied(status, disclosed) };
}

// The entry gate's request. Order matters:
//   1. the background-location disclosure ('trail' copy) — shown unless this account already
//      accepted it; "Not now" ends here with NO OS dialog and the app stays closed;
//   2. foreground permission if missing (the OS will not offer "all the time" without it);
//   3. background permission — Android 11+ opens the system page where the person picks
//      "Allow all the time"; iOS shows its one-time "Change to Always Allow" prompt.
// Returns the gate state afterwards plus whether the disclosure was declined (no hint needed then).
// MUST be called from a user tap, never from an AppState handler (a permission request bounces
// the activity and re-fires 'active' — see the loop note in backgroundAttendance).
export async function requestAlwaysLocationWithDisclosure(): Promise<{ status: BgLocationStatus; satisfied: boolean; declined: boolean }> {
  if (isRunningInExpoGo()) return { status: 'unavailable', satisfied: true, declined: false };
  try {
    const Location = loc();
    if (!(await currentUserHasTrailConsent())) {
      const agreed = await askLocationDisclosure('trail');
      if (!agreed) return { ...(await getLocationGate()), declined: true };
      await recordTrailConsentForCurrentUser();
    }
    let fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted' && fg.canAskAgain !== false) fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status === 'granted') {
      const bg = await Location.getBackgroundPermissionsAsync();
      if (bg.status !== 'granted' && bg.canAskAgain !== false) await Location.requestBackgroundPermissionsAsync();
    }
  } catch { /* fall through to the honest re-read below */ }
  return { ...(await getLocationGate()), declined: false };
}

export function openLocationSettings(): void {
  void Linking.openSettings();
}

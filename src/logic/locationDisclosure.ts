import type { BgLocationStatus } from './permissionGate';

// Google Play "Prominent Disclosure and Consent" (User Data policy) — the 1.1.0 (vc21) update was
// REJECTED on 2026-09-10 because the OS location dialog appeared without an in-app disclosure
// immediately before it. The rule: right before EVERY location prompt the app must show its own
// screen that names the data (location), the purpose, and how it is used/shared, and the user must
// take an affirmative action ("I agree") before the OS dialog fires. Nothing else may share that
// screen, it must not auto-dismiss, and a privacy-policy link alone does not count.
//
// This module is the pure, testable half: the copy per purpose and the flow decision. The service
// (services/locationPermission.ts) owns the OS calls; the modal lives in components/LocationDisclosureHost.
//
// Android declares FOREGROUND location only (background location was removed from app.json in the
// same fix — staff attendance never used it: the office check runs only while the screen is open).
// Keep the copy honest to that: "only while the app is open".

export type LocationPurpose = 'attendance' | 'chat' | 'admin';

export interface LocationDisclosureCopy { title: string; body: string; points: string[] }

export const LOCATION_DISCLOSURE: Record<LocationPurpose, LocationDisclosureCopy> = {
  attendance: {
    title: 'Location access',
    body: 'KBiz 360 - Smart Connect collects your location while you use the app to confirm you are at your branch office when you check in or check out.',
    points: [
      'Used only while the app is open — nothing is tracked in the background or when the app is closed.',
      'Used only for attendance: your distance from the office is recorded with each check-in / check-out.',
      'Shared only with your company’s HR and admin team. Never sold, never used for advertising.',
    ],
  },
  chat: {
    title: 'Share your location',
    body: 'KBiz 360 - Smart Connect uses your current location only when you tap “Share location”, to send a map pin of where you are into this chat.',
    points: [
      'Used only at the moment you share it — no background tracking.',
      'Shared only with the people in this conversation.',
    ],
  },
  admin: {
    title: 'Use your location',
    body: 'KBiz 360 - Smart Connect reads your current location only when you tap “Use my location”, to fill in the coordinates of an office in this form.',
    points: [
      'Used once, while the app is open — no background tracking.',
      'Saved only as the office coordinates you are editing.',
    ],
  },
};

// What to do given the CURRENT foreground permission state, read without prompting.
//  - 'granted'  → nothing to show, no prompt needed.
//  - 'disclose' → show the disclosure; on "I agree" fire the OS prompt.
//  - 'blocked'  → the OS will not prompt again (hard deny); still show the disclosure so the user
//                 knows why, then send them to Settings instead of a prompt that cannot appear.
export type LocationFlowStep = 'granted' | 'disclose' | 'blocked';

export function locationFlowStep(granted: boolean, canAskAgain: boolean | undefined): LocationFlowStep {
  if (granted) return 'granted';
  return canAskAgain === false ? 'blocked' : 'disclose';
}

// Outcome of a disclosure-gated request.
//  granted     — OS grant in hand.
//  denied      — user tapped "Don't allow" on the OS dialog (may be asked again later).
//  blocked     — OS will not show the dialog (hard deny) → route to Settings.
//  declined    — user tapped "Not now" on OUR disclosure; the OS dialog never appeared.
//  unavailable — Expo Go / no native module / permissions API threw (cannot be enforced).
export type LocationRequestResult = 'granted' | 'denied' | 'blocked' | 'declined' | 'unavailable';

export function requestResultFrom(status: string, canAskAgain: boolean | undefined): LocationRequestResult {
  if (status === 'granted') return 'granted';
  return canAskAgain === false ? 'blocked' : 'denied';
}

// Map a request outcome onto the entry gate's status vocabulary (logic/permissionGate).
export function toGateStatus(result: LocationRequestResult): BgLocationStatus {
  if (result === 'granted') return 'foreground-only';
  if (result === 'unavailable') return 'unavailable';
  return 'denied';
}

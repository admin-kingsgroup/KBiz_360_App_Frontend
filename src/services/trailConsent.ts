import { loadSession } from './storage/session';

// Who accepted the background-location disclosure on this phone. One account id: a different
// person signing in on the same phone does not inherit the previous person's agreement — the gate
// shows them the disclosure again. AsyncStorage only (lazy-required so the pure test graph stays
// free of native modules), shared by the entry gate (locationPermission) and the trail service.
const CONSENT_KEY = 'kb360-trail-consent';

type Storage = typeof import('@react-native-async-storage/async-storage').default;
function store(): Storage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@react-native-async-storage/async-storage') as typeof import('@react-native-async-storage/async-storage')).default;
}

export async function hasTrailConsent(userId: string): Promise<boolean> {
  try { return (await store().getItem(CONSENT_KEY)) === userId; } catch { return false; }
}

export async function recordTrailConsent(userId: string): Promise<void> {
  try { await store().setItem(CONSENT_KEY, userId); } catch { /* the gate simply asks again */ }
}

// For the signed-in account (read from the persisted session — works headlessly too).
export async function currentUserHasTrailConsent(): Promise<boolean> {
  const session = await loadSession();
  return !!session && hasTrailConsent(session.myUserId);
}

export async function recordTrailConsentForCurrentUser(): Promise<void> {
  const session = await loadSession();
  if (session) await recordTrailConsent(session.myUserId);
}

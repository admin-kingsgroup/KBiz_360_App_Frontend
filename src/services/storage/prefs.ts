import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Permissions } from '../../types';

// Persisted onboarding prefs — the RN equivalent of the source `KV` localStorage wrapper.
// Mirrors source keys/semantics: perms + attendance consent persist so the gate is "asked once".
const PERMS_KEY = 'kb360_perms';
const CONSENT_KEY = 'kb360_attConsent';

export interface StoredPrefs {
  perms?: Permissions;
  consent?: boolean;
}

export async function loadPrefs(): Promise<StoredPrefs> {
  try {
    const pairs = await AsyncStorage.multiGet([PERMS_KEY, CONSENT_KEY]);
    const map = Object.fromEntries(pairs);
    return {
      perms: map[PERMS_KEY] ? (JSON.parse(map[PERMS_KEY]) as Permissions) : undefined,
      consent: map[CONSENT_KEY] != null ? (JSON.parse(map[CONSENT_KEY]) as boolean) : undefined,
    };
  } catch {
    return {};
  }
}

export async function savePerms(perms: Permissions): Promise<void> {
  try { await AsyncStorage.setItem(PERMS_KEY, JSON.stringify(perms)); } catch { /* no-op */ }
}

export async function saveConsent(consent: boolean): Promise<void> {
  try { await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(consent)); } catch { /* no-op */ }
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../../types';

// Persisted auth session so the user stays signed in across app restarts (WhatsApp-style: signed in
// until they explicitly log out). The refresh token renews the access token on 401; only an expired/
// revoked refresh token (or logout) ends the session. Stored in AsyncStorage.
const KEY = 'kb360_session';

export interface StoredSession {
  access: string;
  refresh: string;
  user: User;
  myUserId: string;
}

export async function saveSession(s: StoredSession): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(s)); } catch { /* no-op */ }
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch { /* no-op */ }
}

// Keep the stored tokens in sync after a refresh (rotated tokens), preserving the rest of the session.
export async function updateStoredTokens(access: string, refresh: string): Promise<void> {
  try {
    const s = await loadSession();
    if (s) await saveSession({ ...s, access, refresh });
  } catch { /* no-op */ }
}

// Keep the stored user in sync after a profile change (avatar/name) or a /me refresh, so the next
// app launch restores the CURRENT user — not the one captured at login time.
export async function updateStoredUser(user: User): Promise<void> {
  try {
    const s = await loadSession();
    if (s) await saveSession({ ...s, user });
  } catch { /* no-op */ }
}

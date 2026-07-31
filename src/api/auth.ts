import { apiFetch, registerRefreshHandler, ApiError } from './client';
import { setTokens, getRefreshToken, clearTokens } from './tokens';
import { useAuthStore } from '../store/authStore';
import { useAccessStore } from '../store/accessStore';
import { useMessagingStore } from '../store/messagingStore';
import { useUiStore } from '../store/uiStore';
import { saveSession, loadSession, clearSession, updateStoredTokens, updateStoredUser } from '../services/storage/session';
import { mediaUrl } from './media';
import { ROLE_DEFS } from '../constants/roles';
import type { RoleKey, User } from '../types';

// Shape returned by the Mongo backend (/api/auth/login, /me).
export interface BackendUser {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  role: string; // CRM role name ('super_admin'…) — or a RoleKey when the mock backend is used
  level?: number;
  branchIds?: string[];
  branches?: string[];
  avatar?: string | null; // profile picture url (relative or absolute)
}
export interface BackendAccess {
  isSuper?: boolean;
  roleName?: string;
  level?: number;
  canManage?: boolean;
  companyWide?: boolean;
  branchIds?: string[] | null;
  permissions?: string[];
  alerts?: string[]; // system-alert channel grants ("BOM-hr"…), super-admin managed
  [k: string]: unknown;
}
export interface Session {
  accessToken: string;
  refreshToken: string;
  user: BackendUser;
  access: BackendAccess;
}

// CRM role names → the frontend RoleKey used for display (badge/colour). "Director"/"GM" are
// designations, not roles — company_manager maps to DIRECTOR for the badge.
const ROLE_MAP: Record<string, RoleKey> = {
  super_admin: 'SUPER_ADMIN',
  company_manager: 'DIRECTOR',
  branch_manager: 'BRANCH_MANAGER',
  hod: 'HOD',
  employee: 'EMPLOYEE',
};
const ROLE_KEYS: RoleKey[] = ['SUPER_ADMIN', 'DIRECTOR', 'GENERAL_MANAGER', 'BRANCH_MANAGER', 'HOD', 'EMPLOYEE'];

function mapRole(role: string): RoleKey {
  if (ROLE_MAP[role]) return ROLE_MAP[role];
  const upper = role.toUpperCase();
  return (ROLE_KEYS as string[]).includes(upper) ? (upper as RoleKey) : 'EMPLOYEE';
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase() || 'U';
}

// Adapt the backend user into the frontend `User` so the existing gate + profile render unchanged.
function toFrontendUser(bu: BackendUser, access: BackendAccess): User {
  const role = mapRole(bu.role);
  const name = bu.name ?? `${bu.firstName ?? ''} ${bu.lastName ?? ''}`.trim() ?? bu.email;
  const isSuper = access.isSuper ?? role === 'SUPER_ADMIN';
  return {
    id: bu.id,
    name: name || bu.email,
    initials: initialsOf(name || bu.email),
    color: ROLE_DEFS[role].color,
    role,
    email: bu.email,
    bizId: isSuper ? null : 'tk', // display scope; real branch grants are resolved server-side
    branches: bu.branchIds ?? bu.branches ?? [],
    accessGroups: [],
    accessDepts: [],
    accessAlerts: access.alerts ?? [], // → deriveAccess → alertOK gates the System Alerts channels
    scopeLine: access.roleName ?? bu.role,
    avatar: bu.avatar ? mediaUrl(bu.avatar) : null,
    phone: bu.phone ?? null, // carried so the profile editor can prefill it (else Save wipes it)
  };
}

// POST /auth/login — stores tokens, updates auth/access stores (drives the gate). Returns the raw session.
export async function login(identifier: string, password: string): Promise<Session> {
  const s = await apiFetch<Session>('/api/auth/login', { method: 'POST', auth: false, body: { identifier, password } });
  setTokens(s.accessToken, s.refreshToken);
  const fe = toFrontendUser(s.user, s.access);
  useAccessStore.getState().setUser(fe);
  useAuthStore.getState().signIn(fe, s.accessToken);
  useUiStore.getState().showToast(null); // clear any lingering toast (e.g. a prior "Signed out")
  // Realtime chat: identify the current user. The socket is connected from the app layer
  // (app/_layout) reacting to auth status, so this module stays free of socket/runtime deps.
  useMessagingStore.getState().setMyUserId(s.user.id);
  // Persist so the session survives app restarts (signed in until explicit logout).
  await saveSession({ access: s.accessToken, refresh: s.refreshToken, user: fe, myUserId: s.user.id });
  return s;
}

// Restore a persisted session at app launch (no network needed — works offline; the first API call
// refreshes the access token on 401). Returns true if a session was restored. Drives the gate.
export async function restoreSession(): Promise<boolean> {
  const s = await loadSession();
  if (!s) return false;
  setTokens(s.access, s.refresh);
  useAccessStore.getState().setUser(s.user);
  useAuthStore.getState().signIn(s.user, s.access);
  useMessagingStore.getState().setMyUserId(s.myUserId);
  // The persisted user is a snapshot from login time — the avatar (or name/role) may have changed
  // since. Refresh from /me in the background so the profile picture shows on launch, not only
  // after the Profile tab happens to reload it. Fire-and-forget: offline launch stays instant.
  void refreshMe();
  return true;
}

export function me(): Promise<{ user: BackendUser; access: BackendAccess }> {
  return apiFetch('/api/auth/me');
}

// Re-fetch the signed-in user from the server and sync it into the stores + the persisted session.
// Used after launch-restore and after profile edits (avatar/name) so every surface — and the next
// app start — shows the current user without needing to visit the Profile tab.
export async function refreshMe(): Promise<void> {
  try {
    const { user, access } = await me();
    const fe = toFrontendUser(user, access);
    useAccessStore.getState().setUser(fe);
    const auth = useAuthStore.getState();
    if (auth.status === 'signedIn') auth.signIn(fe, auth.token ?? undefined);
    await updateStoredUser(fe);
  } catch { /* offline or expired session — keep the restored snapshot */ }
}

// Refresh + retry hook used by the client on 401. Returns false (and signs out) when it can't refresh.
// SINGLE-FLIGHT: refresh tokens rotate (the backend revokes the old one), so two concurrent 401s must
// share ONE refresh — otherwise the second sends an already-revoked token and forces a spurious logout.
let refreshInFlight: Promise<boolean> | null = null;
export function refresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const t = await apiFetch<{ accessToken: string; refreshToken: string }>('/api/auth/refresh', {
        method: 'POST',
        auth: false,
        body: { refreshToken: rt },
      });
      setTokens(t.accessToken, t.refreshToken);
      // AWAIT the persistence: tokens rotate server-side, so if the app dies before this write
      // lands, the next launch replays the OLD refresh token. (The server now also keeps a
      // rotated token alive for a 48h grace window as the second half of this fix.)
      await updateStoredTokens(t.accessToken, t.refreshToken);
      return true;
    } catch (e) {
      // Only wipe the session when the server GENUINELY rejects the refresh token (401/403). A
      // network drop, timeout, or 5xx/proxy error is transient — destroying the persisted session
      // for those logs the user out over a momentary blip (elevator, handoff). Keep the tokens so
      // the next request can retry; the caller just gets `false` for this attempt.
      const authRejected = e instanceof ApiError && (e.status === 401 || e.status === 403);
      if (authRejected) {
        clearTokens();
        void clearSession();
        useAuthStore.getState().signOut();
      }
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// Full sign-out: revoke server-side, clear persisted session + tokens, and reset ALL per-user stores
// so nothing leaks into the next session (or re-restores the "logged out" user on next launch).
export async function logout(): Promise<void> {
  const rt = getRefreshToken();
  if (rt) {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', auth: false, body: { refreshToken: rt } });
    } catch {
      /* best-effort */
    }
  }
  clearTokens();
  await clearSession();
  // Stop background geofencing (don't punch for a signed-out user). Lazy-required so this core
  // module's test graph stays free of native (expo-task-manager / expo-constants) dependencies.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  void (require('../services/backgroundAttendance') as typeof import('../services/backgroundAttendance')).stopAttendanceGeofencing();
  useAuthStore.getState().signOut();
  useAccessStore.getState().setViewAs(null);
  useAccessStore.getState().setUser(null);
  useAccessStore.getState().setUsers([]);
  useMessagingStore.getState().reset();
  useMessagingStore.getState().setMyUserId(null);
  // App-icon badge + displayed chat notifications belong to the signed-out account. Lazy-required
  // (same reason as above): chatNotifications pulls expo/expo-constants into the import graph.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  void (require('../services/chatNotifications') as typeof import('../services/chatNotifications')).clearChatNotificationsForLogout();
  // Per-user stores that persist to disk (mailbox, alert feed) or hold personal state MUST be wiped
  // too — otherwise the next user to sign in on this device sees the previous user's cached data.
  // Lazy-required to keep this core module's test graph free of their (native) dependency chains.
  /* eslint-disable @typescript-eslint/no-require-imports */
  (require('../store/emailStore') as typeof import('../store/emailStore')).useEmailStore.getState().resetForLogout();
  (require('../store/pulseStore') as typeof import('../store/pulseStore')).usePulseStore.getState().reset();
  (require('../store/reminderBadgeStore') as typeof import('../store/reminderBadgeStore')).useReminderBadgeStore.getState().reset();
  (require('../store/attendanceStore') as typeof import('../store/attendanceStore')).useAttendanceStore.getState().reset();
  /* eslint-enable @typescript-eslint/no-require-imports */
}

registerRefreshHandler(refresh);

import { apiFetch, registerRefreshHandler } from './client';
import { setTokens, getRefreshToken, clearTokens } from './tokens';
import { useAuthStore } from '../store/authStore';
import { useAccessStore } from '../store/accessStore';
import { useMessagingStore } from '../store/messagingStore';
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
}
export interface BackendAccess {
  isSuper?: boolean;
  roleName?: string;
  level?: number;
  canManage?: boolean;
  companyWide?: boolean;
  branchIds?: string[] | null;
  permissions?: string[];
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
    accessAlerts: [],
    scopeLine: access.roleName ?? bu.role,
  };
}

// POST /auth/login — stores tokens, updates auth/access stores (drives the gate). Returns the raw session.
export async function login(identifier: string, password: string): Promise<Session> {
  const s = await apiFetch<Session>('/api/auth/login', { method: 'POST', auth: false, body: { identifier, password } });
  setTokens(s.accessToken, s.refreshToken);
  const fe = toFrontendUser(s.user, s.access);
  useAccessStore.getState().setUser(fe);
  useAuthStore.getState().signIn(fe, s.accessToken);
  // Realtime chat: identify the current user. The socket is connected from the app layer
  // (app/_layout) reacting to auth status, so this module stays free of socket/runtime deps.
  useMessagingStore.getState().setMyUserId(s.user.id);
  return s;
}

export function me(): Promise<{ user: BackendUser; access: BackendAccess }> {
  return apiFetch('/api/auth/me');
}

// Refresh + retry hook used by the client on 401. Returns false (and signs out) when it can't refresh.
export async function refresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  try {
    const t = await apiFetch<{ accessToken: string; refreshToken: string }>('/api/auth/refresh', {
      method: 'POST',
      auth: false,
      body: { refreshToken: rt },
    });
    setTokens(t.accessToken, t.refreshToken);
    return true;
  } catch {
    clearTokens();
    useAuthStore.getState().signOut();
    return false;
  }
}

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
  useAuthStore.getState().signOut();
  useMessagingStore.getState().reset();
  useMessagingStore.getState().setMyUserId(null);
}

registerRefreshHandler(refresh);

import { apiFetch } from './client';

// Super-admin: app-access control (which users may use the app). Stored in kb360_app (CRM is read-only).
export const getUserAccess = (): Promise<Record<string, boolean>> => apiFetch('/api/admin/user-access');
export const setUserAccess = (userId: string, enabled: boolean): Promise<{ ok: boolean }> =>
  apiFetch('/api/admin/user-access', { method: 'POST', body: { userId, enabled } });

// Super-admin: set a user's display position / job title (distinct from their CRM role). Blank clears it.
export const setUserPosition = (userId: string, position: string): Promise<{ ok: boolean }> =>
  apiFetch('/api/admin/positions', { method: 'POST', body: { userId, position } });

// Super-admin: whether a user's attendance is taken. { [userId]: tracked }. Exempt = not tracked.
export const getAttendanceTracking = (): Promise<Record<string, boolean>> => apiFetch('/api/admin/attendance-tracking');
export const setAttendanceTracking = (userId: string, tracked: boolean): Promise<{ ok: boolean }> =>
  apiFetch('/api/admin/attendance-tracking', { method: 'POST', body: { userId, tracked } });

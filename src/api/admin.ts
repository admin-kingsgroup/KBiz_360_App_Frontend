import { apiFetch } from './client';

// Super-admin: app-access control (which users may use the app). Stored in kb360_app (CRM is read-only).
export const getUserAccess = (): Promise<Record<string, boolean>> => apiFetch('/api/admin/user-access');
export const setUserAccess = (userId: string, enabled: boolean): Promise<{ ok: boolean }> =>
  apiFetch('/api/admin/user-access', { method: 'POST', body: { userId, enabled } });

// Super-admin: set a user's display position / job title (distinct from their CRM role). Blank clears it.
export const setUserPosition = (userId: string, position: string): Promise<{ ok: boolean }> =>
  apiFetch('/api/admin/positions', { method: 'POST', body: { userId, position } });

// Super-admin: which system-alert channels each user may see. Grants like "BOM-hr" / "AMD-hr"
// (branchCode-module, the same format makeAccessFilters.alertOK checks). Supers always see all.
export const getAlertVisibility = (): Promise<Record<string, string[]>> => apiFetch('/api/admin/alert-visibility');
export const setAlertVisibility = (userId: string, alerts: string[]): Promise<{ ok: boolean; alerts: string[] }> =>
  apiFetch('/api/admin/alert-visibility', { method: 'POST', body: { userId, alerts } });
// The grants each user MAY hold: the channels of the branches (and hub) they have access to. The
// server drops any other grant on save, so Team & Users lists only these.
export const getAlertGrantable = (): Promise<Record<string, string[]>> => apiFetch('/api/admin/alert-visibility/grantable');

// Super-admin: "Who sees this" for ONE alert channel — everyone in its branch (or hub) who can sign
// in, and why they do or don't see it. `why`: super (always) · branch (CRM / CRM Reports: the whole
// branch) · on / off (the switch decides) · no-erp (ERP / ERP Reports without ERP access: never).
export type AlertAudienceWhy = 'super' | 'branch' | 'on' | 'off' | 'no-erp';
export interface AlertAudienceRow { id: string; name: string; email: string; role: string; why: AlertAudienceWhy; canToggle: boolean }
export interface AlertAudience {
  channel: { id: string; name: string; branchCode: string; branchWide: boolean; needsErp: boolean };
  rows: AlertAudienceRow[];
}
export const getAlertAudience = (channelId: string): Promise<AlertAudience> =>
  apiFetch(`/api/admin/alert-channels/${encodeURIComponent(channelId)}/audience`);
export const setAlertAudience = (channelId: string, userId: string, on: boolean): Promise<{ ok: boolean; alerts: string[] }> =>
  apiFetch(`/api/admin/alert-channels/${encodeURIComponent(channelId)}/audience`, { method: 'POST', body: { userId, on } });

// Super-admin: whether a user's attendance is taken. { [userId]: tracked }. Exempt = not tracked.
export const getAttendanceTracking = (): Promise<Record<string, boolean>> => apiFetch('/api/admin/attendance-tracking');
export const setAttendanceTracking = (userId: string, tracked: boolean): Promise<{ ok: boolean }> =>
  apiFetch('/api/admin/attendance-tracking', { method: 'POST', body: { userId, tracked } });

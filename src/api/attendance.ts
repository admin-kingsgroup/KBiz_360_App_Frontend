import { apiFetch } from './client';
import type { Coords, PunchMethod, TeamAttendanceEntry } from '../types';

export interface PunchBody {
  wifiOn?: boolean; // legacy, ignored by the backend
  wifiSsid?: string | null; // the Wi-Fi network the device is connected to (backend verifies it)
  coords?: Coords | null;
  method?: 'auto' | 'face';
  // 'geofence' = distance-driven auto punch; the server applies its exit drift guard to these.
  source?: 'geofence';
  // ISO instant the OS FIRST detected this departure (pending-exit marker). Geofence-sourced
  // check-outs only — the server back-dates checkOutAt to it within hard bounds (same business
  // day, after check-in, not in the future).
  exitAt?: string;
  // URL of the face photo captured at punch time (uploaded via /api/uploads first). Required by
  // the server for both check-in and check-out (owner rules, 07-31).
  facePhotoUrl?: string;
}

export interface MyAttendance {
  date: string;
  inTime: string | null;
  outTime: string | null;
  via: PunchMethod | null;
  present?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  distanceMeters?: number | null;
  wifiSsid?: string | null;
  faceVerified?: boolean | null;
  exempt?: boolean; // attendance not tracked for this user
  hidden?: boolean; // background (director) attendance — silent geofence engine, no punch UI
}

export interface AttendanceOffice {
  id: string;
  branchId: string;
  label: string;
  address: string | null;
  lat: number;
  lng: number;
  radius: number;
  wifiSsid: string | null;
}

export interface AttendanceHistoryEntry {
  date: string; // 'YYYY-MM-DD'
  inTime: string | null;
  outTime: string | null;
  via: PunchMethod | null;
  present: boolean;
  distanceMeters: number | null;
  inPhoto?: string | null;  // face photos captured at punch time (admin verification)
  outPhoto?: string | null;
}

// Admin: one office geofence within a branch.
export interface AdminOfficeEntry {
  id: string;
  label: string | null;
  address: string | null;
  lat: number;
  lng: number;
  radius: number;
  active: boolean;
  isDefault: boolean;
  wifiSsid: string | null;
  updatedAt: string | null;
}
// Admin: a branch with its list of offices (0, 1, or many).
export interface AdminBranchOffices {
  branchId: string;
  code: string | null;
  name: string | null;
  city: string | null;
  offices: AdminOfficeEntry[];
}

export const checkIn = (body: PunchBody): Promise<MyAttendance> => apiFetch('/api/attendance/check-in', { method: 'POST', body });
export const checkOut = (body: PunchBody): Promise<MyAttendance> => apiFetch('/api/attendance/check-out', { method: 'POST', body });
export const getMyAttendance = (): Promise<MyAttendance> => apiFetch('/api/attendance/me');
// date 'YYYY-MM-DD' (business-tz) browses a past day; omit for today.
export const getTeamAttendance = (date?: string): Promise<TeamAttendanceEntry[]> => apiFetch(`/api/attendance/team${date ? `?date=${date}` : ''}`);
export const getAttendanceHistory = (days = 30): Promise<AttendanceHistoryEntry[]> => apiFetch(`/api/attendance/history?days=${days}`);
// Manager-only: a teammate's recent attendance (per-user history in the admin team view).
export const getUserAttendanceHistory = (userId: string, days = 30): Promise<AttendanceHistoryEntry[]> => apiFetch(`/api/attendance/history/user/${userId}?days=${days}`);
// Manager-only: correct one day — mark present (default 10:00–19:00 business time) or absent.
// Stored as method 'Manual' with an audit stamp of the admin who changed it.
export const adminSetAttendanceDay = (body: { userId: string; date: string; present: boolean; inTime?: string; outTime?: string }): Promise<MyAttendance> =>
  apiFetch('/api/attendance/admin/day', { method: 'POST', body });

// Office geofences the caller may punch at (drives the office picker + geofence presence).
export const getOffices = (): Promise<AttendanceOffice[]> => apiFetch('/api/attendance/offices');

// Admin (manager-only): branches with their offices, plus office CRUD + per-user assignment.
export const getAdminOffices = (): Promise<AdminBranchOffices[]> => apiFetch('/api/attendance/offices/admin');
export const createOffice = (body: { branchId: string; lat: number; lng: number; radius?: number; label?: string | null; address?: string | null; wifiSsid?: string | null; isDefault?: boolean }): Promise<unknown> =>
  apiFetch('/api/attendance/offices', { method: 'POST', body });
export const updateOffice = (officeId: string, body: { lat?: number; lng?: number; radius?: number; label?: string | null; address?: string | null; wifiSsid?: string | null; active?: boolean; isDefault?: boolean }): Promise<unknown> =>
  apiFetch(`/api/attendance/offices/id/${officeId}`, { method: 'PUT', body });
export const deleteOffice = (officeId: string): Promise<{ ok: boolean }> =>
  apiFetch(`/api/attendance/offices/id/${officeId}`, { method: 'DELETE' });
export const setDefaultOffice = (officeId: string): Promise<unknown> =>
  apiFetch(`/api/attendance/offices/id/${officeId}/default`, { method: 'POST' });
export const getOfficeAssignments = (): Promise<Record<string, string>> => apiFetch('/api/attendance/offices/assignments');
export const assignUserOffice = (userId: string, officeId: string | null): Promise<{ ok: boolean }> =>
  apiFetch('/api/attendance/offices/assign', { method: 'POST', body: { userId, officeId } });

// Admin (manager-only): per-user WORKING branch — where each person marks attendance.
// branchId null clears the assignment → the user falls back to their first CRM access branch.
export const getWorkBranchAssignments = (): Promise<Record<string, string>> => apiFetch('/api/attendance/work-branches');
export const assignUserWorkBranch = (userId: string, branchId: string | null): Promise<{ ok: boolean }> =>
  apiFetch('/api/attendance/work-branches/assign', { method: 'POST', body: { userId, branchId } });

import { apiFetch } from './client';
import type { Coords, PunchMethod, TeamAttendanceEntry } from '../types';

export interface PunchBody {
  wifiOn?: boolean;
  coords?: Coords | null;
  method?: 'auto' | 'face';
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
}

export const checkIn = (body: PunchBody): Promise<MyAttendance> => apiFetch('/api/attendance/check-in', { method: 'POST', body });
export const checkOut = (body: PunchBody): Promise<MyAttendance> => apiFetch('/api/attendance/check-out', { method: 'POST', body });
export const getMyAttendance = (): Promise<MyAttendance> => apiFetch('/api/attendance/me');
export const getTeamAttendance = (): Promise<TeamAttendanceEntry[]> => apiFetch('/api/attendance/team');

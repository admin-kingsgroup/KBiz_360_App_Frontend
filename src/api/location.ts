import { apiFetch } from './client';

// Work-hours location trail — admin reads. (The device's own uploads go through
// services/locationTrail, which must work headlessly without the in-memory token.)

// One person on the live roster. Scoped by the server exactly like the attendance team view.
export interface LivePerson {
  id: string;
  name: string;
  initials: string;
  color: string;
  branch: string;
  position: string | null;
  office: string | null;
  in: string | null; // today's check-in / check-out, formatted by the server (business time)
  out: string | null;
  tracking: boolean; // day open → the phone should be streaming
  last: { at: string; lat: number; lng: number; accuracy: number | null; today: boolean } | null;
}

export interface TrailPoint { at: string; lat: number; lng: number; accuracy: number | null; speed: number | null }

export interface TrailDay {
  userId: string;
  name: string;
  branch: string;
  date: string; // 'YYYY-MM-DD' business day
  checkInAt: string | null;
  checkOutAt: string | null;
  tracking: boolean;
  points: TrailPoint[];
  offices: { id: string; label: string | null; lat: number; lng: number; radius: number }[];
}

export const getLiveLocations = (): Promise<LivePerson[]> => apiFetch('/api/location/live');
// date 'YYYY-MM-DD' (business-tz) browses a past day; omit for today.
export const getLocationTrail = (userId: string, date?: string): Promise<TrailDay> =>
  apiFetch(`/api/location/trail/${userId}${date ? `?date=${date}` : ''}`);

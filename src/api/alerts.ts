import { apiFetch } from './client';

// System alerts — the Home "System Alerts" feed. The backend filters events by the caller's
// access (super-admins see every channel; others only channels a super-admin granted them).
export interface AlertEventDto {
  id: string;
  channelId: string;
  source: string;
  title: string;
  body: string;
  context: string;
  time: number; // epoch ms
  read: boolean; // per-user read flag
}

export const listAlerts = (): Promise<{ events: AlertEventDto[] }> => apiFetch('/api/alerts');

// Super-admin only: compose an announcement. recipients = userIds who see it; ['*'] = everyone.
export const createAlert = (input: { title: string; body?: string; recipients: string[] }): Promise<{ ok: boolean }> =>
  apiFetch('/api/alerts', { method: 'POST', body: input });

export const markAlertRead = (eventId: string): Promise<{ ok: boolean }> =>
  apiFetch('/api/alerts/read', { method: 'POST', body: { eventId } });

export const markAlertChannelRead = (channelId: string): Promise<{ ok: boolean }> =>
  apiFetch('/api/alerts/read', { method: 'POST', body: { channelId } });

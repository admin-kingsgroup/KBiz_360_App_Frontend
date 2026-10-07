import { apiFetch } from './client';
import type { AlertMuteMap } from '../logic/alertMutes';

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
  attachment?: { name: string; url: string }; // e.g. an invoice PDF (url may be server-relative)
  contact?: { name?: string; phone: string }; // e.g. a converted lead's client (E.164) → WhatsApp / Call
  link?: string; // https — e.g. the ticket a KGD alert is about (absent on older backends)
}

// `mutes` = the caller's muted channels (absent from backends older than 2026-09-30).
export const listAlerts = (): Promise<{ events: AlertEventDto[]; mutes?: AlertMuteMap }> => apiFetch('/api/alerts');

// Super-admin only: compose an announcement. recipients = userIds who see it; ['*'] = everyone.
export const createAlert = (input: { title: string; body?: string; recipients: string[] }): Promise<{ ok: boolean }> =>
  apiFetch('/api/alerts', { method: 'POST', body: input });

export const markAlertRead = (eventId: string): Promise<{ ok: boolean }> =>
  apiFetch('/api/alerts/read', { method: 'POST', body: { eventId } });

export const markAlertChannelRead = (channelId: string): Promise<{ ok: boolean }> =>
  apiFetch('/api/alerts/read', { method: 'POST', body: { channelId } });

// Mute (for muteHours, or always when null) or unmute channels for the caller only → their mutes.
export const setAlertMute = (channelIds: string[], muted: boolean, muteHours: number | null = null): Promise<{ mutes: AlertMuteMap }> =>
  apiFetch('/api/alerts/mute', { method: 'POST', body: { channelIds, muted, ...(muted ? { muteHours } : {}) } });

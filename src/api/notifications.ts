import { apiFetch } from './client';
import type { AppNotification } from '../types';

export const registerDevice = (expoPushToken: string, platform?: string): Promise<{ id: string; expoPushToken: string; platform: string | null }> =>
  apiFetch('/api/notifications/register-device', { method: 'POST', body: { expoPushToken, platform } });

export const listNotifications = (): Promise<AppNotification[]> => apiFetch('/api/notifications');

export const markNotificationsRead = (input: { id?: string; all?: boolean }): Promise<{ updated: number }> =>
  apiFetch('/api/notifications/read', { method: 'POST', body: input });

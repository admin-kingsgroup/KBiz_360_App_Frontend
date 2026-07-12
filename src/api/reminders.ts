import { apiFetch } from './client';
import type { ReminderGroup, RoleKey } from '../types';
import type { ReminderRecord } from '../data/reminders';

export type ReminderTab = 'forme' | 'iset' | 'review' | 'all' | 'archive';

export interface ReminderListResponse {
  tab: ReminderTab;
  isAll: boolean;
  reviewCount: number;
  viewer: { id?: string; role?: RoleKey };
  groups: ReminderGroup[];
  visible: ReminderRecord[];
}

export interface PatchResult {
  reminder: ReminderRecord;
  result: 'archived' | 'review' | 'approved' | 'updated';
}

export function listReminders(tab: ReminderTab = 'forme', viewAs?: RoleKey): Promise<ReminderListResponse> {
  const q = new URLSearchParams({ tab, ...(viewAs ? { viewAs } : {}) }).toString();
  return apiFetch(`/api/reminders?${q}`);
}

export const createReminder = (body: { text: string; forId: string; when?: string; section?: string }): Promise<ReminderRecord> =>
  apiFetch('/api/reminders', { method: 'POST', body });

export const completeReminder = (id: string): Promise<PatchResult> =>
  apiFetch(`/api/reminders/${id}`, { method: 'PATCH', body: { action: 'complete' } });

export const approveReminder = (id: string): Promise<PatchResult> =>
  apiFetch(`/api/reminders/${id}`, { method: 'PATCH', body: { action: 'approve' } });

export const reassignReminder = (id: string, forId: string): Promise<PatchResult> =>
  apiFetch(`/api/reminders/${id}`, { method: 'PATCH', body: { forId } });

export const deleteReminder = (id: string): Promise<void> => apiFetch(`/api/reminders/${id}`, { method: 'DELETE' });

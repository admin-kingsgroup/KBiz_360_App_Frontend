import { apiFetch } from './client';
import type { ReminderGroup, RoleKey } from '../types';
import type { ReminderRecord } from '../data/reminders';

export type ReminderTab = 'forme' | 'iset' | 'review' | 'all' | 'archive';

export interface ReminderListResponse {
  tab: ReminderTab;
  isAll: boolean;
  reviewCount: number;
  // Per-tab chip counts ('all' present only for super admins). Optional: absent on older backends.
  counts?: { forme: number; iset: number; review: number; all?: number };
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

// Multi-assignee create: the server fans out one reminder per person. Sends BOTH forIds and a
// legacy forId (first assignee) so a backend without multi-assignee support still creates one
// reminder instead of rejecting; the response is normalized to an array either way.
export const createReminder = async (body: { text: string; forIds: string[]; when?: string; section?: string; dueAt?: string }): Promise<ReminderRecord[]> => {
  const res = await apiFetch<ReminderRecord | ReminderRecord[]>('/api/reminders', {
    method: 'POST',
    body: { ...body, forId: body.forIds[0] },
  });
  return Array.isArray(res) ? res : [res];
};

export const completeReminder = (id: string): Promise<PatchResult> =>
  apiFetch(`/api/reminders/${id}`, { method: 'PATCH', body: { action: 'complete' } });

export const approveReminder = (id: string): Promise<PatchResult> =>
  apiFetch(`/api/reminders/${id}`, { method: 'PATCH', body: { action: 'approve' } });

export const reassignReminder = (id: string, forId: string): Promise<PatchResult> =>
  apiFetch(`/api/reminders/${id}`, { method: 'PATCH', body: { forId } });

export const deleteReminder = (id: string): Promise<void> => apiFetch(`/api/reminders/${id}`, { method: 'DELETE' });

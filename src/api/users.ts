import { apiFetch } from './client';
import type { User } from '../types';
import type { UserDraft } from '../logic/validation';

// Mirrors the backend Users module. Returns the same `User` shape the stores already use.
export const listUsers = (): Promise<User[]> => apiFetch('/api/users');
export const getUser = (id: string): Promise<User> => apiFetch(`/api/users/${id}`);
export const createUser = (draft: UserDraft): Promise<User> => apiFetch('/api/users', { method: 'POST', body: draft });
export const updateUser = (id: string, patch: Partial<UserDraft>): Promise<User> =>
  apiFetch(`/api/users/${id}`, { method: 'PATCH', body: patch });
export const deleteUser = (id: string): Promise<void> => apiFetch(`/api/users/${id}`, { method: 'DELETE' });

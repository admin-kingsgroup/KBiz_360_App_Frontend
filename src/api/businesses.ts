import { apiFetch } from './client';
import type { Branch, Business, Group } from '../types';

// Access-filtered org reads (backend applies makeAccessFilters from the bearer's identity).
export const listBusinesses = (): Promise<Business[]> => apiFetch('/api/businesses');
export const getBusiness = (id: string): Promise<Business> => apiFetch(`/api/businesses/${id}`);
export const listBranches = (bizId: string): Promise<Branch[]> => apiFetch(`/api/businesses/${bizId}/branches`);
export const listGroups = (branchId: string): Promise<Group[]> => apiFetch(`/api/branches/${branchId}/groups`);

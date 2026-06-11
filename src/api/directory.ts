import { apiFetch } from './client';
import { ROLE_DEFS } from '../constants/roles';
import type { RoleKey, User } from '../types';

// Read-only CRM directory (served by the Mongo backend). Shapes match the directory endpoints.
export interface DirectoryUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string | null;
  role: string; // CRM role name (super_admin…)
  level: number;
  status: string | null;
  branchIds: string[];
}
export interface DirectoryCompany {
  id: string;
  name: string;
  status: string | null;
}
export interface DirectoryBranch {
  id: string;
  code: string | null;
  name: string | null;
  city: string | null;
  country: string | null;
  isHO: boolean;
  companyId: string | null;
}
export interface DirectoryDepartment {
  id: string;
  name: string | null;
  code: string | null;
  branchId: string | null;
}
export interface DirectoryRole {
  id: string;
  name: string;
  level: number;
  permissions: string[];
}

export const listUsers = (): Promise<DirectoryUser[]> => apiFetch('/api/users');
export const listCompanies = (): Promise<DirectoryCompany[]> => apiFetch('/api/companies');
export const listBranches = (): Promise<DirectoryBranch[]> => apiFetch('/api/branches');
export const listDepartments = (branchId?: string): Promise<DirectoryDepartment[]> =>
  apiFetch(`/api/departments${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`);
export const listRoles = (): Promise<DirectoryRole[]> => apiFetch('/api/roles');

// ── mapping CRM directory → the frontend display shapes ──
const ROLE_MAP: Record<string, RoleKey> = {
  super_admin: 'SUPER_ADMIN',
  company_manager: 'DIRECTOR',
  branch_manager: 'BRANCH_MANAGER',
  hod: 'HOD',
  employee: 'EMPLOYEE',
};
const ROLE_KEYS: RoleKey[] = ['SUPER_ADMIN', 'DIRECTOR', 'GENERAL_MANAGER', 'BRANCH_MANAGER', 'HOD', 'EMPLOYEE'];
function mapRole(role: string): RoleKey {
  if (ROLE_MAP[role]) return ROLE_MAP[role];
  const upper = role.toUpperCase();
  return (ROLE_KEYS as string[]).includes(upper) ? (upper as RoleKey) : 'EMPLOYEE';
}
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase() || 'U';
}

// Map a directory user → the frontend `User` the Team/admin screens render.
export function toUser(du: DirectoryUser): User {
  const role = mapRole(du.role);
  const branchCount = du.branchIds?.length ?? 0;
  const scopeLine =
    role === 'SUPER_ADMIN'
      ? 'Everything · all companies & branches'
      : role === 'DIRECTOR'
        ? 'Company-wide'
        : branchCount
          ? `${ROLE_DEFS[role].label} · ${branchCount} branch${branchCount > 1 ? 'es' : ''}`
          : ROLE_DEFS[role].label;
  return {
    id: du.id,
    name: du.name || du.email,
    initials: initialsOf(du.name || du.email),
    color: ROLE_DEFS[role].color,
    role,
    email: du.email,
    bizId: null,
    branches: du.branchIds ?? [],
    accessGroups: [],
    accessDepts: [],
    accessAlerts: [],
    scopeLine,
  };
}

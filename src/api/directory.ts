import { apiFetch } from './client';
import { mediaUrl } from './media';
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
  roleId?: string | null; // CRM role _id (for editing)
  level: number;
  status: string | null;
  branchIds: string[];
  position?: string | null; // app-set job title (kb360_app), distinct from role
  avatar?: string | null;   // app-set profile picture url (relative or absolute)
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
  companyId?: string | null; // company-level departments (no branch) file under this
  icon?: string | null;      // app-created departments may carry a custom icon/color
  color?: string | null;
  appOwned?: boolean;        // true = created in-app (editable); false = read-only CRM department
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

// Super-admin: create a business (written to the CRM companies collection, visible in the ERP too).
export const createCompany = (name: string): Promise<DirectoryCompany> =>
  apiFetch('/api/companies', { method: 'POST', body: { name } });
export const createBranch = (body: { companyId: string; name: string; code: string; city?: string; country?: string; isHO?: boolean }): Promise<DirectoryBranch> =>
  apiFetch('/api/branches', { method: 'POST', body });

// Super-admin: create / edit / delete app departments (companyId required; branchId null = all branches).
export interface AppDepartment { id: string; name: string; companyId: string | null; branchId: string | null; icon: string | null; color: string | null }
export const listAppDepartments = (): Promise<AppDepartment[]> => apiFetch('/api/departments/app');
export interface DepartmentInput { name: string; companyId: string | null; branchId?: string | null; icon?: string | null; color?: string | null }
export const createDepartment = (body: DepartmentInput): Promise<DirectoryDepartment> =>
  apiFetch('/api/departments', { method: 'POST', body });
export const updateDepartment = (id: string, body: Partial<DepartmentInput>): Promise<DirectoryDepartment> =>
  apiFetch(`/api/departments/${id}`, { method: 'PUT', body });
export const deleteDepartment = (id: string): Promise<{ ok: boolean }> =>
  apiFetch(`/api/departments/${id}`, { method: 'DELETE' });

// Super-admin: provision users (writes to the CRM users collection so they can log in).
export interface UserInput { email: string; password?: string; firstName?: string; lastName?: string; phone?: string | null; roleId?: string; branchIds?: string[]; status?: string }
export const createUser = (body: UserInput): Promise<DirectoryUser> => apiFetch('/api/users', { method: 'POST', body });
export const updateUser = (id: string, body: Partial<UserInput>): Promise<DirectoryUser> => apiFetch(`/api/users/${id}`, { method: 'PUT', body });
// Any user editing their own profile (name / phone).
export const updateMyProfile = (body: { firstName?: string; lastName?: string; phone?: string | null }): Promise<DirectoryUser> =>
  apiFetch('/api/me/profile', { method: 'PUT', body });
// Set own profile picture (url from an /api/uploads result; null clears it).
export const setMyAvatar = (url: string | null): Promise<{ avatar: string | null }> =>
  apiFetch('/api/me/avatar', { method: 'PUT', body: { url } });
// Change own password (verifies the current one).
export const changeMyPassword = (currentPassword: string, newPassword: string): Promise<{ ok: boolean }> =>
  apiFetch('/api/me/password', { method: 'PUT', body: { currentPassword, newPassword } });
// Super-admin: set a role's permission list (writes to the CRM roles collection).
export const setRolePermissions = (roleId: string, permissions: string[]): Promise<DirectoryRole> =>
  apiFetch(`/api/roles/${roleId}/permissions`, { method: 'PUT', body: { permissions } });

// Super-admin: KBiz360 · BOM membership (profile → "KBiz360 Members"). The GET also ensures the
// KBiz360 business has its single BOM branch, creating it on first call.
export interface KbizMembership {
  company: DirectoryCompany;
  branch: DirectoryBranch;
  users: (DirectoryUser & { member: boolean })[];
}
export const getKbizMembership = (): Promise<KbizMembership> => apiFetch('/api/kbiz/membership');
export const setKbizMembership = (userId: string, member: boolean): Promise<{ id: string; member: boolean }> =>
  apiFetch(`/api/kbiz/membership/${userId}`, { method: 'PUT', body: { member } });

// ── mapping CRM directory → the frontend display shapes ──
const ROLE_MAP: Record<string, RoleKey> = {
  super_admin: 'SUPER_ADMIN',
  company_manager: 'DIRECTOR',
  branch_manager: 'BRANCH_MANAGER',
  hod: 'HOD',
  employee: 'EMPLOYEE',
};
const ROLE_KEYS: RoleKey[] = ['SUPER_ADMIN', 'DIRECTOR', 'GENERAL_MANAGER', 'BRANCH_MANAGER', 'HOD', 'EMPLOYEE'];
// Human-readable label for the ACTUAL CRM role (so we show "Company Manager", not the mapped tier "Director").
const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  company_manager: 'Company Manager',
  branch_manager: 'Branch Manager',
  general_manager: 'General Manager',
  hod: 'HOD',
  employee: 'Employee',
};
export function humanizeRole(role: string): string {
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  return role.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
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
    phone: du.phone ?? null,
    status: du.status ?? null,
    position: du.position ?? null,
    roleName: humanizeRole(du.role), // actual CRM role label, e.g. "Company Manager"
    roleId: du.roleId ?? null,
    avatar: du.avatar ? mediaUrl(du.avatar) : null, // resolved to absolute for <Image>
  };
}

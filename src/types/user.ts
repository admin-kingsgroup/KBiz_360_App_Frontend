import type { RoleKey } from './roles';

// Branch-qualified grant id, e.g. 'AMD-Accounts' (group/dept) or 'AMD-crm' (alert).
export type GrantId = string;

export interface User {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: RoleKey;
  email?: string;
  bizId: string | null;
  branches: string[];          // branch codes
  accessGroups: GrantId[];
  accessDepts: GrantId[];
  accessAlerts: GrantId[];
  attendance?: boolean;
  scopeLine?: string;
  position?: string | null;    // app-set job title (e.g. "Senior Finance Manager"), distinct from role
  roleName?: string;           // human label of the ACTUAL CRM role (e.g. "Company Manager")
  roleId?: string | null;      // CRM role _id (for the user editor)
  avatar?: string | null;      // profile picture (absolute url), else null → initials
  login?: string;
}

// Reminder-visibility identity (separate id space in the current app — see foundation report).
export interface PersonMeta {
  role: RoleKey;
  branches: string[];
  dept: string | null;
}

export interface ReminderViewer extends PersonMeta {
  id: string;
}

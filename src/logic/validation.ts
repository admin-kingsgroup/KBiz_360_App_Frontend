import type { Branch, ModuleDef, RoleKey } from '../types';

export interface UserDraft {
  name: string;
  email: string;
  role: RoleKey;
  bizId: string | null;
  branches: string[];        // selected branch codes
  accessGroups: string[];
  accessAlerts: string[];
}

export interface ValidationCatalogs {
  branches: Branch[];                          // all branches (only tk has them)
  bizModules: Record<string, string[]>;        // BIZ_MODULES
  modules: ModuleDef[];                         // MODULES
}

export interface ValidationResult {
  hasBranches: boolean;
  groupsAvail: string[];
  alertsAvailIds: string[];
  branchOK: boolean;
  groupsOK: boolean;
  alertsOK: boolean;
  valid: boolean;
}

// User create/edit validation. Extracted verbatim from InviteUserSheet.
// effBranches = selBizId === 'tk' ? branches : []  (only tk has branches in the app).
export function validateUserDraft(draft: UserDraft, cat: ValidationCatalogs): ValidationResult {
  const isSuper = draft.role === 'SUPER_ADMIN';
  const selBizId = draft.bizId;
  const effBranches = selBizId === 'tk' ? cat.branches.map((b) => ({ code: b.code })) : [];
  const hasBranches = effBranches.length > 0;
  const selBr = effBranches.filter((b) => draft.branches.includes(b.code));
  const alertsAvail = ((selBizId && cat.bizModules[selBizId]) || [])
    .map((k) => cat.modules.find((m) => m.key === k))
    .filter((m): m is ModuleDef => Boolean(m));

  const groupsAvail = hasBranches
    ? selBr.flatMap((b) => (cat.branches.find((x) => x.code === b.code)?.groups || []).map((g) => `${b.code}-${g.name}`))
    : [];
  const alertsAvailIds = hasBranches
    ? selBr.flatMap((b) => alertsAvail.map((m) => `${b.code}-${m.key}`))
    : alertsAvail.map((m) => m.key);

  const branchOK = !hasBranches || draft.branches.length > 0;
  const groupsOK = groupsAvail.length === 0 || draft.accessGroups.length > 0;
  const alertsOK = alertsAvailIds.length === 0 || draft.accessAlerts.length > 0;
  const valid = Boolean(
    draft.name.trim() && draft.email.trim() &&
    (isSuper || (selBizId && branchOK && groupsOK && alertsOK)),
  );

  return { hasBranches, groupsAvail, alertsAvailIds, branchOK, groupsOK, alertsOK, valid };
}

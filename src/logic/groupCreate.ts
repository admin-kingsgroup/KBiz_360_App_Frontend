import type { AccessControl } from '../types/access';
import type { User } from '../types';

// Who may create team chat groups: any Super-Admin, PLUS a small email allow-list of delegated
// group creators (managers who can create groups without full super rights). Emails are the source
// of truth so it survives user-id changes. Keep in sync with the backend list in
// Backend/src/mongo/chat/chat.service.ts (GROUP_CREATE_EMAILS).
export const GROUP_CREATE_EMAILS = new Set(['farhan@travkings.com', 'faiz@travkings.com']);

export function canCreateGroups(
  user: User | null | undefined,
  access: AccessControl | null | undefined,
): boolean {
  if (access?.isSuper) return true;
  const email = (user?.email ?? '').toLowerCase().trim();
  return GROUP_CREATE_EMAILS.has(email);
}

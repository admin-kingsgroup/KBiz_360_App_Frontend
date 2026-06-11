import { apiFetch } from './client';
import type { Email, EmailDraft, EmailFolder } from '../types';

// Backend email API. The Express backend authenticates with Microsoft Graph (OAuth2 / MSAL,
// Mail.Read + Mail.Send) and proxies these calls, so the app never holds Graph tokens directly.
// Each function below notes the Graph operation the backend performs.

// GET /me/mailFolders/{wellKnownName}/messages   (inbox|sentitems|drafts|deleteditems)
export const listMessages = (folder: EmailFolder): Promise<Email[]> => apiFetch(`/api/email/${folder}`);

// GET /me/messages/{id}
export const getMessage = (id: string): Promise<Email> => apiFetch(`/api/email/messages/${id}`);

// POST /me/sendMail  (creates + sends; backend returns the stored Sent item)
export const sendMail = (draft: EmailDraft): Promise<Email> =>
  apiFetch('/api/email/send', { method: 'POST', body: draft });

// POST /me/messages  (createDraft)  /  PATCH /me/messages/{id}  (update existing draft)
export const saveDraft = (draft: EmailDraft, id?: string): Promise<Email> =>
  apiFetch('/api/email/drafts', { method: 'POST', body: { ...draft, id } });

// POST /me/messages/{id}/move  { destinationId }
export const moveMessage = (id: string, folder: EmailFolder): Promise<void> =>
  apiFetch(`/api/email/messages/${id}/move`, { method: 'POST', body: { folder } });

// PATCH /me/messages/{id}  { isRead }
export const setRead = (id: string, read: boolean): Promise<void> =>
  apiFetch(`/api/email/messages/${id}/read`, { method: 'POST', body: { read } });

// PATCH /me/messages/{id}  { flag: { flagStatus } }
export const setStarred = (id: string, starred: boolean): Promise<void> =>
  apiFetch(`/api/email/messages/${id}/flag`, { method: 'POST', body: { starred } });

// DELETE /me/messages/{id}  (permanent)
export const deleteMessage = (id: string): Promise<void> =>
  apiFetch(`/api/email/messages/${id}`, { method: 'DELETE' });

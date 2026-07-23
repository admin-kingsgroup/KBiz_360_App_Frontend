import { apiFetch } from './client';
import type { Email, EmailDraft, EmailFolder, AttachmentMeta, SmartFolder, OutlookFolder } from '../types';

// ── real Outlook folders (user-created, mailbox-wide) ──
export const listOutlookFolders = (): Promise<OutlookFolder[]> => apiFetch('/api/email/outlook-folders');
export const listOutlookFolderMessages = (id: string, skip = 0): Promise<Email[]> =>
  apiFetch(`/api/email/outlook-folders/${encodeURIComponent(id)}/messages${skip ? `?skip=${skip}` : ''}`);
// File a message into an arbitrary Outlook folder. Graph re-keys the message — returns the new id.
export const moveToOutlookFolder = (id: string, folderId: string): Promise<{ id: string } | null> =>
  apiFetch(`/api/email/messages/${id}/move-to`, { method: 'POST', body: { folderId } });

// ── smart folders (auto-categorize incoming mail by sender) ──
export const listSmartFolders = (): Promise<SmartFolder[]> => apiFetch('/api/email/folders');
export const createSmartFolder = (name: string, from: string[], backfill = true): Promise<SmartFolder> =>
  apiFetch('/api/email/folders', { method: 'POST', body: { name, from, backfill } });
export const deleteSmartFolder = (id: string): Promise<void> => apiFetch(`/api/email/folders/${id}`, { method: 'DELETE' });
export const listFolderMessages = (id: string, skip = 0): Promise<Email[]> =>
  apiFetch(`/api/email/folders/${id}/messages${skip ? `?skip=${skip}` : ''}`);

// GET /me/messages/{id}/attachments  (metadata)
export const listAttachments = (id: string): Promise<AttachmentMeta[]> => apiFetch(`/api/email/messages/${id}/attachments`);
// GET /me/messages/{id}/attachments/{attId}  → { name, contentType, contentBytes (base64) }
export const downloadAttachment = (id: string, attId: string): Promise<{ name: string; contentType: string; contentBytes: string }> =>
  apiFetch(`/api/email/messages/${id}/attachments/${attId}`);

// Backend email API. The Express backend authenticates with Microsoft Graph (OAuth2 / MSAL,
// Mail.Read + Mail.Send) and proxies these calls, so the app never holds Graph tokens directly.
// Each function below notes the Graph operation the backend performs.

// ── account / OAuth ──
export interface EmailStatus { connected: boolean; email: string | null }
export const getStatus = (): Promise<EmailStatus> => apiFetch('/api/email/status');
// Real Inbox unread count (Graph unreadItemCount) — drives the Email tab badge.
export const getUnread = (): Promise<{ inbox: number }> => apiFetch('/api/email/unread');
export const connect = (code: string, codeVerifier: string, redirectUri: string): Promise<{ connected: boolean; email: string }> =>
  apiFetch('/api/email/connect', { method: 'POST', body: { code, codeVerifier, redirectUri } });
export const disconnect = (): Promise<void> => apiFetch('/api/email/disconnect', { method: 'POST' });

// GET /me/mailFolders/{wellKnownName}/messages   (inbox|sentitems|drafts|deleteditems)
// skip = how many already loaded (infinite scroll). PAGE size is 40 (matches the backend).
export const EMAIL_PAGE = 40;
export const listMessages = (folder: EmailFolder, skip = 0): Promise<Email[]> =>
  apiFetch(`/api/email/${folder}${skip ? `?skip=${skip}` : ''}`);

// Server-side search across ALL folders (Graph $search on /me/messages); each result carries its
// own folder.
export const searchMessages = (q: string): Promise<Email[]> =>
  apiFetch(`/api/email/search?q=${encodeURIComponent(q)}`);

// Mark every unread message in a folder as read.
export const markAllRead = (folder: EmailFolder): Promise<{ count: number }> =>
  apiFetch('/api/email/mark-all-read', { method: 'POST', body: { folder } });

// GET /me/messages/{id}. Pass the folder so the backend stamps the right folder (it defaults to
// inbox), otherwise opening a Sent/Drafts/Trash item would flip it to inbox.
export const getMessage = (id: string, folder?: EmailFolder): Promise<Email> =>
  apiFetch(`/api/email/messages/${id}${folder ? `?folder=${folder}` : ''}`);

// POST /api/email/send. Creates + sends a new message, OR (when draft.id is set) updates that
// existing Graph draft and sends it — so a resumed draft moves to Sent instead of leaving a copy.
export const sendMail = (draft: EmailDraft): Promise<Email> =>
  apiFetch('/api/email/send', { method: 'POST', body: draft });

// POST /api/email/drafts. Creates a draft, OR (when draft.id is set) PATCHes the existing one.
export const saveDraft = (draft: EmailDraft): Promise<Email> =>
  apiFetch('/api/email/drafts', { method: 'POST', body: draft });

// POST /me/messages/{id}/move  { destinationId }. Graph re-keys a message on move — the response
// carries the NEW id, which the store must adopt (deleting/opening via the old id 404s).
export const moveMessage = (id: string, folder: EmailFolder): Promise<{ id: string } | null> =>
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

// Email domain types. Mock today; a backend that proxies Microsoft Graph becomes the source of
// truth (see src/api/email.ts). Folder ids map to Graph well-known mail folders.
export type EmailFolder = 'inbox' | 'sent' | 'drafts' | 'spam' | 'deleted';

export interface EmailAddress {
  name: string;
  email: string;
}

export interface EmailAttachment {
  id: string;
  name: string;
  sizeLabel: string; // human label, e.g. "240 KB"
}

// Attachment metadata from the backend Graph proxy (GET /messages/:id/attachments).
export interface AttachmentMeta {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

// An attachment to send (file content as base64).
export interface OutAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
}

export interface Email {
  id: string;
  folder: EmailFolder;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  preview: string; // short snippet for the list row
  body: string;    // full message text (HTML when bodyType === 'html')
  bodyType?: 'html' | 'text';
  ts: number;      // received (inbox) or sent time, ms epoch
  bodyFull?: boolean; // true once the full body has been fetched (list rows only carry a preview)
  read: boolean;
  starred?: boolean;
  hasAttachments?: boolean;
  attachments?: EmailAttachment[];
  color: string;   // avatar background (display only)
  // Set when the message lives in a USER folder (Outlook-created / smart) — the Graph mailFolder
  // id. Such mail is cached in the same store (offline-readable) but excluded from the standard
  // folder views (its `folder` field is just the backend's 'inbox' stamp, not a real location).
  graphFolderId?: string;
}

// What the compose form produces. Recipient fields are raw strings (comma/semicolon separated);
// the store parses them into EmailAddress[] on send (see logic/email.parseRecipients).
export interface EmailDraft {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  bodyType?: 'html' | 'text'; // 'html' for replies/forwards that quote an HTML original; defaults to text
  id?: string; // when set: the existing Graph draft being updated/sent (resume-a-draft)
  attachments?: OutAttachment[];
}

// A user-created "smart folder": a real Outlook folder + a sender-match rule that auto-files mail.
export interface SmartFolder {
  id: string;
  name: string;
  graphFolderId: string;
  from: string[]; // sender match substrings (domain like "travkings.com" or a full address)
}

// A real Outlook mail folder the user created (in Outlook or via a smart folder), with live counts.
export interface OutlookFolder {
  id: string;     // Graph mailFolder id
  name: string;
  total: number;  // totalItemCount
  unread: number; // unreadItemCount
}

export const EMAIL_FOLDERS: { key: EmailFolder; label: string }[] = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'sent', label: 'Sent' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'spam', label: 'Spam' },
  { key: 'deleted', label: 'Deleted' },
];

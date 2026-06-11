// Email domain types. Mock today; a backend that proxies Microsoft Graph becomes the source of
// truth (see src/api/email.ts). Folder ids map to Graph well-known mail folders.
export type EmailFolder = 'inbox' | 'sent' | 'drafts' | 'deleted';

export interface EmailAddress {
  name: string;
  email: string;
}

export interface EmailAttachment {
  id: string;
  name: string;
  sizeLabel: string; // human label, e.g. "240 KB"
}

export interface Email {
  id: string;
  folder: EmailFolder;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  preview: string; // short snippet for the list row
  body: string;    // full message text
  ts: number;      // received (inbox) or sent time, ms epoch
  read: boolean;
  starred?: boolean;
  hasAttachments?: boolean;
  attachments?: EmailAttachment[];
  color: string;   // avatar background (display only)
}

// What the compose form produces. Recipient fields are raw strings (comma/semicolon separated);
// the store parses them into EmailAddress[] on send (see logic/email.parseRecipients).
export interface EmailDraft {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
}

export const EMAIL_FOLDERS: { key: EmailFolder; label: string }[] = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'sent', label: 'Sent' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'deleted', label: 'Deleted' },
];

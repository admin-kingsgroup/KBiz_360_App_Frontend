import { create } from 'zustand';
import type { Email, EmailDraft, EmailFolder } from '../types';
import { mockEmails, CURRENT_MAILBOX } from '../data/emails';
import { parseRecipients } from '../logic/email';

// Transport-agnostic mailbox state. Seeded from mock data today; a backend that proxies Microsoft
// Graph becomes the source of truth via src/api/email.ts. Each mutating action maps to a Graph call:
//   markRead/toggleRead  -> PATCH /me/messages/{id}        { isRead }
//   toggleStar           -> PATCH /me/messages/{id}        { flag }
//   moveToFolder         -> POST  /me/messages/{id}/move   { destinationId }
//   deleteForever        -> DELETE /me/messages/{id}
//   send                 -> POST  /me/sendMail
//   saveDraft            -> POST  /me/messages  (draft)    or PATCH for an existing draft
// Wire these by replacing setEmails seeding with emailApi.listMessages(...) and calling the
// emailApi.* functions inside each action (optimistic local update + server reconcile).
export interface EmailState {
  emails: Email[];
  folder: EmailFolder;
  search: string;

  setFolder: (folder: EmailFolder) => void;
  setSearch: (q: string) => void;
  setEmails: (emails: Email[]) => void; // for api hydration

  byId: (id: string) => Email | undefined;
  markRead: (id: string) => void;
  toggleRead: (id: string) => void;
  toggleStar: (id: string) => void;
  moveToFolder: (id: string, folder: EmailFolder) => void; // delete = move to 'deleted'
  deleteForever: (id: string) => void;
  send: (draft: EmailDraft) => Email;
  saveDraft: (draft: EmailDraft) => Email;
}

const makeId = () => `m-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

export const useEmailStore = create<EmailState>((set, get) => ({
  emails: mockEmails,
  folder: 'inbox',
  search: '',

  setFolder: (folder) => set({ folder, search: '' }),
  setSearch: (search) => set({ search }),
  setEmails: (emails) => set({ emails }),

  byId: (id) => get().emails.find((e) => e.id === id),
  markRead: (id) => set((s) => ({ emails: s.emails.map((e) => (e.id === id ? { ...e, read: true } : e)) })),
  toggleRead: (id) => set((s) => ({ emails: s.emails.map((e) => (e.id === id ? { ...e, read: !e.read } : e)) })),
  toggleStar: (id) => set((s) => ({ emails: s.emails.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e)) })),
  moveToFolder: (id, folder) => set((s) => ({ emails: s.emails.map((e) => (e.id === id ? { ...e, folder } : e)) })),
  deleteForever: (id) => set((s) => ({ emails: s.emails.filter((e) => e.id !== id) })),

  send: (draft) => {
    const body = draft.body.trim();
    const email: Email = {
      id: makeId(), folder: 'sent', color: '#0C0E14',
      from: CURRENT_MAILBOX, to: parseRecipients(draft.to), cc: draft.cc ? parseRecipients(draft.cc) : undefined,
      subject: draft.subject.trim() || '(no subject)',
      preview: body.slice(0, 120), body,
      ts: Date.now(), read: true,
    };
    set((s) => ({ emails: [email, ...s.emails] }));
    return email;
  },

  saveDraft: (draft) => {
    const body = draft.body.trim();
    const email: Email = {
      id: makeId(), folder: 'drafts', color: '#0C0E14',
      from: CURRENT_MAILBOX, to: parseRecipients(draft.to), cc: draft.cc ? parseRecipients(draft.cc) : undefined,
      subject: draft.subject.trim() || '(no subject)',
      preview: body.slice(0, 120), body,
      ts: Date.now(), read: true,
    };
    set((s) => ({ emails: [email, ...s.emails] }));
    return email;
  },
}));

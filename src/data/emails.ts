import { colors } from '../theme/colors';
import type { Email, EmailAddress } from '../types';

// MOCK mailbox for the Email module. Replaced by the backend (which proxies Microsoft Graph) via
// src/api/email.ts. Import-pure: pulls theme/colors only, no RN/store imports.
export const CURRENT_MAILBOX: EmailAddress = { name: 'Afshin Dhanani', email: 'afshin@kbiz360.com' };

const min = 60 * 1000;
const hr = 60 * min;
const day = 24 * hr;
const now = Date.now();

export const mockEmails: Email[] = [
  // ---- Inbox ----
  {
    id: 'm1', folder: 'inbox', color: colors.orange,
    from: { name: 'Faiz Khan', email: 'faiz@travkings.com' }, to: [CURRENT_MAILBOX],
    subject: 'April MIS — Q1 closed strong', read: false, hasAttachments: true,
    attachments: [{ id: 'a1', name: 'April-MIS.xlsx', sizeLabel: '248 KB' }],
    preview: 'Net margin up 4.2% MoM, BSP fully reconciled. Deck attached for the branch review.',
    body: 'Hi Afshin,\n\nApril numbers are in and Q1 closed strong — net margin up 4.2% MoM and the IATA BSP is fully reconciled across all three branches.\n\nI have attached the MIS deck for the branch review on Thursday. Key call-outs:\n• AMD ticketing volume +11%\n• Holidays gross margin steady at 18.6%\n• EK refund backlog cleared\n\nLet me know if you want any cuts before I circulate.\n\nBest,\nFaiz',
    ts: now - 32 * min,
  },
  {
    id: 'm2', folder: 'inbox', color: colors.blue,
    from: { name: 'Mehul Raj', email: 'mehul@travkings.com' }, to: [CURRENT_MAILBOX], cc: [{ name: 'Faiz Khan', email: 'faiz@travkings.com' }],
    subject: 'EK refund mismatches — week 19', read: false,
    preview: 'Found 3 mismatches on EK refunds in the week-19 BSP file. Need a sign-off to adjust.',
    body: 'Afshin,\n\nWhile reconciling the week-19 BSP file I found 3 mismatches on Emirates refunds totalling ₹84,200. Looks like the ADM was raised after the billing cut-off.\n\nI can post the adjustment today if you sign off. Details in the thread.\n\nThanks,\nMehul',
    ts: now - 2 * hr,
  },
  {
    id: 'm3', folder: 'inbox', color: colors.ink,
    from: { name: 'IATA BSP', email: 'noreply@iata.org' }, to: [CURRENT_MAILBOX],
    subject: 'Your BSP billing statement is available', read: false, hasAttachments: true,
    attachments: [{ id: 'a2', name: 'BSP-Statement-Wk20.pdf', sizeLabel: '1.2 MB' }],
    preview: 'The billing statement for billing period 20 is now available for download.',
    body: 'Dear Agent,\n\nThe billing statement for BSP India, billing period 20, is now available in BSPlink. Remittance date: as per your country calendar.\n\nThis is an automated message — please do not reply.\n\nIATA BSP',
    ts: now - 6 * hr,
  },
  {
    id: 'm4', folder: 'inbox', color: colors.teal,
    from: { name: 'Riya Patel', email: 'riya@travkings.com' }, to: [CURRENT_MAILBOX],
    subject: 'Bali itinerary v3 — ready for review', read: true,
    preview: 'Updated the Bali package with the Ubud extension and revised pricing. Ready when you are.',
    body: 'Hi Afshin,\n\nv3 of the Bali package is ready — added the 2-night Ubud extension and revised pricing for the Q3 campaign. Margins hold at 19%.\n\nCan you review before I send to the corporate client?\n\nRiya',
    ts: now - 1 * day - 3 * hr,
  },
  {
    id: 'm5', folder: 'inbox', color: '#6D6D72',
    from: { name: 'Karen Owino', email: 'karen@travkings.com' }, to: [CURRENT_MAILBOX],
    subject: 'NBO holiday packages — Q3 plan', read: true,
    preview: 'Sharing the NBO Q3 plan. Mombasa and Maasai Mara leading on enquiries.',
    body: 'Hello Afshin,\n\nHere is the NBO holiday plan for Q3. Mombasa and Maasai Mara are leading on enquiries; I have proposed two new corporate bundles.\n\nHappy to walk you through on a call.\n\nKaren',
    ts: now - 3 * day,
  },
  {
    id: 'm6', folder: 'inbox', color: colors.purple,
    from: { name: 'Microsoft 365', email: 'account-security@microsoft.com' }, to: [CURRENT_MAILBOX],
    subject: 'New sign-in to your account', read: true,
    preview: 'We noticed a sign-in to your KBiz 360 work account from a new device.',
    body: 'We noticed a new sign-in to your account from a new device. If this was you, no action is needed.\n\nIf you do not recognise this activity, please secure your account.\n\nMicrosoft account team',
    ts: now - 4 * day,
  },

  // ---- Sent ----
  {
    id: 'm7', folder: 'sent', color: colors.ink,
    from: CURRENT_MAILBOX, to: [{ name: 'Faiz Khan', email: 'faiz@travkings.com' }],
    subject: 'Re: April MIS — Q1 closed strong', read: true,
    preview: 'Great work. Please reconcile the EK refunds and share the final by EOD.',
    body: 'Faiz,\n\nGreat work on Q1. Please reconcile the EK refunds with Mehul and share the final deck by EOD so I can circulate before the review.\n\nAfshin',
    ts: now - 25 * min,
  },
  {
    id: 'm8', folder: 'sent', color: colors.ink,
    from: CURRENT_MAILBOX, to: [{ name: 'Sanjay Nair', email: 'sanjay@travkings.com' }],
    subject: 'BOM corporate lead — next steps', read: true,
    preview: 'Let us push the proposal this week. Loop me in on the pricing call.',
    body: 'Sanjay,\n\nLet us push the BOM corporate proposal this week. Loop me in on the pricing call — I want to keep the margin above 16%.\n\nAfshin',
    ts: now - 1 * day,
  },

  // ---- Drafts ----
  {
    id: 'm9', folder: 'drafts', color: colors.ink,
    from: CURRENT_MAILBOX, to: [{ name: 'Karen Owino', email: 'karen@travkings.com' }],
    subject: 'NBO Q3 — feedback', read: true,
    preview: 'Karen, a few thoughts on the Q3 plan…',
    body: 'Karen, a few thoughts on the Q3 plan:\n\n1. ',
    ts: now - 5 * hr,
  },

  // ---- Deleted ----
  {
    id: 'm10', folder: 'deleted', color: colors.coral,
    from: { name: 'Travel Weekly', email: 'digest@travelweekly.com' }, to: [CURRENT_MAILBOX],
    subject: 'This week in travel — IATA, NDC & more', read: true,
    preview: 'Your weekly digest of industry headlines.',
    body: 'The biggest stories in travel this week, curated for you.\n\nUnsubscribe at any time.',
    ts: now - 6 * day,
  },
];

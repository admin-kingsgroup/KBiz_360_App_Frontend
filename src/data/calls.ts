import { directChats } from './chats';
import type { CallContact, CallRecord } from '../types';

// Callable contacts, reused from the DM list so identities stay consistent across the app.
export const callContacts: CallContact[] = directChats.map((c) => ({
  id: c.id, name: c.name, initials: c.initials, color: c.color, role: c.role, online: c.online,
}));

export const getCallContact = (id: string): CallContact | undefined => callContacts.find((c) => c.id === id);

const by = (id: string) => callContacts.find((c) => c.id === id)!;
const min = 60 * 1000;
const hr = 60 * min;
const day = 24 * hr;
const now = Date.now();

// MOCK call history. Replaced by the backend/telephony provider later (transport-agnostic store).
export const callHistory: CallRecord[] = [
  { id: 'c1', contact: by('u3'), type: 'voice', direction: 'incoming', ts: now - 18 * min, durationSec: 312 },
  { id: 'c2', contact: by('u2'), type: 'video', direction: 'outgoing', ts: now - 2 * hr, durationSec: 1284 },
  { id: 'c3', contact: by('u4'), type: 'voice', direction: 'missed', ts: now - 5 * hr },
  { id: 'c4', contact: by('u5'), type: 'video', direction: 'incoming', ts: now - 1 * day - 2 * hr, durationSec: 95 },
  { id: 'c5', contact: by('u6'), type: 'voice', direction: 'outgoing', ts: now - 1 * day - 6 * hr, durationSec: 0 },
  { id: 'c6', contact: by('u3'), type: 'voice', direction: 'missed', ts: now - 2 * day },
  { id: 'c7', contact: by('u7'), type: 'voice', direction: 'incoming', ts: now - 3 * day, durationSec: 642 },
];

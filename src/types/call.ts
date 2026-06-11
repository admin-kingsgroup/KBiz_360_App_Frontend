// Call domain types. History is mock today; real audio/video calling (signalling + media) is
// [NEEDS BACKEND] — WebRTC/Twilio behind the same transport-agnostic store.
export type CallType = 'voice' | 'video';
export type CallDirection = 'incoming' | 'outgoing' | 'missed';

export interface CallContact {
  id: string;
  name: string;
  initials: string;
  color: string;
  role?: string;
  online?: boolean;
}

export interface CallRecord {
  id: string;
  contact: CallContact;
  type: CallType;
  direction: CallDirection;
  ts: number;          // when the call happened (ms epoch)
  durationSec?: number; // connected duration; 0/undefined for missed
}

export type CallFilter = 'all' | 'missed';

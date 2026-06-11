import { apiFetch } from './client';

// REST surface for audio calling. The backend (Mongo) is authoritative for call lifecycle and
// fans out the matching socket events; here we only call the endpoints. Types mirror the backend
// DTOs (src/mongo/calls/call.types.ts).
export type CallMediaType = 'voice' | 'video';
export type CallLogStatus = 'completed' | 'missed' | 'rejected' | 'failed';

export interface IceServer { urls: string | string[]; username?: string; credential?: string }
export interface CallParticipant { id: string; name: string }

export interface CallDTO {
  callId: string;
  type: CallMediaType;
  status: 'ringing' | 'accepted';
  caller: CallParticipant;
  receiver: CallParticipant;
  startedAt: number;
}

export interface CallLogDTO {
  id: string;
  callId: string;
  type: CallMediaType;
  status: CallLogStatus;
  direction: 'incoming' | 'outgoing';
  peer: CallParticipant;
  startedAt: number;
  endedAt: number;
  durationSec: number;
}

export interface CallAnalytics {
  summary: { total: number; completed: number; missed: number; rejected: number; failed: number; avgDurationSec: number };
  daily: { period: string; total: number; completed: number; missed: number; durationSec: number }[];
  monthly: { period: string; total: number; completed: number; missed: number; durationSec: number }[];
  perUser: { userId: string; name: string; total: number; completed: number; missed: number; durationSec: number }[];
}

const qs = (params?: Record<string, string | number | undefined>): string => {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return entries.length ? `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

export const initiateCall = (receiverId: string, type: CallMediaType = 'voice'): Promise<{ call: CallDTO; iceServers: IceServer[] }> =>
  apiFetch('/api/calls/initiate', { method: 'POST', body: { receiverId, type } });

export const acceptCall = (callId: string): Promise<{ ok: true }> =>
  apiFetch('/api/calls/accept', { method: 'POST', body: { callId } });

export const rejectCall = (callId: string): Promise<{ ok: true }> =>
  apiFetch('/api/calls/reject', { method: 'POST', body: { callId } });

export const endCall = (callId: string): Promise<{ ok: true; status: CallLogStatus; durationSec: number }> =>
  apiFetch('/api/calls/end', { method: 'POST', body: { callId } });

export const getIceServers = (): Promise<{ iceServers: IceServer[] }> => apiFetch('/api/calls/ice-servers');

export const callHistory = (params?: { limit?: number; before?: string }): Promise<{ calls: CallLogDTO[] }> =>
  apiFetch(`/api/calls/history${qs(params)}`);

export const getCall = (id: string): Promise<CallLogDTO> => apiFetch(`/api/calls/${id}`);

export const registerCallDevice = (expoPushToken: string, platform?: string): Promise<void> =>
  apiFetch('/api/calls/register-device', { method: 'POST', body: { expoPushToken, platform } });

export const callAnalytics = (params?: { from?: number; to?: number; userId?: string }): Promise<CallAnalytics> =>
  apiFetch(`/api/calls/analytics${qs(params)}`);

import { MODULE_ORDER } from '../constants/modules';
import type { ModuleKey } from '../types';

export interface PulseChannel {
  id: string; bizId: string; module: ModuleKey;
  name: string; icon: string; color: string; tint: string; description: string; members: string[];
  branch?: string; // branch CODE (e.g. 'BOM') for branch-scoped channels — drives access grants `${branch}-${module}`
}
export interface PulseEvent {
  id: string; channelId: string; source: string; title: string; body: string;
  context: string; time: number; read: boolean; actions?: { label: string; primary?: boolean }[];
}

// Real, backend-fed attendance channels — one per tracked Travkings branch. Ids and grants
// ("BOM-hr"/"AMD-hr") match the backend's alertChannels definitions; events arrive via /api/alerts.
export const attendanceAlertChannels: PulseChannel[] = [
  { id: 'tk_att_bom', bizId: 'tk', module: 'hr', branch: 'BOM', name: 'BOM Attendance', icon: '🕘', color: '#9A6CF0', tint: '#EBE2FC', description: 'Check-ins & check-outs · Mumbai branch', members: [] },
  { id: 'tk_att_amd', bizId: 'tk', module: 'hr', branch: 'AMD', name: 'AMD Attendance', icon: '🕘', color: '#9A6CF0', tint: '#EBE2FC', description: 'Check-ins & check-outs · Ahmedabad branch', members: [] },
];

// Real, backend-fed Finance + CRM channels — events are pushed live by the KBiz Books ERP and CRM
// backends through the backend's POST /api/alerts/ingest. Ids and grants ("BOM-accounts"/"BOM-crm"…)
// match the backend's alertChannels definitions. Colors follow the module palette (accounts 📒 amber,
// crm 🎯 blue) so cards read consistently with the rest of the app.
export const financeAlertChannels: PulseChannel[] = [
  { id: 'tk_fin_bom', bizId: 'tk', module: 'accounts', branch: 'BOM', name: 'Finance - BOM', icon: '📒', color: '#E8A13A', tint: '#FBEBD2', description: 'Live finance alerts from KBiz Books · Mumbai branch', members: [] },
  { id: 'tk_fin_amd', bizId: 'tk', module: 'accounts', branch: 'AMD', name: 'Finance - AMD', icon: '📒', color: '#E8A13A', tint: '#FBEBD2', description: 'Live finance alerts from KBiz Books · Ahmedabad branch', members: [] },
];
export const crmAlertChannels: PulseChannel[] = [
  { id: 'tk_crm_bom', bizId: 'tk', module: 'crm', branch: 'BOM', name: 'CRM - BOM', icon: '🎯', color: '#4F8BFF', tint: '#E4EDFF', description: 'Live CRM alerts · Mumbai branch', members: [] },
  { id: 'tk_crm_amd', bizId: 'tk', module: 'crm', branch: 'AMD', name: 'CRM - AMD', icon: '🎯', color: '#4F8BFF', tint: '#E4EDFF', description: 'Live CRM alerts · Ahmedabad branch', members: [] },
];

// Super-admin-composed announcements. Each EVENT carries its own recipient list server-side
// ('*' = everyone) — non-supers only ever receive events addressed to them. Id matches the
// backend's ANNOUNCEMENTS_CHANNEL_ID.
export const announcementsChannel: PulseChannel = {
  id: 'announcements', bizId: 'tk', module: 'crm',
  name: 'Announcements', icon: '📢', color: '#4F8BFF', tint: '#E4EDFF',
  description: 'Updates from the admin team', members: [],
};

// Only backend-registered channels are shown. The source app also generated one mock channel per
// (business × enabled module) — those had no backend counterpart and rendered as permanent dummy
// cards, so they were dropped. Re-add channels here only when the backend defines them
// (Backend src/mongo/alerts/alertChannels.ts) and emits their events.
export const pulseChannels: PulseChannel[] = [
  announcementsChannel,
  ...crmAlertChannels,
  ...financeAlertChannels,
  ...attendanceAlertChannels,
];

// Demo events removed — alerts now start empty until real events are wired in.
export const pulseEvents: PulseEvent[] = [];

export const moduleRank = (mk: ModuleKey): number => { const i = MODULE_ORDER.indexOf(mk); return i === -1 ? 99 : i; };

// Parse a branch id from an event context ("TK AMD · …" → "amd"); company-wide → null.
export function branchOf(e: PulseEvent): string | null {
  const m = e.context && e.context.match(/\b(AMD|BOM|NBO)\b/);
  return m ? m[1].toLowerCase() : null;
}

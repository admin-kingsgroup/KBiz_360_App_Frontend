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
  attachment?: { name: string; url: string }; // e.g. the ERP's invoice PDF; url may be server-relative
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

// Personal "My Alerts" — every user has one; it holds alerts ABOUT them (their check-in /
// check-out today, etc.) and only they can see it. Kept OUT of `pulseChannels` so the grant/branch
// visibility loops never pick it up; it's rendered explicitly and resolved via `channelById`.
// Id matches the backend's USER_ALERTS_CHANNEL_ID.
export const userAlertsChannel: PulseChannel = {
  id: 'user_alerts', bizId: 'tk', module: 'hr',
  name: 'My Alerts', icon: '🔔', color: '#128C7E', tint: '#E7F3F2',
  description: 'Your personal alerts — check-in, check-out & more', members: [],
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

// ── channel groups ──
// One CARD per module instead of one per (module × branch): "Attendance" rather than "BOM
// Attendance" + "AMD Attendance". The per-branch channels below are still the real, backend-fed
// units — ids, grants, events and push payloads are untouched — a group is purely how the app
// presents them, with a branch chip strip inside the detail screen. Grants stay per branch, so a
// BOM-only user's group resolves to the BOM channel alone and never widens their access.
export interface PulseChannelGroup {
  id: string; // routing id only — never a backend channelId (prefixed so the two can't collide)
  module: ModuleKey;
  name: string; icon: string; color: string; tint: string; description: string;
  channels: PulseChannel[]; // the per-branch channels this card stands for
}

export const pulseGroups: PulseChannelGroup[] = [
  { id: 'grp_crm', module: 'crm', name: 'CRM', icon: '🎯', color: '#4F8BFF', tint: '#E4EDFF', description: 'Live CRM alerts across branches', channels: crmAlertChannels },
  { id: 'grp_accounts', module: 'accounts', name: 'Finance', icon: '📒', color: '#E8A13A', tint: '#FBEBD2', description: 'Live finance alerts from KBiz Books', channels: financeAlertChannels },
  { id: 'grp_hr', module: 'hr', name: 'Attendance', icon: '🕘', color: '#9A6CF0', tint: '#EBE2FC', description: 'Check-ins & check-outs across branches', channels: attendanceAlertChannels },
];

export const groupById = (id: string): PulseChannelGroup | undefined => pulseGroups.find((g) => g.id === id);
// The group a backend channel belongs to — resolves legacy deep links (push payloads carry the
// real channelId, e.g. 'tk_att_bom') onto the grouped screen with that branch preselected.
export const groupForChannel = (channelId: string): PulseChannelGroup | undefined =>
  pulseGroups.find((g) => g.channels.some((c) => c.id === channelId));

// Resolve any channel by id — the registered channels plus the personal User Alerts channel.
// Used by the alert detail screen (which must render user_alerts too, though it isn't in the
// grant-visible list).
export const channelById = (id: string): PulseChannel | undefined =>
  id === userAlertsChannel.id ? userAlertsChannel : pulseChannels.find((c) => c.id === id);

// Demo events removed — alerts now start empty until real events are wired in.
export const pulseEvents: PulseEvent[] = [];

export const moduleRank = (mk: ModuleKey): number => { const i = MODULE_ORDER.indexOf(mk); return i === -1 ? 99 : i; };
// NOTE: an event's branch comes from its `channelId` via the registry above — never from parsing
// the `context` string. (A regex over context used to do this; it silently mis-bucketed any event
// whose producer worded the context differently.)

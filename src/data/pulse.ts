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

// RETIRED 2026-08-19 — every branch-fed alert family. They all post into branch GROUP CHATS now:
//   daily finance reports + the day-close attendance summary → "HQ - <BR> Finance"
//   per-voucher money movements                              → "<BR> - Branch Accounts"
//   approved invoices + SO/PO/GP deals                       → "<BR> - Ticketing" (flights)
//                                                              "<BR> - Holidays" (everything else)
//   inter-branch deals                                       → "INB <desk> <A>/<B>"
// What is left here is the legacy Finance/CRM pair (hidden) and the personal My Alerts channel,
// which still carries a puncher's own "You checked in".
// Those daily reports are not alerts any more: the ERP posts them into the branch Finance group
// chats ("HQ - BOM Finance", …), where they can be replied to and forwarded. The backend channels,
// their event history and their PDFs were deleted with the same release — re-adding cards here
// would render three permanently empty groups.

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

// Channel families HIDDEN for now per the owner's call ahead of the Play Store rollout:
// "Finance" (the raw KBiz Books voucher feed), "CRM" and "Announcements". Every other family
// (nothing but the personal My Alerts channel) stays live.
// The backend keeps ingesting events for hidden channels untouched, so flipping a flag back to
// true restores that family's cards/grants with zero data loss.
export const FINANCE_ALERTS_ENABLED = false;
export const CRM_ALERTS_ENABLED = false;
export const ANNOUNCEMENTS_ENABLED = false;

// Only backend-registered channels are shown. The source app also generated one mock channel per
// (business × enabled module) — those had no backend counterpart and rendered as permanent dummy
// cards, so they were dropped. Re-add channels here only when the backend defines them
// (Backend src/mongo/alerts/alertChannels.ts) and emits their events.
export const pulseChannels: PulseChannel[] = [
  ...(ANNOUNCEMENTS_ENABLED ? [announcementsChannel] : []),
  ...(CRM_ALERTS_ENABLED ? crmAlertChannels : []),
  ...(FINANCE_ALERTS_ENABLED ? financeAlertChannels : []),
];

// Can this channel's events reach the user through the alerts UI? The server keeps sending events
// for hidden-family channels (their grants survive the flags), but the cards render only from the
// VISIBLE registry — so any unread badge/count must use this same gate, or events in hidden
// channels inflate a count the user has no way to clear (live case: 7 unread stuck on the Alerts
// tab from tk_crm_bom while CRM_ALERTS_ENABLED is false).
const visibleAlertChannelIds = new Set<string>([userAlertsChannel.id, ...pulseChannels.map((c) => c.id)]);
export const isVisibleAlertChannel = (channelId: string): boolean => visibleAlertChannelIds.has(channelId);

// FULL registry (visible or not) — id lookups must keep resolving hidden channels so a stray
// Finance push notification or old deep link never crashes the alert detail screen.
const allChannels: PulseChannel[] = [
  announcementsChannel,
  ...crmAlertChannels,
  ...financeAlertChannels,
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

const financeGroup: PulseChannelGroup =
  { id: 'grp_accounts', module: 'accounts', name: 'Finance', icon: '📒', color: '#E8A13A', tint: '#FBEBD2', description: 'Live finance alerts from KBiz Books', channels: financeAlertChannels };

const crmGroup: PulseChannelGroup =
  { id: 'grp_crm', module: 'crm', name: 'CRM', icon: '🎯', color: '#4F8BFF', tint: '#E4EDFF', description: 'Live CRM alerts across branches', channels: crmAlertChannels };

export const pulseGroups: PulseChannelGroup[] = [
  ...(CRM_ALERTS_ENABLED ? [crmGroup] : []),
  ...(FINANCE_ALERTS_ENABLED ? [financeGroup] : []),
];

export const groupById = (id: string): PulseChannelGroup | undefined => pulseGroups.find((g) => g.id === id);
// The group a backend channel belongs to — resolves legacy deep links (push payloads carry the
// real channelId, e.g. 'tk_fin_bom') onto the grouped screen with that branch preselected.
export const groupForChannel = (channelId: string): PulseChannelGroup | undefined =>
  pulseGroups.find((g) => g.channels.some((c) => c.id === channelId));

// Resolve any channel by id — the FULL registry (including hidden finance channels) plus the
// personal User Alerts channel. Used by the alert detail screen (which must render user_alerts
// too, though it isn't in the grant-visible list) and by push deep links, which may still carry
// hidden-channel ids.
export const channelById = (id: string): PulseChannel | undefined =>
  id === userAlertsChannel.id ? userAlertsChannel : allChannels.find((c) => c.id === id);

// Demo events removed — alerts now start empty until real events are wired in.
export const pulseEvents: PulseEvent[] = [];

export const moduleRank = (mk: ModuleKey): number => { const i = MODULE_ORDER.indexOf(mk); return i === -1 ? 99 : i; };
// NOTE: an event's branch comes from its `channelId` via the registry above — never from parsing
// the `context` string. (A regex over context used to do this; it silently mis-bucketed any event
// whose producer worded the context differently.)

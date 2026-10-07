import { MODULE_ORDER } from '../constants/modules';
import type { ModuleKey } from '../types';

export interface PulseChannel {
  id: string; bizId: string; module: ModuleKey;
  name: string; icon: string; color: string; tint: string; description: string; members: string[];
  branch?: string; // branch CODE (e.g. 'BOM') for branch-scoped channels — drives access grants `${branch}-${module}`
  // The grant family when it differs from the display module: CRM Alerts render as 'crm' but are
  // granted as "BOM-leads", apart from the grant-only "BOM-crm" pair. Read via channelGrantModule.
  grantModule?: string;
  // Every user of the branch sees it — the server grants it by branch membership, so it is not a
  // per-user switch in Team & Users.
  branchWide?: boolean;
  // A company-wide channel (KGD Alerts) is one channel for the whole company, not one per branch:
  // its `branch` is only the grant prefix ("KGD-crm-tickets"), so screens label it by `section`.
  companyWide?: boolean;
  section?: string;
}
export interface PulseEvent {
  id: string; channelId: string; source: string; title: string; body: string;
  context: string; time: number; read: boolean; actions?: { label: string; primary?: boolean }[];
  attachment?: { name: string; url: string }; // e.g. the ERP's invoice PDF; url may be server-relative
  contact?: { name?: string; phone: string }; // e.g. a converted lead's client (E.164) → WhatsApp / Call
  link?: string; // https — e.g. the ticket a KGD alert is about, opened in the in-app browser
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
  { id: 'tk_crm_bom', bizId: 'tk', module: 'crm', branch: 'BOM', name: 'CRM Payments - BOM', icon: '🎯', color: '#4F8BFF', tint: '#E4EDFF', description: 'Payments, ERP pushes, refunds · Mumbai branch', members: [] },
  { id: 'tk_crm_amd', bizId: 'tk', module: 'crm', branch: 'AMD', name: 'CRM Payments - AMD', icon: '🎯', color: '#4F8BFF', tint: '#E4EDFF', description: 'Payments, ERP pushes, refunds · Ahmedabad branch', members: [] },
];

// The Alerts section's groups (owner, 2026-09-27), in this order:
//   HR · CRM · ERP · CRM Reports · ERP Reports — one channel per branch in each, ids and grants
// matching the backend's alertChannels.ts. HR / ERP / ERP Reports are GRANT-ONLY (supers + the
// people switched on in Team & Users); CRM / CRM Reports are BRANCH-WIDE — the backend hands every
// user of a branch its "<BR>-leads" / "<BR>-crm-reports" grants, so no admin step is needed.
// Always visible (no flag). The ERP's Africa codes HNBO/HDAR/HFBM arrive as NBO/DAR/FBM.
const CITY: Record<string, string> = {
  BOM: 'Mumbai', AMD: 'Ahmedabad', NBO: 'Nairobi', DAR: 'Dar es Salaam', FBM: 'Lubumbashi', MHUB: 'Mumbai hub',
};
const ALL_BRANCHES = ['BOM', 'AMD', 'NBO', 'DAR', 'FBM', 'MHUB'];
const CRM_BRANCHES = ['BOM', 'AMD', 'NBO', 'DAR', 'FBM'];
const branchChannels = (
  prefix: string, grantModule: string, look: Pick<PulseChannel, 'module' | 'icon' | 'color' | 'tint'>,
  label: string, what: string, codes: string[], branchWide = false,
): PulseChannel[] => codes.map((branch) => ({
  id: `${prefix}_${branch.toLowerCase()}`, bizId: 'tk', ...look, grantModule, branch,
  ...(branchWide ? { branchWide: true } : {}),
  name: `${label} - ${branch}`, description: `${what} · ${CITY[branch] ?? branch}`, members: [],
}));
const HR_LOOK = { module: 'hr' as ModuleKey, icon: '👥', color: '#9A6CF0', tint: '#EBE2FC' };
const CRM_LOOK = { module: 'crm' as ModuleKey, icon: '🎯', color: '#4F8BFF', tint: '#E4EDFF' };
const ERP_LOOK = { module: 'accounts' as ModuleKey, icon: '📒', color: '#E8A13A', tint: '#FBEBD2' };
const CRM_REPORTS_LOOK = { module: 'crm' as ModuleKey, icon: '📊', color: '#2FB36B', tint: '#DCF5E8' };
const ERP_REPORTS_LOOK = { module: 'accounts' as ModuleKey, icon: '📑', color: '#D6568D', tint: '#FBE6F0' };

// HR — each check-in / check-out line and the 10 PM attendance summary.
export const hrAlertChannels = branchChannels('tk_hr', 'attendance', HR_LOOK, 'HR', 'Check-in / check-out & day summary', ALL_BRANCHES);
// CRM — a lead converted into a query, in the QUERY's branch. (Ids keep their "lead" launch name.)
export const leadAlertChannels = branchChannels('tk_lead', 'leads', CRM_LOOK, 'CRM', 'Leads converted to queries', CRM_BRANCHES, true);
// ERP — approved-booking invoices, deal summaries and posted money vouchers from KBiz Books.
export const erpAlertChannels = branchChannels('tk_erp', 'erp', ERP_LOOK, 'ERP', 'Invoices, deals & vouchers from KBiz Books', ALL_BRANCHES);
// CRM Reports — the daily 11:00 Query Ageing PDF.
export const crmReportChannels = branchChannels('tk_crmrep', 'crm-reports', CRM_REPORTS_LOOK, 'CRM Reports', 'Daily query ageing', CRM_BRANCHES, true);
// ERP Reports — the daily 11:00 Receivables / Payables ageing and Bank & Cash PDFs.
export const erpReportChannels = branchChannels('tk_erprep', 'erp-reports', ERP_REPORTS_LOOK, 'ERP Reports', 'Daily receivables, payables & bank', ALL_BRANCHES);

// KGD Alerts (owner, 2026-10-07) — a ticket raised in the CRM or in KBiz Books. Two company-wide
// channels, one per system; grant-only ("KGD-crm-tickets" / "KGD-erp-tickets"), switched per user
// from the ERP's Settings ▸ Users & Roles ▸ Mobile Alerts. Ids match the backend's alertChannels.ts.
const KGD_LOOK = { icon: '🎫', color: '#E2533B', tint: '#FCE4DF' };
export const kgdAlertChannels: PulseChannel[] = [
  { id: 'tk_kgd_crm', bizId: 'tk', module: 'crm', grantModule: 'crm-tickets', branch: 'KGD', companyWide: true, section: 'CRM', name: 'KGD Alerts - CRM', ...KGD_LOOK, description: 'Tickets raised in the CRM', members: [] },
  { id: 'tk_kgd_erp', bizId: 'tk', module: 'accounts', grantModule: 'erp-tickets', branch: 'KGD', companyWide: true, section: 'ERP', name: 'KGD Alerts - ERP', ...KGD_LOOK, description: 'Tickets raised in KBiz Books', members: [] },
];

/** How a channel is named inside its group: the section of a company-wide channel ("CRM"), else the
 *  branch ("BOM"), else its own name. */
export const channelLabel = (ch: PulseChannel): string => ch.section || ch.branch || ch.name;

// The grant family a channel is checked against: alertOK(ch.branch, channelGrantModule(ch)).
export const channelGrantModule = (ch: PulseChannel): string => ch.grantModule ?? ch.module;

// RETIRED 2026-08-19 — every branch-fed alert family. They all post into branch GROUP CHATS now:
//   daily finance reports + the day-close attendance summary → "HQ - <BR> Finance"
//   per-voucher money movements                              → "<BR> - Branch Accounts"
//   approved invoices + SO/PO/GP deals                       → "<BR> - Ticketing" (flights)
//                                                              "<BR> - Holidays" (everything else)
//   inter-branch deals                                       → "INB <desk> <A>/<B>"
// What is left here is the legacy Finance/CRM pair (hidden), the five Alerts groups and My Alerts,
// which still carries a puncher's own "You checked in".
// REVERSED 2026-09-27 (owner): those feeds are alerts again — attendance in HR, the live ERP feed
// in ERP, the daily finance PDFs in ERP Reports (below) — with fresh ids; the retired ones above
// stay retired and the group chats no longer receive them.

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
// (the five Alerts groups and the personal My Alerts channel) stays live.
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
  ...hrAlertChannels,
  ...leadAlertChannels,
  ...erpAlertChannels,
  ...crmReportChannels,
  ...erpReportChannels,
  ...kgdAlertChannels,
  ...(CRM_ALERTS_ENABLED ? crmAlertChannels : []),
  ...(FINANCE_ALERTS_ENABLED ? financeAlertChannels : []),
];

// The channels a super-admin switches per user in Team & Users — branch-wide ones are granted
// by branch membership instead, so a switch there could only disagree with what the user sees.
export const grantableAlertChannels: PulseChannel[] = pulseChannels.filter((c) => c.branch && !c.branchWide);

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
  ...hrAlertChannels,
  ...leadAlertChannels,
  ...erpAlertChannels,
  ...crmReportChannels,
  ...erpReportChannels,
  ...kgdAlertChannels,
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
  { id: 'grp_crm', module: 'crm', name: 'CRM Payments', icon: '🎯', color: '#4F8BFF', tint: '#E4EDFF', description: 'Payments, ERP pushes & refunds (legacy)', channels: crmAlertChannels };

const group = (id: string, name: string, look: { module: ModuleKey; icon: string; color: string; tint: string }, description: string, channels: PulseChannel[]): PulseChannelGroup =>
  ({ id, name, ...look, description, channels });

// The five groups, in the owner's order.
export const alertGroups: PulseChannelGroup[] = [
  group('grp_hr', 'HR', HR_LOOK, 'Check-in / check-out & the 10 PM attendance summary', hrAlertChannels),
  group('grp_leads', 'CRM', CRM_LOOK, 'Leads converted to queries in your branch', leadAlertChannels),
  group('grp_erp', 'ERP', ERP_LOOK, 'Approved invoices, deals & vouchers from KBiz Books', erpAlertChannels),
  group('grp_crm_reports', 'CRM Reports', CRM_REPORTS_LOOK, 'Daily 11:00 query ageing PDF', crmReportChannels),
  group('grp_erp_reports', 'ERP Reports', ERP_REPORTS_LOOK, 'Daily receivables, payables & bank-and-cash PDFs', erpReportChannels),
  group('grp_kgd', 'KGD Alerts', { module: 'crm', ...KGD_LOOK }, 'Tickets raised in the CRM and in KBiz Books', kgdAlertChannels),
];

export const pulseGroups: PulseChannelGroup[] = [
  ...alertGroups,
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

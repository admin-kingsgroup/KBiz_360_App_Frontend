// Alert mutes — personal, set by each user for themselves (Backend alerts/alertMutes.ts). A muted
// alert channel still shows its events; it just stops sending this user push notifications, and
// its unread events stop counting toward the Alerts tab badge.
// channelId → epoch ms the mute ends, or null for "Always".
export type AlertMuteMap = Record<string, number | null>;

// The choices the mute sheet offers — the same three as muting a chat.
export const ALERT_MUTE_CHOICES: { label: string; hours: number | null }[] = [
  { label: '8 hours', hours: 8 },
  { label: '1 week', hours: 24 * 7 },
  { label: 'Always', hours: null },
];

export function isAlertMuted(mutes: AlertMuteMap | undefined, channelId: string, now: number = Date.now()): boolean {
  if (!mutes || !(channelId in mutes)) return false;
  const until = mutes[channelId];
  return until === null || until > now;
}

// One card or screen can stand for several branch channels (ERP = BOM + AMD + …). It reads as
// muted only when every one of them is; `some` lets the sheet offer to unmute a partial mute.
// `until` = when the last of them ends (null = at least one is "Always"), only when `all`.
export function muteStateOf(mutes: AlertMuteMap | undefined, channelIds: string[], now: number = Date.now()): { all: boolean; some: boolean; until: number | null } {
  const muted = channelIds.filter((id) => isAlertMuted(mutes, id, now));
  const all = channelIds.length > 0 && muted.length === channelIds.length;
  const ends = muted.map((id) => (mutes as AlertMuteMap)[id]);
  const until = !all || ends.some((e) => e === null) ? null : Math.max(...(ends as number[]));
  return { all, some: muted.length > 0, until };
}

// "Muted" (always), or when it ends: "Muted until 6:30 PM" today, "Muted until tomorrow, 2:30 AM",
// "Muted until 7 Oct" later. (utils/time dateStamp is for PAST times — it prints any future
// instant as a clock time.)
export function muteLabel(until: number | null, now: number = Date.now()): string {
  if (until === null) return 'Muted';
  const end = new Date(until);
  const day = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(end) - day(new Date(now))) / 86_400_000);
  const clock = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days <= 0) return `Muted until ${clock}`;
  if (days === 1) return `Muted until tomorrow, ${clock}`;
  return `Muted until ${end.toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
}

// Unread events that should still count toward the Alerts tab badge — muted channels don't.
export const countsTowardBadge = (e: { read: boolean; channelId: string }, mutes: AlertMuteMap | undefined, now: number = Date.now()): boolean =>
  !e.read && !isAlertMuted(mutes, e.channelId, now);

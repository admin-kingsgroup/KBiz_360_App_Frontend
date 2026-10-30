import type { ChatConversation } from '../api/chat';
import type { AttendanceRecord } from '../types';
import type { ReminderTopItem } from '../store/reminderBadgeStore';
import { oneLine } from './text';
import type { WidgetReviewItem } from './ownerReview';

// The JSON the home-screen widgets read: iOS decodes it as `Snapshot` (targets/widget/index.swift),
// Android's Work Board as parseSnapshot (modules/kbiz-widget/.../WidgetData.kt). Keep all three in
// lockstep. Every field added after the first widget is optional on both native sides, so a snapshot
// written by an older app version still reads.

export interface WidgetChat {
  id: string;
  name: string;
  preview: string;
  unread: number;
  /** Last activity, epoch ms. */
  at: number | null;
  group: boolean;
}

export interface WidgetSnapshot {
  signedIn: true;
  userName: string;
  unreadChats: number;
  unreadMessages: number;
  chats: WidgetChat[];
  reminderCount: number;
  reminderForMe: number;
  reminders: ReminderTopItem[];
  approvals: number;
  /** The Owner's Review (owner, 2026-10-30): what the Director approved since the Owner last looked. Present ONLY for the
   *  Owner — the widgets then show Review where everyone else sees Late, and the rows under it. */
  review?: number;
  reviewItems?: WidgetReviewItem[];
  attendanceIn: string | null;
  attendanceOut: string | null;
  attendanceInAt: number | null;
  attendanceOutAt: number | null;
  updatedAt: number;
}

export interface WidgetInputs {
  userName: string;
  conversations: ChatConversation[];
  reminders: { count: number; forMe: number; top: ReminderTopItem[] };
  /** Approvals tab badge total (ERP + app requests). */
  approvals: number;
  /** The Owner's Review — null for everyone else. */
  review?: { count: number; items: WidgetReviewItem[] } | null;
  att: AttendanceRecord;
  now: number;
}

const WIDGET_CHAT_CAP = 4;

const hhmm = (d: Date): string => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const ms = (iso: string | undefined | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

// Same words the chat list shows: one line of text, or the media kind for a photo / voice note.
const MEDIA_LABEL: Record<string, string> = {
  image: 'Photo', video: 'Video', audio: 'Voice message', voice: 'Voice message', document: 'Document', file: 'Document', sticker: 'Sticker', location: 'Location', contact: 'Contact',
};
export function chatPreview(c: ChatConversation): string {
  const last = c.lastMessage;
  if (!last) return '';
  if (last.type === 'text') return oneLine(last.text).slice(0, 120);
  return MEDIA_LABEL[last.type] ?? (last.text ? oneLine(last.text).slice(0, 120) : 'Message');
}

// Same rule as the app-icon badge (chatNotifications): chats with unread, muted excluded.
const countsAsUnread = (c: ChatConversation): boolean => (c.unread || 0) > 0 && !c.muted;

export function buildWidgetSnapshot(i: WidgetInputs): WidgetSnapshot {
  const unread = i.conversations.filter(countsAsUnread);
  const chats = unread
    .filter((c) => !c.archived)
    .sort((a, b) => (ms(b.lastActivityAt) ?? 0) - (ms(a.lastActivityAt) ?? 0))
    .slice(0, WIDGET_CHAT_CAP)
    .map((c) => ({ id: c.id, name: c.name, preview: chatPreview(c), unread: c.unread, at: ms(c.lastActivityAt), group: c.type === 'group' }));
  const { inTime, outTime } = i.att;
  return {
    signedIn: true,
    userName: i.userName,
    unreadChats: unread.length,
    unreadMessages: unread.reduce((n, c) => n + (c.unread || 0), 0),
    chats,
    reminderCount: i.reminders.count,
    // The widgets read reminderForMe first. It carries the Reminders tab badge's number (owner, 2026-10-30: "the reminder
    // count on the widget is not what the app shows") — pending for me + mine waiting for my approval.
    reminderForMe: i.reminders.count,
    reminders: i.reminders.top,
    approvals: i.approvals,
    ...(i.review ? { review: i.review.count, reviewItems: i.review.items } : {}),
    attendanceIn: inTime ? hhmm(inTime) : null,
    attendanceOut: outTime ? hhmm(outTime) : null,
    attendanceInAt: inTime ? inTime.getTime() : null,
    attendanceOutAt: outTime ? outTime.getTime() : null,
    updatedAt: i.now,
  };
}

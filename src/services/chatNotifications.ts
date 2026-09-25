import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { applyChatPush, chatPushLine, pushedMessage, type ChatPushData } from '../logic/chatPushApply';
import { loadSession } from './storage/session';
import type { ChatConversation } from '../api/chat';

// WhatsApp-style chat notifications + app-icon unread badge.
//
// Background (app killed/backgrounded): the FCM data push lands in callBackground's handler, which
// calls handleChatMessagePush → (1) apply the message to the PERSISTED messaging snapshot in
// AsyncStorage so the next cold open renders the chat list + unread instantly, (2) draw/refresh one
// notifee notification per conversation (stacked message lines, like WhatsApp), (3) set the app-icon
// badge to the number of chats with unread messages (WhatsApp counts chats, not messages). Muted
// conversations get NO notification and do NOT count in the badge — the message only lands silently
// in the chat list (WhatsApp mute semantics); the backend pushes regardless, so mute is client-side.
//
// Foreground: the socket keeps the live store current; syncChatNotifications (store subscription in
// the root layout) keeps the badge in step and clears a conversation's notification when it is read.
//
// All native modules are lazy-required and fail-safe (no-ops in Expo Go / builds without them).

const STORE_KEY = 'kb360-messaging'; // zustand persist key (shape: {state:{conversations,...},version})
const LINES_KEY = 'kb360-chat-notif-lines'; // { [convId]: string[] } — pending notification lines
const MAX_LINES = 6;

/* eslint-disable @typescript-eslint/no-explicit-any */
const native = !isRunningInExpoGo();

function loadNotifee(): { notifee: any; AndroidImportance: any; AndroidStyle: any } | null {
  if (!native) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('@notifee/react-native');
    return { notifee: m.default, AndroidImportance: m.AndroidImportance, AndroidStyle: m.AndroidStyle };
  } catch {
    return null;
  }
}

async function getAS(): Promise<{ getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> } | null> {
  try {
    return (await import('@react-native-async-storage/async-storage')).default;
  } catch {
    return null;
  }
}

// App-icon badge. iOS: real badge. Android: best-effort exact count via expo-notifications
// (ShortcutBadger — supported on Samsung/most OEM launchers); launchers without it still show the
// notification-count badge from the 'messages' channel. Never throws.
export async function setAppBadge(count: number): Promise<void> {
  if (!native) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    /* no-op */
  }
}

let channelReady = false;
async function ensureMessagesChannel(notifee: any, AndroidImportance: any): Promise<void> {
  if (channelReady || Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: 'messages',
    name: 'Messages',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
    badge: true, // launcher unread badge from active notifications
  });
  channelReady = true;
}

interface LinesMap {
  [convId: string]: string[];
}

async function readLines(): Promise<LinesMap> {
  const AS = await getAS();
  if (!AS) return {};
  try {
    return JSON.parse((await AS.getItem(LINES_KEY)) ?? '{}') as LinesMap;
  } catch {
    return {};
  }
}

async function writeLines(map: LinesMap): Promise<void> {
  const AS = await getAS();
  if (AS) await AS.setItem(LINES_KEY, JSON.stringify(map)).catch(() => undefined);
}

// One notification per conversation (id chat-<convId>), latest message as the body and up to
// MAX_LINES stacked lines (InboxStyle) — the WhatsApp look. Returns silently on any failure.
export async function displayChatNotification(data: ChatPushData, lines: string[]): Promise<void> {
  const mod = loadNotifee();
  if (!mod || !data.conversationId) return;
  const { notifee, AndroidImportance, AndroidStyle } = mod;
  try {
    await ensureMessagesChannel(notifee, AndroidImportance);
    const isGroup = data.convType === 'group';
    const title = (isGroup ? data.convName : data.senderName) || data.senderName || 'New message';
    const body = lines[lines.length - 1] ?? data.preview ?? '';
    await notifee.displayNotification({
      id: `chat-${data.conversationId}`,
      title,
      body,
      data: { type: 'chat', id: data.conversationId, conversationId: data.conversationId },
      android: {
        channelId: 'messages',
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default', launchActivity: 'default' },
        // Stack the pending messages like WhatsApp when more than one is waiting.
        ...(lines.length > 1 ? { style: { type: AndroidStyle.INBOX, lines: lines.slice(-MAX_LINES) } } : {}),
        number: lines.length, // per-conversation count (long-press bubble on supported launchers)
      },
    });
  } catch {
    /* display is best-effort */
  }
}

// Delivered receipt from the killed/backgrounded app (WhatsApp semantics: the push reaching the
// device IS delivery — the sender's tick turns ✓✓ without the app being opened). The socket is not
// alive here, so ack over REST with the persisted session token. Best-effort: if it fails (device
// offline, expired access token) the delivered-on-connect sweep catches up at the next app open.
async function ackDeliveredViaRest(conversationId: string): Promise<void> {
  try {
    const s = await loadSession();
    const base = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? '';
    if (!s?.access || !base) return;
    await fetch(`${base}/api/conversations/${conversationId}/delivered`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.access}` },
    });
  } catch {
    /* best-effort */
  }
}

// BACKGROUND entry point (called from callBackground's FCM handler; app killed or backgrounded).
export async function handleChatMessagePush(data: ChatPushData): Promise<void> {
  if (!data.conversationId) return;
  void ackDeliveredViaRest(data.conversationId); // fire-and-forget — never delays the notification
  // 0) Store the message on the device NOW, while the app is still closed. This is what makes the
  //    chat already contain it — from local storage, no request — when the notification is tapped.
  //    Best-effort: if the payload wasn't the complete message, catch-up sync collects it later.
  const pushed = pushedMessage(data);
  if (pushed) {
    try {
      const db = (await import('./chatDb')) as typeof import('./chatDb');
      await db.upsert(data.conversationId, [pushed as unknown as { id: string; createdAt: string }]);
    } catch { /* headless context without the filesystem module — sync will pick it up */ }
  }

  // 1) Fold the message into the persisted store snapshot → cold open shows it instantly.
  let unreadChats: number | null = null;
  let muted = false;
  const AS = await getAS();
  if (AS) {
    try {
      const raw = await AS.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: { conversations?: ChatConversation[] } };
        const res = applyChatPush(parsed.state?.conversations ?? [], data);
        unreadChats = res.unreadChats;
        muted = !!res.conversations.find((c) => c.id === data.conversationId)?.muted;
        if (res.changed && parsed.state) {
          parsed.state.conversations = res.conversations;
          await AS.setItem(STORE_KEY, JSON.stringify(parsed));
        } else if (!res.changed) {
          return; // duplicate delivery — notification + badge already reflect this message
        }
      }
    } catch {
      /* snapshot update is best-effort — still notify below */
    }
  }

  // Muted conversation: land the message silently in the chat list — no notification, no badge
  // change beyond the (mute-excluding) recount above.
  if (muted) {
    if (unreadChats != null) await setAppBadge(unreadChats);
    return;
  }

  // 2) Append this message to the conversation's pending lines and (re)draw its notification.
  const line = chatPushLine(data); // mention-aware ("X mentioned you: …")
  const map = await readLines();
  map[data.conversationId] = [...(map[data.conversationId] ?? []), line].slice(-MAX_LINES);
  await writeLines(map);
  await displayChatNotification(data, map[data.conversationId]);

  // 3) App-icon badge = chats with unread messages (falls back to counting conversations with
  //    pending notification lines when the snapshot was unavailable).
  if (unreadChats == null) unreadChats = Object.keys(map).length;
  await setAppBadge(unreadChats);
}

// FOREGROUND banner for an FCM chat data-push. The live store/socket already handles the data —
// this only draws the heads-up, and skips it for the conversation the user is looking at and for
// muted conversations.
export async function showForegroundChatBanner(data: ChatPushData, activeConversationId: string | null, muted = false): Promise<void> {
  if (!data.conversationId || data.conversationId === activeConversationId || muted) return;
  // Record the line like the background path does — the sync sweep can then find and cancel this
  // notification once the chat is read (unrecorded banners used to linger and keep the launcher's
  // notification-count badge alive with zero unread).
  const map = await readLines();
  map[data.conversationId] = [...(map[data.conversationId] ?? []), chatPushLine(data)].slice(-MAX_LINES);
  await writeLines(map);
  await displayChatNotification(data, map[data.conversationId]);
}

// Store-driven sync (root layout subscribes): badge ← unmuted chats with unread; conversations read
// or muted in-app get their notification + pending lines cleared. Debounced by the caller.
// One-time shade reset (per install). Old builds posted notifications that the CURRENT notifee
// cannot cancel by id (its internal record of them is gone), and such an orphan pins the
// launcher's notification-count badge forever (verified on-device: a stale group notification
// survived every id-based cancel). Clear everything once — displayed chat/reminder/alert
// notifications all re-arrive on the next real push; scheduled (future) local reminders are
// untouched (cancelAll only affects the shade).
// v2: notifee.cancelAllNotifications only clears notifications IT recorded — the orphan survived
// it. expo-notifications' dismissAllNotificationsAsync is a true OS-level NotificationManager
// cancelAll, which removes anything regardless of which library (or which old build) posted it.
const SHADE_RESET_KEY = 'kb360-shade-reset-v2';
let shadeResetChecked = false; // per-process fast path
async function oneTimeShadeReset(mod: NonNullable<ReturnType<typeof loadNotifee>>): Promise<void> {
  if (shadeResetChecked) return;
  shadeResetChecked = true;
  const AS = await getAS();
  if (!AS) return;
  try {
    if (await AS.getItem(SHADE_RESET_KEY)) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    await Notifications.dismissAllNotificationsAsync();
    await mod.notifee.cancelAllNotifications();
    await AS.setItem(SHADE_RESET_KEY, '1');
  } catch { /* best-effort */ }
}

// Sign-out reset: the badge and any displayed chat notifications belong to the account that just
// logged out — clear them so the icon doesn't keep advertising unread the next session can't see.
// Nothing else zeroes the badge here: the store subscription that normally syncs it is torn down
// on the auth flip (its debounce timer is cleared in the same cleanup), and iOS keeps the last
// aps.badge value until something overwrites it.
export async function clearChatNotificationsForLogout(): Promise<void> {
  if (!native) return;
  await setAppBadge(0);
  const mod = loadNotifee();
  const map = await readLines();
  if (mod) {
    for (const id of Object.keys(map)) await mod.notifee.cancelNotification(`chat-${id}`).catch(() => undefined);
    // Shade sweep for banners the lines map never saw (foreground banners, OS re-posts).
    try {
      const displayed = (await mod.notifee.getDisplayedNotifications()) as { id?: string; notification?: { id?: string; android?: { channelId?: string } } }[];
      for (const d of displayed) {
        const nid = d.notification?.id ?? d.id;
        if (typeof nid !== 'string') continue;
        if (nid.startsWith('chat-') || d.notification?.android?.channelId === 'messages') {
          await mod.notifee.cancelNotification(nid).catch(() => undefined);
        }
      }
    } catch { /* sweep is best-effort */ }
  }
  await writeLines({});
}

export async function syncChatNotifications(conversations: ChatConversation[]): Promise<void> {
  if (!native) return;
  const total = conversations.filter((c) => (c.unread || 0) > 0 && !c.muted).length;
  await setAppBadge(total);
  const modForReset = loadNotifee();
  if (modForReset) await oneTimeShadeReset(modForReset);
  // A conversation is stale when it has been read (unread 0), muted (mute silences its pending
  // notification too), or no longer exists in the loaded list. An EMPTY list means the store
  // hasn't hydrated/loaded yet — never clear on that.
  const isStale = (id: string): boolean => {
    const conv = conversations.find((c) => c.id === id);
    return conv ? conv.unread === 0 || conv.muted : conversations.length > 0;
  };
  const mod = loadNotifee();
  const map = await readLines();
  const stale = Object.keys(map).filter(isStale);
  if (stale.length) {
    for (const id of stale) {
      delete map[id];
      if (mod) await mod.notifee.cancelNotification(`chat-${id}`).catch(() => undefined);
    }
    await writeLines(map);
  }
  // Belt-and-braces: cancel by DERIVED id for every read/muted conversation. Notifee cancels via
  // the same hashed native id even when getDisplayedNotifications does NOT report an old build's
  // post (proven on-device: a pre-redesign 'chat-<convId>' notification survived every
  // reported-id sweep and kept the launcher badge at 1 with zero unread).
  if (mod) {
    for (const c of conversations) {
      if ((c.unread || 0) === 0 || c.muted) await mod.notifee.cancelNotification(`chat-${c.id}`).catch(() => undefined);
    }
  }
  // Sweep the shade too: cancel any chat-* notification whose conversation is read/muted/unknown.
  // Notifications can be up that the lines map never saw (foreground banners, OS re-posts) — and a
  // leftover one keeps feeding the launcher's notification-count badge after everything is read.
  // Anything ELSE sitting on the 'messages' channel (not our chat-<convId> scheme) is a stray from
  // an older build — cancel it outright, it can only misreport the badge.
  if (mod) {
    try {
      const displayed = (await mod.notifee.getDisplayedNotifications()) as { id?: string; notification?: { id?: string; android?: { channelId?: string } } }[];
      for (const d of displayed) {
        const nid = d.notification?.id ?? d.id;
        if (typeof nid !== 'string') continue;
        const isChat = nid.startsWith('chat-');
        const onMessagesChannel = d.notification?.android?.channelId === 'messages';
        if ((isChat && isStale(nid.slice('chat-'.length))) || (!isChat && onMessagesChannel)) {
          await mod.notifee.cancelNotification(nid).catch(() => undefined);
        }
      }
    } catch { /* sweep is best-effort */ }
  }
}

// Foreground FCM listener — chat data-pushes arriving while the app is OPEN (the background handler
// only runs when it is not). Returns an unsubscribe (no-op outside native builds).
export function registerForegroundChatPush(
  getActiveConversationId: () => string | null,
  isConversationMuted: (conversationId: string) => boolean = () => false,
): () => void {
  if (!native) return () => undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getMessaging, onMessage } = require('@react-native-firebase/messaging');
    return onMessage(getMessaging(), async (msg: { data?: Record<string, string> }) => {
      const data = (msg.data ?? {}) as ChatPushData & { type?: string };
      if (data.type === 'chat_message') {
        await showForegroundChatBanner(data, getActiveConversationId(), data.conversationId ? isConversationMuted(data.conversationId) : false);
      }
    });
  } catch {
    return () => undefined;
  }
}

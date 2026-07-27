import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { applyChatPush, type ChatPushData } from '../logic/chatPushApply';
import { loadSession } from './storage/session';
import type { ChatConversation } from '../api/chat';

// WhatsApp-style chat notifications + app-icon unread badge.
//
// Background (app killed/backgrounded): the FCM data push lands in callBackground's handler, which
// calls handleChatMessagePush → (1) apply the message to the PERSISTED messaging snapshot in
// AsyncStorage so the next cold open renders the chat list + unread instantly, (2) draw/refresh one
// notifee notification per conversation (stacked message lines, like WhatsApp), (3) set the app-icon
// badge to the total unread.
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

  // 1) Fold the message into the persisted store snapshot → cold open shows it instantly.
  let totalUnread: number | null = null;
  const AS = await getAS();
  if (AS) {
    try {
      const raw = await AS.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: { conversations?: ChatConversation[] } };
        const res = applyChatPush(parsed.state?.conversations ?? [], data);
        totalUnread = res.totalUnread;
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

  // 2) Append this message to the conversation's pending lines and (re)draw its notification.
  const isGroup = data.convType === 'group';
  const line = isGroup && data.senderName ? `${data.senderName}: ${data.preview ?? ''}` : (data.preview ?? '');
  const map = await readLines();
  map[data.conversationId] = [...(map[data.conversationId] ?? []), line].slice(-MAX_LINES);
  await writeLines(map);
  await displayChatNotification(data, map[data.conversationId]);

  // 3) App-icon badge = total unread across conversations (falls back to counting pending lines
  //    when the snapshot was unavailable).
  if (totalUnread == null) totalUnread = Object.values(map).reduce((s, l) => s + l.length, 0);
  await setAppBadge(totalUnread);
}

// FOREGROUND banner for an FCM chat data-push. The live store/socket already handles the data —
// this only draws the heads-up, and skips it for the conversation the user is looking at.
export async function showForegroundChatBanner(data: ChatPushData, activeConversationId: string | null): Promise<void> {
  if (!data.conversationId || data.conversationId === activeConversationId) return;
  const isGroup = data.convType === 'group';
  const line = isGroup && data.senderName ? `${data.senderName}: ${data.preview ?? ''}` : (data.preview ?? '');
  await displayChatNotification(data, [line]);
}

// Store-driven sync (root layout subscribes): badge ← total unread; conversations read in-app get
// their notification + pending lines cleared. Debounced by the caller.
export async function syncChatNotifications(conversations: ChatConversation[]): Promise<void> {
  if (!native) return;
  const total = conversations.reduce((s, c) => s + (c.unread || 0), 0);
  await setAppBadge(total);
  const map = await readLines();
  // A conversation is stale when it has been read (unread 0) or no longer exists in the loaded
  // list. An EMPTY list means the store hasn't hydrated/loaded yet — never clear on that.
  const stale = Object.keys(map).filter((id) => {
    const conv = conversations.find((c) => c.id === id);
    return conv ? conv.unread === 0 : conversations.length > 0;
  });
  if (!stale.length) return;
  const mod = loadNotifee();
  for (const id of stale) {
    delete map[id];
    if (mod) await mod.notifee.cancelNotification(`chat-${id}`).catch(() => undefined);
  }
  await writeLines(map);
}

// Foreground FCM listener — chat data-pushes arriving while the app is OPEN (the background handler
// only runs when it is not). Returns an unsubscribe (no-op outside native builds).
export function registerForegroundChatPush(getActiveConversationId: () => string | null): () => void {
  if (!native) return () => undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getMessaging, onMessage } = require('@react-native-firebase/messaging');
    return onMessage(getMessaging(), async (msg: { data?: Record<string, string> }) => {
      const data = (msg.data ?? {}) as ChatPushData & { type?: string };
      if (data.type === 'chat_message') await showForegroundChatBanner(data, getActiveConversationId());
    });
  } catch {
    return () => undefined;
  }
}

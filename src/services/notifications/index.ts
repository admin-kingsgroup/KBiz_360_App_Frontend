import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import type { NotificationResponse } from 'expo-notifications';
import { routeForData, type NotifType, type NotifData } from './routes';
import { registerCallDevice } from '../../api/calls';
import { useMessagingStore } from '../../store/messagingStore';

// Client-only notifications. No backend/push delivery — we configure the foreground display
// handler, request OS permission, schedule LOCAL notifications, and map a tapped notification's
// data payload to an in-app route. Remote push (Expo push tokens / APNs / FCM) is [NEEDS BACKEND].
//
// IMPORTANT: expo-notifications removed remote-push support from Expo Go in SDK 53 and now THROWS
// at import time on Android there (a push-token auto-registration side effect runs on load). So we
// never import it statically — we lazy-require it ONLY outside Expo Go and no-op otherwise, which
// lets the app still boot in Expo Go for UI work. Real notification behavior (handler, scheduling,
// tap routing) requires a development build — see CLAUDE.md.
export const notificationsSupported = !isRunningInExpoGo();

type NotificationsModule = typeof import('expo-notifications');
type Subscription = { remove: () => void };

let mod: NotificationsModule | null = null;
function load(): NotificationsModule | null {
  if (!notificationsSupported) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!mod) mod = require('expo-notifications') as NotificationsModule;
  return mod;
}

// Foreground presentation. Since the backend pushes EVERY message (reliability — see chat.service),
// we suppress the banner only when the app is already showing that exact conversation; every other
// chat/reminder/call still pops a heads-up while the app is foregrounded. (No-op in Expo Go; when
// the app is backgrounded/killed the OS shows the notification and this handler never runs.)
load()?.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = (notification?.request?.content?.data ?? {}) as { type?: string; id?: string; conversationId?: string };
    const activeConv = useMessagingStore.getState().activeConversationId;
    const inThisChat = data.type === 'chat' && (data.conversationId ?? data.id) === activeConv;
    return {
      shouldShowBanner: !inThisChat,
      shouldShowList: !inThisChat,
      shouldPlaySound: !inThisChat,
      shouldSetBadge: false,
    };
  },
});

// Register the incoming-call Accept/Decline action category on startup (needs no permission), so the
// buttons appear on the call push even when the app was killed. (ensureCallCategory is hoisted.)
void ensureCallCategory();

// WhatsApp-style app-icon badge: only unread CHATS count. Chat notifications live on notifee's
// 'messages' channel (badge ON — see chatNotifications.ts); everything else (reminders, alerts)
// posts to 'general' with the badge OFF, so OEM launchers' notification-count badge ignores them.
// The legacy 'default' channel DID badge, and channel settings are immutable once created — so we
// migrate: create 'general', then DELETE 'default', which also cancels any stale notification
// still sitting on it (those kept a phantom icon badge alive with zero unread chats). Runs on every
// app start (root layout) and before the permission prompt; both are idempotent.
export async function ensureNotificationChannels(): Promise<void> {
  const m = load();
  if (!m || Platform.OS !== 'android') return;
  try {
    await m.setNotificationChannelAsync('general', {
      name: 'KBiz 360',
      importance: m.AndroidImportance.HIGH, // heads-up popup for reminders & alerts
      vibrationPattern: [0, 200, 100, 200],
      showBadge: false,
    });
    await m.deleteNotificationChannelAsync('default');
  } catch { /* channels are best-effort */ }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const m = load();
  if (!m) return false;
  await ensureNotificationChannels();
  const current = await m.getPermissionsAsync();
  if (current.granted) return true;
  const req = await m.requestPermissionsAsync();
  return req.granted;
}

// Schedule a LOCAL notification (min 1s out). Returns null in Expo Go. Posts on the non-badging
// 'general' channel — the app-icon badge is reserved for unread chats (WhatsApp-style).
export async function scheduleLocal(title: string, body: string, data: NotifData = {}, delaySeconds = 1): Promise<string | null> {
  const m = load();
  if (!m) return null;
  try {
    const granted = (await m.getPermissionsAsync()).granted;
    if (!granted) return null;
    return await m.scheduleNotificationAsync({
      content: { title, body, data: data as Record<string, unknown> },
      trigger: { type: m.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, delaySeconds), channelId: 'general' },
    });
  } catch {
    return null;
  }
}

// Cancel a scheduled local notification. No-op in Expo Go or when it already fired.
export async function cancelLocal(notificationId: string): Promise<void> {
  const m = load();
  if (!m) return;
  try { await m.cancelScheduledNotificationAsync(notificationId); } catch { /* already gone */ }
}

// Ensure a high-importance Android channel for incoming calls (the backend push targets channelId
// 'calls'). No-op on iOS / Expo Go.
async function ensureCallChannel(): Promise<void> {
  const m = load();
  if (!m || Platform.OS !== 'android') return;
  await m.setNotificationChannelAsync('calls', {
    name: 'Calls',
    importance: m.AndroidImportance.MAX,
    // No explicit `sound` — passing a string makes expo-notifications look for a bundled custom
    // sound file (and warn when missing). Omitting it uses the system default notification sound.
    vibrationPattern: [0, 250, 250, 250],
    bypassDnd: true,
    lockscreenVisibility: m.AndroidNotificationVisibility.PUBLIC,
  });
}

// Register the incoming-call notification category so the call push shows Accept / Decline buttons
// (the backend tags those pushes with categoryId 'incoming_call'). Tapping a button is handled in
// useNotificationRouting via the action identifier. No-op on Expo Go.
export async function ensureCallCategory(): Promise<void> {
  const m = load();
  if (!m) return;
  await m.setNotificationCategoryAsync('incoming_call', [
    { identifier: 'accept', buttonTitle: 'Accept', options: { opensAppToForeground: true } },
    { identifier: 'decline', buttonTitle: 'Decline', options: { opensAppToForeground: true, isDestructive: true } },
  ]);
}

// Register this device's Expo push token with the backend so it can ring us when offline. Requires
// notification permission + an EAS projectId (app.json → extra.eas.projectId); fails soft otherwise.
export async function registerPushToken(): Promise<void> {
  const m = load();
  if (!m) return;
  try {
    const granted = (await m.getPermissionsAsync()).granted;
    if (!granted) return;
    await ensureCallChannel();
    await ensureCallCategory();
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const { data: token } = await m.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (token) await registerCallDevice(token, Platform.OS);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[push] token registration skipped:', (e as Error).message);
  }
}

// Tap-routing facade used by useNotificationRouting. Safe no-ops in Expo Go: the cold-start lookup
// resolves to null and the listener is an inert subscription, so the hook simply never fires.
export const Notifications = {
  async getLastNotificationResponseAsync(): Promise<NotificationResponse | null> {
    return (await load()?.getLastNotificationResponseAsync()) ?? null;
  },
  addNotificationResponseReceivedListener(listener: (response: NotificationResponse) => void): Subscription {
    return load()?.addNotificationResponseReceivedListener(listener) ?? { remove() {} };
  },
};

export { routeForData };
export type { NotifType, NotifData };

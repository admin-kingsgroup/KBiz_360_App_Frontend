import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import type { NotificationResponse } from 'expo-notifications';
import { routeForData, type NotifType, type NotifData } from './routes';
import { registerCallDevice } from '../../api/calls';

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

// Foreground presentation: show banner + list, no sound by default. (No-op in Expo Go.)
load()?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const m = load();
  if (!m) return false;
  if (Platform.OS === 'android') {
    await m.setNotificationChannelAsync('default', {
      name: 'KBiz 360',
      importance: m.AndroidImportance.HIGH, // heads-up popup for messages & reminders
      vibrationPattern: [0, 200, 100, 200],
    });
  }
  const current = await m.getPermissionsAsync();
  if (current.granted) return true;
  const req = await m.requestPermissionsAsync();
  return req.granted;
}

// Schedule a LOCAL notification. delaySeconds <= 0 fires immediately. Returns null in Expo Go.
export async function scheduleLocal(title: string, body: string, data: NotifData = {}, delaySeconds = 1): Promise<string | null> {
  const m = load();
  if (!m) return null;
  try {
    const granted = (await m.getPermissionsAsync()).granted;
    if (!granted) return null;
    return await m.scheduleNotificationAsync({
      content: { title, body, data: data as Record<string, unknown> },
      trigger: delaySeconds > 0
        ? { type: m.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds }
        : null,
    });
  } catch {
    return null;
  }
}

// Ensure a high-importance Android channel for incoming calls (the backend push targets channelId
// 'calls'). No-op on iOS / Expo Go.
async function ensureCallChannel(): Promise<void> {
  const m = load();
  if (!m || Platform.OS !== 'android') return;
  await m.setNotificationChannelAsync('calls', {
    name: 'Calls',
    importance: m.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    bypassDnd: true,
    lockscreenVisibility: m.AndroidNotificationVisibility.PUBLIC,
  });
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

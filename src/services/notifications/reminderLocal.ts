import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelLocal } from './index';

// Self-reminders schedule a local OS notification at their due time (reminder/new). Completing or
// reassigning that reminder must cancel the pending notification, so the phone doesn't ring for
// work that's already done. The reminderId → notificationId map lives in AsyncStorage so the
// cancel still works across app restarts.
const KEY = 'kb360_reminder_local_notifs';
const MAX_ENTRIES = 100; // fired entries are never individually pruned, so cap the map instead

type NotifMap = Record<string, string>;

async function readMap(): Promise<NotifMap> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as NotifMap;
  } catch {
    return {};
  }
}

async function writeMap(map: NotifMap): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(map)); } catch { /* best-effort */ }
}

export async function rememberReminderLocal(reminderId: string, notificationId: string | null): Promise<void> {
  if (!notificationId) return; // Expo Go / permission denied — nothing was scheduled
  const map = await readMap();
  map[reminderId] = notificationId;
  const keys = Object.keys(map); // insertion order — oldest first
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete map[k];
  await writeMap(map);
}

export async function cancelReminderLocal(reminderId: string): Promise<void> {
  const map = await readMap();
  const notificationId = map[reminderId];
  if (!notificationId) return; // not a self-reminder from this device
  delete map[reminderId];
  await writeMap(map);
  await cancelLocal(notificationId);
}

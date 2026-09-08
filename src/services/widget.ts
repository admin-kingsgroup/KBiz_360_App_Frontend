import { Platform, AppState } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import { useAuthStore } from '../store/authStore';
import { useMessagingStore } from '../store/messagingStore';
import { useReminderBadgeStore } from '../store/reminderBadgeStore';
import { useAttendanceStore } from '../store/attendanceStore';

// iOS home-screen widget feed. Writes a JSON snapshot of the signed-in user's data (unread chats,
// reminder badge + top items, today's punch) into the shared App Group so the WidgetKit extension
// (targets/widget/index.swift) can render it, then asks WidgetKit to redraw. ExtensionStorage
// no-ops when the native module is absent (Expo Go / builds made before the widget target), so
// this is safe to call anywhere. Keep the JSON shape in lockstep with `Snapshot` in index.swift.

const APP_GROUP = 'group.com.kingsgroup.kbiz360';
const SNAPSHOT_KEY = 'widgetSnapshot';
const native = Platform.OS === 'ios' && !isRunningInExpoGo();

type Storage = import('@bacons/apple-targets').ExtensionStorage;
let storage: Storage | null = null;
let ExtensionStorageClass: typeof import('@bacons/apple-targets').ExtensionStorage | null = null;
function getStorage(): Storage | null {
  if (!native) return null;
  if (!storage) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@bacons/apple-targets') as typeof import('@bacons/apple-targets');
      ExtensionStorageClass = mod.ExtensionStorage;
      storage = new mod.ExtensionStorage(APP_GROUP);
    } catch {
      return null;
    }
  }
  return storage;
}

const hhmm = (d: Date): string => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function buildSnapshot(): Record<string, unknown> {
  const user = useAuthStore.getState().user;
  const conversations = useMessagingStore.getState().conversations;
  const { count: reminderCount, top } = useReminderBadgeStore.getState();
  const att = useAttendanceStore.getState().att;
  return {
    signedIn: true,
    userName: user?.name ?? '',
    // Same rule as the app-icon badge (chatNotifications): chats with unread, muted excluded.
    unreadChats: conversations.filter((c) => (c.unread || 0) > 0 && !c.muted).length,
    reminderCount,
    reminders: top,
    attendanceIn: att.inTime ? hhmm(att.inTime) : null,
    attendanceOut: att.outTime ? hhmm(att.outTime) : null,
    updatedAt: Date.now(),
  };
}

function write(snapshot: Record<string, unknown>): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
    ExtensionStorageClass?.reloadWidget();
  } catch {
    /* widget feed is best-effort — never let it break the app */
  }
}

export function syncWidgetSnapshot(): void {
  if (!native) return;
  write(buildSnapshot());
}

// Signed out: leave a marker so the widget shows its "open the app" state instead of stale data.
export function clearWidgetSnapshot(): void {
  if (!native) return;
  write({ signedIn: false });
}

// Root layout calls this while signed in. Immediate sync + debounced re-sync on any relevant store
// change + a flush when the app backgrounds (so the widget is fresh when the user reaches the
// home screen). Returns the cleanup for the effect.
export function initWidgetSync(): () => void {
  if (!native) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(syncWidgetSnapshot, 500);
  };
  syncWidgetSnapshot();
  const unsubs = [
    useMessagingStore.subscribe(schedule),
    useReminderBadgeStore.subscribe(schedule),
    useAttendanceStore.subscribe(schedule),
  ];
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'background') syncWidgetSnapshot();
  });
  return () => {
    for (const u of unsubs) u();
    appState.remove();
    if (timer) clearTimeout(timer);
  };
}

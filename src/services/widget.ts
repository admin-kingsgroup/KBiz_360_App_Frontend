import { Platform, AppState } from 'react-native';
import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import { useAuthStore } from '../store/authStore';
import { useMessagingStore } from '../store/messagingStore';
import { useReminderBadgeStore } from '../store/reminderBadgeStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { useApprovalBadgeStore } from '../store/approvalBadgeStore';
import { buildWidgetSnapshot, type WidgetSnapshot } from '../logic/widgetSnapshot';

// Home-screen widget feed. Writes a JSON snapshot of the signed-in user's work (unread chats, my
// reminders with due times, approvals waiting, today's punch) where the widgets can read it, then
// asks them to redraw:
// - iOS: the shared App Group, read by the WidgetKit extension (targets/widget/index.swift).
//   ExtensionStorage no-ops when its native module is absent (Expo Go / builds made before the target).
// - Android: the KbizWidget native module (modules/kbiz-widget), which stores it for the Work Board
//   widget. Absent in Expo Go and in binaries built before it, so an OTA of this file is a no-op there.
// Keep the JSON shape in lockstep with `Snapshot` in index.swift and parseSnapshot in WidgetData.kt.

const APP_GROUP = 'group.com.kingsgroup.kbiz360';
const SNAPSHOT_KEY = 'widgetSnapshot';
const ios = Platform.OS === 'ios' && !isRunningInExpoGo();

interface AndroidWidgetModule {
  setSnapshot(json: string): Promise<void>;
}
const androidWidget = Platform.OS === 'android' ? requireOptionalNativeModule<AndroidWidgetModule>('KbizWidget') : null;
const native = ios || androidWidget != null;

type Storage = import('@bacons/apple-targets').ExtensionStorage;
let storage: Storage | null = null;
let ExtensionStorageClass: typeof import('@bacons/apple-targets').ExtensionStorage | null = null;
function getStorage(): Storage | null {
  if (!ios) return null;
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

function buildSnapshot(): WidgetSnapshot {
  const { count, forMe, top } = useReminderBadgeStore.getState();
  return buildWidgetSnapshot({
    userName: useAuthStore.getState().user?.name ?? '',
    conversations: useMessagingStore.getState().conversations,
    reminders: { count, forMe, top },
    approvals: useApprovalBadgeStore.getState().count,
    att: useAttendanceStore.getState().att,
    now: Date.now(),
  });
}

function write(snapshot: WidgetSnapshot | { signedIn: false }): void {
  const json = JSON.stringify(snapshot);
  try {
    if (androidWidget) {
      androidWidget.setSnapshot(json).catch(() => undefined);
      return;
    }
    const s = getStorage();
    if (!s) return;
    s.set(SNAPSHOT_KEY, json);
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
    // Unread chats are all the widget shows from this store — skip typing/presence/message churn.
    useMessagingStore.subscribe((s, prev) => { if (s.conversations !== prev.conversations) schedule(); }),
    useReminderBadgeStore.subscribe(schedule),
    useApprovalBadgeStore.subscribe(schedule),
    // Only the punch matters here — presence repaints on every GPS fix and must not rewrite the feed.
    useAttendanceStore.subscribe((s, prev) => { if (s.att !== prev.att) schedule(); }),
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

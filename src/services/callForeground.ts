import { useEffect } from 'react';
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import { registerFcmDevice } from '../api/calls';
import { callManager } from './rtc/CallManager';

// Native-only helpers for the full-screen incoming-call UI. No-op in Expo Go.
/* eslint-disable @typescript-eslint/no-explicit-any */
const native = !isRunningInExpoGo();
function load(): { fb: any; notifee: any; EventType: { ACTION_PRESS: number; PRESS: number } } | null {
  if (!native) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notifeeMod = require('@notifee/react-native');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return { fb: require('@react-native-firebase/messaging'), notifee: notifeeMod.default, EventType: notifeeMod.EventType };
  } catch {
    return null; // native modules not in this build yet (rebuild required)
  }
}

// Register this device's raw FCM token with the backend (enables the data-push call UI).
// Modular RNFirebase v22+ API (getMessaging/getToken/requestPermission).
export async function registerFcmToken(): Promise<void> {
  const m = load();
  if (!m) return;
  try {
    const { getMessaging, getToken, requestPermission } = m.fb;
    const messaging = getMessaging();
    await requestPermission(messaging);
    const token = await getToken(messaging);
    if (token) await registerFcmDevice(token, Platform.OS);
  } catch {
    /* best-effort */
  }
}

interface NotifLike { notification?: { id?: string; data?: Record<string, string> }; pressAction?: { id?: string } }

// Answer / Decline taps from the native call notification — cold-start launch + foreground taps.
// 'answer' accepts (the reconnect re-emit + pendingAccept connect the call); 'decline' rejects;
// a body/full-screen tap just opens the app and the in-app overlay shows Accept/Decline.
export function useCallNotifications(): void {
  useEffect(() => {
    const m = load();
    if (!m) return;
    const { notifee, EventType } = m;
    const act = (info: NotifLike | null | undefined): void => {
      const data = info?.notification?.data;
      if (!data || data.type !== 'call') return;
      const actionId = info?.pressAction?.id;
      if (actionId === 'answer') callManager.acceptFromNotification(data.callId);
      else if (actionId === 'decline') {
        callManager.declineFromNotification(data.callId);
        if (info?.notification?.id) void notifee.cancelNotification(info.notification.id);
      }
    };
    void (notifee.getInitialNotification() as Promise<NotifLike | null>).then(act);
    const unsub = notifee.onForegroundEvent((e: unknown) => {
      const ev = e as { type: number; detail: NotifLike };
      if (ev.type === EventType.ACTION_PRESS || ev.type === EventType.PRESS) act(ev.detail);
    });
    return () => unsub();
  }, []);
}

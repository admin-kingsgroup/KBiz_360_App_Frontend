import { useEffect } from 'react';
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import { useRouter, useSegments } from 'expo-router';
import { registerFcmDevice } from '../api/push';
import { consumePendingChatTap, setPendingChatTap, subscribePendingChatTap } from './notifications/pendingTap';
import { useGate } from '../navigation/guards';

// FCM device registration + notification-tap routing. (This file kept its name from the retired
// calling feature — the FCM pipeline it owns also delivers chat pushes, which is all it does now.)
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

// Register this device's raw FCM token with the backend (enables background chat data pushes).
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

// getInitialNotification returns the SAME launch tap on every consumer mount for the lifetime of
// the process — module-level guard so a gate/root remount doesn't replay it (same pattern as
// useNotificationRouting's handledResponseId).
let initialTapHandled = false;

// Taps on NOTIFEE notifications — cold-start launch + foreground taps. A chat body tap LATCHES the
// conversation (pendingTap) and the effect below opens it once the auth gate has settled — routing
// immediately raced the gate's login → (tabs) replace() on cold start, which stomped the chat
// screen and left the user on Home. Background presses land in callBackground's onBackgroundEvent,
// which latches the same way.
export function useCallNotifications(): void {
  const router = useRouter();
  const gate = useGate();
  const segments = useSegments() as string[];

  useEffect(() => {
    const m = load();
    if (!m) return;
    const { notifee, EventType } = m;
    const act = (info: NotifLike | null | undefined, initial = false): void => {
      const data = info?.notification?.data;
      if (!data) return;
      if (initial) {
        if (initialTapHandled) return;
        initialTapHandled = true;
      }
      if (data.type === 'chat' && (data.id || data.conversationId)) {
        setPendingChatTap(String(data.id ?? data.conversationId));
      }
    };
    void (notifee.getInitialNotification() as Promise<NotifLike | null>).then((n) => act(n, true));
    const unsub = notifee.onForegroundEvent((e: unknown) => {
      const ev = e as { type: number; detail: NotifLike };
      if (ev.type === EventType.ACTION_PRESS || ev.type === EventType.PRESS) act(ev.detail);
    });

    // iOS displays chat pushes natively from the APNs alert (no notifee involved), so taps arrive
    // via RNFirebase instead. Android chat pushes are data-only → these never fire there.
    let unsubFcmOpen: (() => void) | null = null;
    try {
      const { getMessaging, onNotificationOpenedApp, getInitialNotification: getInitialFcm } = m.fb;
      const fcmAct = (msg: { data?: Record<string, string> } | null | undefined): void => {
        const d = msg?.data;
        if (d?.type === 'chat_message' && d.conversationId) setPendingChatTap(d.conversationId);
      };
      const messaging = getMessaging();
      void getInitialFcm(messaging).then(fcmAct);
      unsubFcmOpen = onNotificationOpenedApp(messaging, fcmAct);
    } catch {
      /* older RNFirebase without these — notifee path still covers Android */
    }

    return () => {
      unsub();
      unsubFcmOpen?.();
    };
  }, [router]);

  // Consume the latched tap once routing is safe: signed in, past the (auth) redirects. Re-runs on
  // segment changes (so it fires right after the gate's replace('/(tabs)') settles) and subscribes
  // for taps latched while the app is already running (background press → immediate open).
  useEffect(() => {
    if (gate !== 'app' || segments[0] === '(auth)') return;
    const open = (): void => {
      const id = consumePendingChatTap();
      // navigate, not push: focuses an already-mounted instance of this chat instead of stacking one.
      if (id) router.navigate({ pathname: '/chat/[id]', params: { id } });
    };
    open();
    return subscribePendingChatTap(open);
  }, [gate, segments, router]);
}

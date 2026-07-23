import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';
import { Notifications } from '../services/notifications';
import { routeForData, type NotifData } from '../services/notifications/routes';
import { callManager } from '../services/rtc/CallManager';

// Module-level, NOT a ref: getLastNotificationResponseAsync returns the most recent response for
// the LIFETIME of the process, and a per-mount ref forgets it whenever the gate remounts — every
// root remount then replayed the last tap and pushed the same screen again.
let handledResponseId: string | null = null;

// Registers a tap-response listener and routes into the app. Also handles the cold-start case
// (app launched by tapping a notification) and the incoming-call Accept/Decline action buttons.
export function useNotificationRouting() {
  const router = useRouter();

  useEffect(() => {
    const go = (data: NotifData | undefined) => {
      if (!data) return;
      // routeForData stays router-agnostic (pure + unit-tested), so it returns a generic
      // { pathname, params }. expo-router 56's typed routes want a strict Href union; cast to
      // exactly what navigate() accepts rather than coupling the pure module to expo-router types.
      // navigate (not push): tapping a notification for the screen already on top must focus it,
      // never stack a second live instance (each mounted instance runs its own GPS/poll timers).
      const route = routeForData(data) as Parameters<typeof router.navigate>[0];
      router.navigate(route);
    };

    const handle = (resp: NotificationResponse | null): void => {
      const reqId = resp?.notification.request.identifier;
      if (!resp || !reqId || handledResponseId === reqId) return;
      handledResponseId = reqId;
      const data = resp.notification.request.content.data as NotifData & { callId?: string };
      const action = resp.actionIdentifier;
      // Incoming-call Accept / Decline buttons (categoryId 'incoming_call').
      if (data?.type === 'call' && (action === 'accept' || action === 'decline')) {
        const callId = (data.callId ?? data.id) ?? '';
        if (action === 'accept') { callManager.acceptFromNotification(callId); go(data); }
        else callManager.declineFromNotification(callId);
        return;
      }
      go(data);
    };

    // Cold start: launched from a notification tap or action.
    Notifications.getLastNotificationResponseAsync().then(handle);
    // Warm: tapped while running/backgrounded.
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [router]);
}

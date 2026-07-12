import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';
import { Notifications } from '../services/notifications';
import { routeForData, type NotifData } from '../services/notifications/routes';
import { callManager } from '../services/rtc/CallManager';

// Registers a tap-response listener and routes into the app. Also handles the cold-start case
// (app launched by tapping a notification) and the incoming-call Accept/Decline action buttons.
export function useNotificationRouting() {
  const router = useRouter();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const go = (data: NotifData | undefined) => {
      if (!data) return;
      // routeForData stays router-agnostic (pure + unit-tested), so it returns a generic
      // { pathname, params }. expo-router 56's typed routes want a strict Href union; cast to
      // exactly what push() accepts rather than coupling the pure module to expo-router types.
      const route = routeForData(data) as Parameters<typeof router.push>[0];
      router.push(route);
    };

    const handle = (resp: NotificationResponse | null): void => {
      const reqId = resp?.notification.request.identifier;
      if (!resp || !reqId || handled.current === reqId) return;
      handled.current = reqId;
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

import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Notifications } from '../services/notifications';
import { routeForData, type NotifData } from '../services/notifications/routes';

// Registers a tap-response listener and routes into the app. Also handles the cold-start case
// (app launched by tapping a notification). Client-only — no remote delivery.
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

    // Cold start: launched from a notification tap.
    Notifications.getLastNotificationResponseAsync().then((resp) => {
      const reqId = resp?.notification.request.identifier;
      if (resp && reqId && handled.current !== reqId) {
        handled.current = reqId;
        go(resp.notification.request.content.data as NotifData);
      }
    });

    // Warm: tapped while running/backgrounded.
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const reqId = resp.notification.request.identifier;
      if (handled.current === reqId) return;
      handled.current = reqId;
      go(resp.notification.request.content.data as NotifData);
    });
    return () => sub.remove();
  }, [router]);
}

// Headless background handler for chat messages arriving over FCM while the app is backgrounded
// or killed. Imported from the app entry (index.js) so the handler is registered BEFORE React
// mounts. Guarded so it never runs in Expo Go. (In-app voice calling was removed 07-31; this
// module keeps its filename so the entry import stays stable, but it is chat-only now.)
import { isRunningInExpoGo } from 'expo';
import { handleChatMessagePush } from './chatNotifications';
import { setPendingChatTap } from './notifications/pendingTap';

// Wrapped in try/catch so a build WITHOUT the native modules degrades gracefully instead of
// crashing the app at startup.
if (!isRunningInExpoGo()) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getMessaging, setBackgroundMessageHandler } = require('@react-native-firebase/messaging');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notifee = require('@notifee/react-native').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventType } = require('@notifee/react-native');

    // FCM data message while the app is backgrounded/killed (modular API — RNFirebase v22+).
    setBackgroundMessageHandler(getMessaging(), async (msg: { data?: Record<string, string> }) => {
      const data = msg.data ?? {};
      // Chat message while killed/backgrounded: fold into the cached chat list (instant unread on
      // next open), draw the per-conversation notification, and bump the app-icon badge.
      if (data.type === 'chat_message') await handleChatMessagePush(data);
      // Stale call pushes from the retired calling feature (old backend queue / old builds): make
      // sure nothing lingers in the shade.
      else if (data.type === 'call_cancel' && data.callId) await notifee.cancelNotification(`call-${data.callId}`);
    });

    notifee.onBackgroundEvent(async ({ type, detail }: { type: number; detail: { pressAction?: { id: string }; notification?: { id?: string; data?: Record<string, string> } } }) => {
      // Chat notification body press while the app is backgrounded/killed: launchActivity brings the
      // app up, but no router exists in this headless handler — latch the conversation; the layout
      // opens it once the gate settles (useNotificationTaps).
      const data = detail.notification?.data;
      if (type === EventType.PRESS && data?.type === 'chat' && (data.id || data.conversationId)) {
        setPendingChatTap(String(data.id ?? data.conversationId));
      }
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[callBackground] native messaging modules unavailable — rebuild the app (eas build):', (e as Error).message);
  }
}

export {};

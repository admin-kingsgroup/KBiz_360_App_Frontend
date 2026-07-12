// Headless background handlers for the native full-screen incoming call. This module is imported
// from the app entry (index.js) so the handlers are registered BEFORE React mounts — required for
// FCM/notifee to work when the app is killed. Guarded so it never runs in Expo Go.
import { isRunningInExpoGo } from 'expo';

// Wrapped in try/catch so a build WITHOUT the native modules (e.g. before the EAS rebuild that adds
// @react-native-firebase/@notifee) degrades gracefully instead of crashing the app at startup.
if (!isRunningInExpoGo()) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getMessaging, setBackgroundMessageHandler } = require('@react-native-firebase/messaging');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notifee = require('@notifee/react-native').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AndroidImportance, AndroidCategory, AndroidVisibility, EventType } = require('@notifee/react-native');

  const displayIncomingCall = async (data: Record<string, string>): Promise<void> => {
    await notifee.createChannel({ id: 'calls', name: 'Calls', importance: AndroidImportance.HIGH, sound: 'default', vibration: true });
    await notifee.displayNotification({
      id: `call-${data.callId}`,
      title: data.callerName || 'Incoming call',
      body: data.callType === 'video' ? 'Incoming video call' : 'Incoming voice call',
      data,
      android: {
        channelId: 'calls',
        category: AndroidCategory.CALL,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        // Draws the call UI full-screen over the lock screen.
        fullScreenAction: { id: 'default', launchActivity: 'default' },
        pressAction: { id: 'default', launchActivity: 'default' },
        actions: [
          { title: 'Decline', pressAction: { id: 'decline' } },
          { title: 'Answer', pressAction: { id: 'answer', launchActivity: 'default' } },
        ],
        ongoing: true,
        autoCancel: false,
        loopSound: true,
        lightUpScreen: true,
        timeoutAfter: 45000,
      },
    });
  };

  // FCM data message while the app is backgrounded/killed (modular API — RNFirebase v22+).
  setBackgroundMessageHandler(getMessaging(), async (msg: { data?: Record<string, string> }) => {
    const data = msg.data ?? {};
    if (data.type === 'call') await displayIncomingCall(data);
    else if (data.type === 'call_cancel') await notifee.cancelNotification(`call-${data.callId}`);
  });

  // Decline tapped from the background full-screen notification (cancel it; the call rings out → missed).
  notifee.onBackgroundEvent(async ({ type, detail }: { type: number; detail: { pressAction?: { id: string }; notification?: { id?: string } } }) => {
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'decline' && detail.notification?.id) {
      await notifee.cancelNotification(detail.notification.id);
    }
    // 'answer' / body press use launchActivity → the app opens and answers (see useCallNotifications).
  });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[callBackground] native call modules unavailable — rebuild the app (eas build):', (e as Error).message);
  }
}

export {};

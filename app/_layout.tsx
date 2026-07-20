import '../global.css';
import { useEffect, useState } from 'react';
import { View, AppState } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary, OfflineBanner } from '../src/components/common';
import { IncomingCallOverlay, ActiveCallOverlay } from '../src/components/call';
import { useGate } from '../src/navigation/guards';
import { useNotificationRouting } from '../src/hooks/useNotificationRouting';
import { useAttendanceStore } from '../src/store/attendanceStore';
import { useAuthStore } from '../src/store/authStore';
import { connectChatSocket, disconnectChatSocket } from '../src/realtime/chatSocket';
import { syncAttendanceGeofencing } from '../src/services/backgroundAttendance';
import { autoCheckInOnForeground } from '../src/services/foregroundAttendance';
import { installGlobalCrashHandler, flushStoredCrash } from '../src/services/crashReporter';
import { registerFcmToken, useCallNotifications } from '../src/services/callForeground';
import { setupIosCallKeep } from '../src/services/iosCallKeep';
import { registerPushToken } from '../src/services/notifications';
import { maybePromptBatteryOptimization } from '../src/services/batteryOptimization';
import { useEmailStore } from '../src/store/emailStore';
import { useMessagingStore } from '../src/store/messagingStore';
import { useCallSessionStore } from '../src/store/callSessionStore';
import { loadPrefs, savePerms } from '../src/services/storage';
import { getBackgroundLocationStatus } from '../src/services/locationPermission';
import { locationPermSatisfied } from '../src/logic/permissionGate';
import { authApi } from '../src/api';
import { colors } from '../src/theme';
import Constants from 'expo-constants';
import { setApiBaseUrl } from '../src/api';

// Point the API client at the backend (configurable via app.json → expo.extra.apiUrl;
// use your machine's LAN IP when testing on a physical device).
setApiBaseUrl((Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:4000');

// Location revocation guard. Location is required ("While using the app" is enough; background
// "Allow all the time" is optional). Verified on every app open + foreground; if location is turned
// fully OFF in Settings, flip the perm OFF, which sends the gate back to the permissions screen
// until re-granted. Downgrade-only — granting lives on the permissions screen (avoids the two racing).
async function enforceBgLocation(): Promise<void> {
  const st = await getBackgroundLocationStatus();
  if (locationPermSatisfied(st)) return;
  const store = useAttendanceStore.getState();
  if (!store.perms.location) return;
  store.setPerm('location', false);
  void savePerms(useAttendanceStore.getState().perms);
}

// Root gate: redirects between (auth) login/permissions and (tabs) based on store state.
// "View as" is NOT consulted here — it is access-overlay store state, never a routing input.
function GateController() {
  const gate = useGate();
  const segments = useSegments() as string[];
  const router = useRouter();
  useNotificationRouting(); // route on notification tap (client-only)
  useCallNotifications(); // Answer/Decline from the native full-screen incoming-call notification

  // Realtime chat socket follows the session AND foreground state: connected while signed-in and
  // active; dropped when signed out or backgrounded. Dropping on background marks the user offline
  // promptly so incoming calls/messages reliably fall back to push (instead of a stale "online").
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
  useEffect(() => {
    if (!signedIn) { disconnectChatSocket(); return; }
    void enforceBgLocation();
    connectChatSocket();
    void registerPushToken(); // Expo push token → background message/reminder notifications (every launch, so returning users stay registered)
    void registerFcmToken(); // raw FCM token → native full-screen call UI (Android)
    setupIosCallKeep(); // iOS: CallKit + VoIP/PushKit incoming-call screen
    void syncAttendanceGeofencing(); // start OS geofencing for the user's offices (background auto check-in)
    void autoCheckInOnForeground(); // opening the app at the office marks attendance (foreground, any screen)
    void useEmailStore.getState().refreshUnread(); // Email tab badge — real Graph inbox unread (without opening Email)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void enforceBgLocation(); // location revoked in Settings while backgrounded → back to the gate
        void autoCheckInOnForeground(); // re-check on every foreground: at the office → auto check-in
        connectChatSocket();
        void useMessagingStore.getState().loadConversations(); // refresh chat list on return (server is source of truth)
        void useEmailStore.getState().refreshUnread(); // Email tab badge
        void useEmailStore.getState().silentRefresh('inbox'); // + bring new inbox mail into the list (no spinner)
      } else if (state === 'background') {
        // Keep the signaling socket alive during a call — backgrounding mid-call must NOT drop
        // call:offer/answer/ice/end (that would hang the call). Drop it only when idle.
        const cs = useCallSessionStore.getState();
        if (!cs.active && !cs.incoming) disconnectChatSocket();
      }
    });
    return () => sub.remove();
  }, [signedIn]);

  useEffect(() => {
    const inAuth = segments[0] === '(auth)';
    const onPermissions = segments[1] === 'permissions';
    if (gate === 'login' && !inAuth) router.replace('/(auth)/login');
    else if (gate === 'permissions' && !onPermissions) router.replace('/(auth)/permissions');
    else if (gate === 'app' && inAuth) router.replace('/(tabs)');
  }, [gate, segments, router]);

  // Once the user is actually in the app (Android only), prompt ONCE to disable battery optimization
  // so background calls/messages stay reliable. Delayed so the home screen renders first.
  useEffect(() => {
    if (gate !== 'app') return;
    const t = setTimeout(() => void maybePromptBatteryOptimization(), 1500);
    return () => clearTimeout(t);
  }, [gate]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="attendance" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="view-as" options={{ presentation: 'modal' }} />
      <Stack.Screen name="business/[id]" />
      <Stack.Screen name="department/[id]" />
      <Stack.Screen name="alert/[id]" />
      <Stack.Screen name="alert/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="reminder/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="reminder/archive" />
      <Stack.Screen name="email/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="email/folder/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="email/compose" options={{ presentation: 'modal' }} />
      <Stack.Screen name="call/[id]" options={{ presentation: 'card' }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Restore the persisted session + perms/consent BEFORE the gate decides, so a returning user lands
  // straight in the app (signed in until explicit logout) and previously-granted permissions are not
  // re-requested ("asked once" preserved across restart).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Crash reporting: catch fatal JS errors (stashed and flushed next launch) + send any
    // report left behind by a previous crash.
    installGlobalCrashHandler();
    void flushStoredCrash();
    let active = true;
    Promise.all([loadPrefs(), authApi.restoreSession()]).then(([p]) => {
      if (!active) return;
      useAttendanceStore.getState().hydrate(p);
      setHydrated(true);
    });
    return () => { active = false; };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ErrorBoundary>
            <OfflineBanner />
            {hydrated ? <GateController /> : <View style={{ flex: 1, backgroundColor: colors.coolBg }} />}
            {/* Global call overlays — render over any screen and survive navigation (call state
                lives in callSessionStore). Active first so an incoming call layers above it. */}
            <ActiveCallOverlay />
            <IncomingCallOverlay />
            <StatusBar style="dark" />
          </ErrorBoundary>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

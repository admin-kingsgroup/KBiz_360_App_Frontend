import '../global.css';
import { useEffect, useState } from 'react';
import { View, AppState } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { isRunningInExpoGo } from 'expo';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary, OfflineBanner } from '../src/components/common';
import { GlobalToast } from '../src/components/ui';
import { useGate } from '../src/navigation/guards';
import { useNotificationRouting } from '../src/hooks/useNotificationRouting';
import { useAttendanceStore } from '../src/store/attendanceStore';
import { useAuthStore } from '../src/store/authStore';
import { connectChatSocket, disconnectChatSocket } from '../src/realtime/chatSocket';
import { reconcileHiddenAttendance } from '../src/services/hiddenAttendance';
import { installGlobalCrashHandler, flushStoredCrash } from '../src/services/crashReporter';
import { registerFcmToken, useCallNotifications } from '../src/services/callForeground';
import { registerForegroundChatPush, syncChatNotifications } from '../src/services/chatNotifications';
import { registerPushToken, ensureNotificationChannels } from '../src/services/notifications';
import { maybePromptBatteryOptimization } from '../src/services/batteryOptimization';
import { useEmailStore } from '../src/store/emailStore';
import { useMessagingStore } from '../src/store/messagingStore';
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

// Location revocation guard. Only FOREGROUND location ("While using the app") is required —
// verified on every app open + foreground; if location is fully revoked in Settings, flip the perm
// OFF, which sends the gate back to the permissions screen until re-granted. "Allow all the time"
// is optional (Attendance-screen nudge) and its absence never gates entry. Downgrade-only —
// granting lives on the permissions screen (avoids the two racing).
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
    void registerFcmToken(); // raw FCM token → background chat data pushes (Android)
    void ensureNotificationChannels(); // migrate legacy badging 'default' channel → non-badging 'general' (badge = chats only)
    // Hidden (director) attendance: silently reconcile check-in/out against the office geofence on
    // every app open. For everyone else this only disarms any leftover background geofencing.
    void reconcileHiddenAttendance();
    void useEmailStore.getState().refreshUnread(); // Email tab badge — real Graph inbox unread (without opening Email)
    // FCM chat pushes while the app is OPEN → heads-up banner (suppressed for the active chat and
    // for muted conversations).
    const unsubChatPush = registerForegroundChatPush(
      () => useMessagingStore.getState().activeConversationId,
      (conversationId) => !!useMessagingStore.getState().conversations.find((c) => c.id === conversationId)?.muted,
    );
    // App-icon badge ← unmuted chats with unread; reading a chat in-app clears its notification.
    // Debounced so bursts of store updates (socket receive + refetch) collapse into one sync.
    let badgeTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubBadge = useMessagingStore.subscribe((s) => {
      if (badgeTimer) clearTimeout(badgeTimer);
      badgeTimer = setTimeout(() => void syncChatNotifications(s.conversations), 400);
    });
    // Light heartbeat for hidden (director) attendance while the app stays open — catches leaving
    // the office with the app foregrounded. No-op (a single cheap /me) for everyone else.
    const hiddenTick = setInterval(() => void reconcileHiddenAttendance(), 5 * 60_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void enforceBgLocation(); // location revoked in Settings while backgrounded → back to the gate
        void reconcileHiddenAttendance(); // director geofence reconcile on every return to foreground
        connectChatSocket();
        void useMessagingStore.getState().loadConversations(); // refresh chat list on return (server is source of truth)
        void useEmailStore.getState().refreshUnread(); // Email tab badge
        void useEmailStore.getState().silentRefresh('inbox'); // + bring new inbox mail into the list (no spinner)
      } else if (state === 'background') {
        disconnectChatSocket(); // marks the user offline promptly; messages fall back to push
      }
    });
    return () => {
      sub.remove();
      unsubChatPush();
      unsubBadge();
      if (badgeTimer) clearTimeout(badgeTimer);
      clearInterval(hiddenTick);
    };
  }, [signedIn]);

  useEffect(() => {
    const inAuth = segments[0] === '(auth)';
    const onPermissions = segments[1] === 'permissions';
    if (gate === 'login' && !inAuth) router.replace('/(auth)/login');
    else if (gate === 'permissions' && !onPermissions) router.replace('/(auth)/permissions');
    else if (gate === 'app' && inAuth) router.replace('/(tabs)');
  }, [gate, segments, router]);

  // OS share sheet → "Send to…" picker. Fires once the user is through the gate, so content shared
  // while signed out survives login (the intent stays pending in the provider until reset). Declared
  // after the gate effect so the push lands on top of the (tabs) redirect. Guarded against re-push
  // while the share screen is already open (payload is snapshotted there at mount).
  const { hasShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (hasShareIntent && gate === 'app' && segments[0] !== 'share') router.push('/share');
  }, [hasShareIntent, gate, segments, router]);

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
      <Stack.Screen name="share" options={{ presentation: 'modal' }} />
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
      <Stack.Screen name="email/outlook/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="email/compose" options={{ presentation: 'modal' }} />
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
    // ShareIntentProvider must be the outermost provider (expo-share-intent requirement) — it holds
    // photos/files shared from the OS share sheet until GateController routes them to /share.
    // Disabled in Expo Go: the native module only exists in dev/EAS builds (same rule as notifications).
    <ShareIntentProvider options={{ disabled: isRunningInExpoGo() }}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ErrorBoundary>
            <OfflineBanner />
            {/* NO app-wide tap-to-dismiss-keyboard wrapper. The old TouchableWithoutFeedback here
                claimed the JS responder on every touch that started on non-interactive space; on
                the New Architecture its responder release is lost when a ScrollView takes over the
                drag, leaving a STUCK responder that permanently blocks native scroll interception
                for that screen — the "attendance page scrolls once then never again" bug (repro:
                drag empty space twice; verified fixed by removing this wrapper). If tap-to-dismiss
                is wanted back, implement it per-screen with a RNGH Tap gesture (outside the RN
                responder system) — NEVER with a Touchable wrapping the navigator. */}
            <View style={{ flex: 1 }}>
              {hydrated ? <GateController /> : <View style={{ flex: 1, backgroundColor: colors.coolBg }} />}
            </View>
            {/* App-wide toast host — must be last so it layers above every screen. Mounted here
                (not per-screen) so showToast() from any screen is actually visible. */}
            <GlobalToast />
            <StatusBar style="dark" />
          </ErrorBoundary>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}

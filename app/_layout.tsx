import '../global.css';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
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
import { loadPrefs } from '../src/services/storage';
import { colors } from '../src/theme';
import Constants from 'expo-constants';
import { setApiBaseUrl } from '../src/api';

// Point the API client at the backend (configurable via app.json → expo.extra.apiUrl;
// use your machine's LAN IP when testing on a physical device).
setApiBaseUrl((Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:4000');

// Root gate: redirects between (auth) login/permissions and (tabs) based on store state.
// "View as" is NOT consulted here — it is access-overlay store state, never a routing input.
function GateController() {
  const gate = useGate();
  const segments = useSegments() as string[];
  const router = useRouter();
  useNotificationRouting(); // route on notification tap (client-only)

  // Realtime chat socket follows the session: connect when signed in, drop when signed out.
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
  useEffect(() => { if (signedIn) connectChatSocket(); else disconnectChatSocket(); }, [signedIn]);

  useEffect(() => {
    const inAuth = segments[0] === '(auth)';
    const onPermissions = segments[1] === 'permissions';
    if (gate === 'login' && !inAuth) router.replace('/(auth)/login');
    else if (gate === 'permissions' && !onPermissions) router.replace('/(auth)/permissions');
    else if (gate === 'app' && inAuth) router.replace('/(tabs)');
  }, [gate, segments, router]);

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
      <Stack.Screen name="reminder/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="reminder/archive" />
      <Stack.Screen name="email/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="email/compose" options={{ presentation: 'modal' }} />
      <Stack.Screen name="call/[id]" options={{ presentation: 'card' }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Hydrate persisted perms/consent BEFORE the gate decides, so previously-granted
  // permissions bypass the gate ("asked once" preserved across restart).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let active = true;
    loadPrefs().then((p) => {
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
            {hydrated ? <GateController /> : <View style={{ flex: 1, backgroundColor: colors.canvas }} />}
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

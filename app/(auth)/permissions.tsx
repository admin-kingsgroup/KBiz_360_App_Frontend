import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, Navigation, Wifi, Bell, CheckCircle2, Settings, type LucideIcon } from 'lucide-react-native';
import { colors, shadowSm } from '../../src/theme';
import { PERMISSIONS } from '../../src/constants/permissions';
import type { PermKey } from '../../src/constants/permissions';
import { useAttendanceStore } from '../../src/store/attendanceStore';
import { savePerms } from '../../src/services/storage';
import { requestNotificationPermission, registerPushToken } from '../../src/services/notifications';
import { getBackgroundLocationStatus, requestForegroundLocation, openLocationSettings } from '../../src/services/locationPermission';
import { locationPermSatisfied, type BgLocationStatus } from '../../src/logic/permissionGate';

// Port of source PermissionGate with ONE deliberate deviation from source: LOCATION is a real
// OS grant, but only FOREGROUND ("While using the app") — that alone turns the row ON and opens
// the app. Background ("Allow all the time") is an OPTIONAL auto-punch enhancement nudged from
// the Attendance screen; it is never requested or required here (the Android 11+ background
// request drops the user into the system Settings page, which read as "Allow all the time is
// compulsory to open the app"). Only a full location deny keeps the row OFF, with a hint that
// routes to Settings.
//  - Notifications use the real OS prompt (as before); network has no OS prompt.
//  - If the OS won't prompt again (hard deny), we show an Open Settings path and auto-recheck when
//    the app returns to the foreground.
//  - perms persist (AsyncStorage) so the gate is "asked once" across restarts; the root layout
//    re-verifies location on every app open and downgrades if it was revoked in Settings.
// The root gate auto-redirects to (tabs) once all perms are granted.
const ICONS: Record<'navigation' | 'wifi' | 'bell', LucideIcon> = {
  navigation: Navigation, wifi: Wifi, bell: Bell,
};

export default function Permissions() {
  const perms = useAttendanceStore((s) => s.perms);
  const setPerm = useAttendanceStore((s) => s.setPerm);
  const allOn = PERMISSIONS.every((p) => perms[p.key]);
  // Set after a location grant attempt fails — drives the "Allow all the time" hint + Open Settings.
  const [locBlocked, setLocBlocked] = useState<BgLocationStatus | null>(null);

  const grant = async (key: PermKey) => {
    // Notifications and location use the real OS prompts; network has no OS prompt.
    if (key === 'notifications') {
      const ok = await requestNotificationPermission();
      setPerm('notifications', ok);
      if (ok) void registerPushToken(); // register Expo push token for message/call/reminder pushes
    } else if (key === 'location') {
      // Foreground ("While using the app") only — enough to open the app and record check-ins.
      // The background "Allow all the time" upgrade is offered later on the Attendance screen;
      // firing it here would bounce a fresh install into the system Settings page.
      const st = await requestForegroundLocation();
      const ok = locationPermSatisfied(st);
      setPerm('location', ok);
      setLocBlocked(ok ? null : st);
    } else {
      setPerm(key, true);
    }
    // Persist the FULL, up-to-date perms read fresh from the store — NOT the stale render snapshot.
    // (The old code saved `{...perms, key}`, so allowAll's loop overwrote storage with only the last
    // key, and the permissions gate kept reappearing on every restart.)
    void savePerms(useAttendanceStore.getState().perms);
  };
  const allowAll = async () => { for (const p of PERMISSIONS) { if (!perms[p.key]) await grant(p.key); } };

  // Returning from Settings (or the Android 11+ settings-style prompt): re-check and auto-grant so
  // the user isn't stuck tapping Allow again. Only upgrades; the root layout owns downgrades.
  useEffect(() => {
    const recheck = async () => {
      if (useAttendanceStore.getState().perms.location) return;
      const st = await getBackgroundLocationStatus();
      if (locationPermSatisfied(st)) {
        useAttendanceStore.getState().setPerm('location', true);
        setLocBlocked(null);
        void savePerms(useAttendanceStore.getState().perms);
      } else {
        // Refresh the hint only if it is already showing (don't nag before the first attempt).
        setLocBlocked((prev) => (prev == null ? prev : st));
      }
    };
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void recheck(); });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="items-center px-6 pt-8 pb-4">
          <View className="items-center justify-center mb-3" style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primary }}>
            <Lock size={26} color="#fff" />
          </View>
          <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 }}>Permissions required</Text>
          <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
            KBiz 360 needs all of the following enabled to run. Attendance is recorded automatically and transparently.
          </Text>
        </View>

        <View className="px-5 gap-2">
          {PERMISSIONS.map((p) => {
            const on = perms[p.key];
            const Icon = ICONS[p.iconName];
            return (
              <View key={p.key} className="flex-row items-center gap-3"
                style={[{ padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: on ? colors.primary + '55' : colors.coolDivider }, shadowSm]}>
                <View className="items-center justify-center" style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: p.color + '1A' }}>
                  <Icon size={20} color={p.color} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{p.title}</Text>
                  <Text style={{ color: colors.coolText, fontSize: 12, lineHeight: 16 }}>{p.desc}</Text>
                </View>
                {on ? (
                  <View className="flex-row items-center gap-1" style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.primarySoft }}>
                    <CheckCircle2 size={14} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 10.5, fontWeight: '800' }}>ON</Text>
                  </View>
                ) : (
                  <Pressable onPress={() => grant(p.key)} style={{ paddingHorizontal: 16, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: colors.primary }}>
                    <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>Allow</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        {locBlocked != null && (
          <View className="mx-5 mt-3" style={{ padding: 12, borderRadius: 12, backgroundColor: colors.coral + '14' }}>
            <Text style={{ color: colors.coral, fontSize: 12.5, fontWeight: '700', lineHeight: 17 }}>
              Location is off. KBiz 360 needs location (“While using the app” is enough) to record
              attendance check-ins — open Settings · Location and allow it.
            </Text>
            <Pressable onPress={openLocationSettings} className="flex-row items-center justify-center gap-1.5 mt-2.5"
              style={{ paddingVertical: 11, borderRadius: 999, backgroundColor: colors.primary }}>
              <Settings size={15} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Open Settings · Location</Text>
            </Pressable>
          </View>
        )}

        {!allOn && (
          <View className="flex-row items-start gap-2 mx-5 mt-3" style={{ padding: 12, borderRadius: 12, backgroundColor: colors.coral + '14' }}>
            <Text style={{ fontSize: 14 }}>⚠️</Text>
            <Text style={{ color: colors.coral, fontSize: 12.5, fontWeight: '600', lineHeight: 17, flex: 1 }}>
              All permissions must be ON to open the app. Please allow each one above to continue.
            </Text>
          </View>
        )}

        <View className="px-5 mt-4">
          <Pressable onPress={() => { if (!allOn) allowAll(); }} // when allOn, the gate auto-redirects to (tabs)
            style={{ height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: allOn ? colors.primary : colors.orange }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{allOn ? 'Enter KBiz 360' : 'Allow all permissions'}</Text>
          </Pressable>
          <Text style={{ color: colors.coolText3, fontSize: 11, textAlign: 'center', marginTop: 10, lineHeight: 15 }}>
            You can review these anytime in Profile · Privacy & Security. Attendance tracking is disclosed to all staff.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, Navigation, Wifi, Bell, CheckCircle2, type LucideIcon } from 'lucide-react-native';
import { colors, shadowSm } from '../../src/theme';
import { PERMISSIONS } from '../../src/constants/permissions';
import type { PermKey } from '../../src/constants/permissions';
import { useAttendanceStore } from '../../src/store/attendanceStore';
import { savePerms } from '../../src/services/storage';
import { requestNotificationPermission, registerPushToken } from '../../src/services/notifications';

// Faithful port of source PermissionGate. Behavior preserved exactly:
//  - request(key): fires the real OS prompt in the BACKGROUND (deferred to attendance/notification
//    phases) but ALWAYS grants immediately, so the gate never traps the user.
//  - No skip/deny path exists in source — all three must be ON to enter.
//  - perms persist (AsyncStorage) so the gate is "asked once" across restarts.
// The root gate auto-redirects to (tabs) once all perms are granted.
const ICONS: Record<'navigation' | 'wifi' | 'bell', LucideIcon> = {
  navigation: Navigation, wifi: Wifi, bell: Bell,
};

export default function Permissions() {
  const perms = useAttendanceStore((s) => s.perms);
  const setPerm = useAttendanceStore((s) => s.setPerm);
  const allOn = PERMISSIONS.every((p) => perms[p.key]);

  const grant = async (key: PermKey) => {
    // Notifications use the real OS prompt (Phase 10). Location's OS prompt is handled by the
    // geofence hook on the Attendance screen; network has no OS prompt.
    if (key === 'notifications') {
      const ok = await requestNotificationPermission();
      setPerm('notifications', ok);
      savePerms({ ...perms, notifications: ok });
      if (ok) void registerPushToken(); // register Expo push token for incoming-call pushes
      return;
    }
    setPerm(key, true);
    savePerms({ ...perms, [key]: true });
  };
  const allowAll = async () => { for (const p of PERMISSIONS) { if (!perms[p.key]) await grant(p.key); } };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="items-center px-6 pt-8 pb-4">
          <View className="items-center justify-center mb-3" style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.ink }}>
            <Lock size={24} color="#fff" />
          </View>
          <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 21, fontWeight: '600', letterSpacing: -0.5 }}>Permissions required</Text>
          <Text style={{ color: colors.warmMute, fontSize: 12.5, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
            KBiz 360 needs all of the following enabled to run. Attendance is recorded automatically and transparently.
          </Text>
        </View>

        <View className="px-5 gap-2">
          {PERMISSIONS.map((p) => {
            const on = perms[p.key];
            const Icon = ICONS[p.iconName];
            return (
              <View key={p.key} className="flex-row items-center gap-3"
                style={[{ padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: on ? colors.success + '55' : colors.cardEdge }, shadowSm]}>
                <View className="items-center justify-center" style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: p.color + '1A' }}>
                  <Icon size={18} color={p.color} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '800' }}>{p.title}</Text>
                  <Text style={{ color: colors.warmMute, fontSize: 10.5, lineHeight: 14 }}>{p.desc}</Text>
                </View>
                {on ? (
                  <View className="flex-row items-center gap-1" style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.success + '1A' }}>
                    <CheckCircle2 size={13} color={colors.success} />
                    <Text style={{ color: colors.success, fontSize: 10, fontWeight: '800' }}>ON</Text>
                  </View>
                ) : (
                  <Pressable onPress={() => grant(p.key)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.ink }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Allow</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        {!allOn && (
          <View className="flex-row items-start gap-2 mx-5 mt-3" style={{ padding: 12, borderRadius: 12, backgroundColor: colors.coral + '14' }}>
            <Text style={{ fontSize: 14 }}>⚠️</Text>
            <Text style={{ color: colors.coral, fontSize: 11.5, fontWeight: '600', lineHeight: 16, flex: 1 }}>
              All permissions must be ON to open the app. Please allow each one above to continue.
            </Text>
          </View>
        )}

        <View className="px-5 mt-4">
          <Pressable onPress={() => { if (!allOn) allowAll(); }} // when allOn, the gate auto-redirects to (tabs)
            style={{ paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: allOn ? colors.ink : colors.orange }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{allOn ? 'Enter KBiz 360' : 'Allow all permissions'}</Text>
          </Pressable>
          <Text style={{ color: colors.textMuted2, fontSize: 10, textAlign: 'center', marginTop: 10, lineHeight: 14 }}>
            You can review these anytime in Profile · Privacy & Security. Attendance tracking is disclosed to all staff.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Shield, Check, ChevronLeft } from 'lucide-react-native';
import { ROLE_ICONS } from '../../src/components/ui/roleIcons';
import { colors } from '../../src/theme';
import { ROLE_DEFS, ROLE_OPTIONS } from '../../src/constants/roles';
import { useUiStore } from '../../src/store/uiStore';

// Roles catalog — faithful port of source RolesTab. Read-only (source only toasts on tap).
// userCounts are hardcoded in source; preserved verbatim.
const USER_COUNTS: Record<string, number> = { SUPER_ADMIN: 1, DIRECTOR: 1, GENERAL_MANAGER: 1, BRANCH_MANAGER: 0, HOD: 2, EMPLOYEE: 45 };

export default function Roles() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View>
          <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600' }}>Roles & Permissions</Text>
          <Text style={{ color: colors.warmMute, fontSize: 10.5 }}>6-tier access hierarchy</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
        <View className="flex-row items-center gap-1.5 mb-2">
          <Shield size={11} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 }}>ROLES · ACCESS SCOPE</Text>
        </View>

        <View style={{ backgroundColor: '#FEF7E6', borderColor: '#F5E5BA', borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 12 }}>
          <Text style={{ color: colors.ink, fontSize: 11, lineHeight: 16 }}>
            Each role defines <Text style={{ fontWeight: '800' }}>scope of access</Text>, not job title. Higher = more access. Reminders are auto-visible up this chain.
          </Text>
        </View>

        <View className="gap-2">
          {ROLE_OPTIONS.map((rk, idx) => {
            const r = ROLE_DEFS[rk];
            const Icon = ROLE_ICONS[rk];
            const count = USER_COUNTS[rk];
            return (
              <Pressable key={rk} onPress={() => showToast(`Editing ${r.label} permissions`)}
                style={{ backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }}>
                <View className="flex-row items-center gap-2.5 px-3.5 py-2.5" style={{ backgroundColor: '#FAFAF7' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: r.color }}>
                    <Icon size={16} color="#fff" />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '800' }}>{r.label}</Text>
                      <Text style={{ backgroundColor: '#F4F2EC', color: colors.textMuted, fontSize: 9, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>TIER {idx + 1}</Text>
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>{r.scope}</Text>
                  </View>
                  <View className="items-end">
                    <Text style={{ fontFamily: 'Fraunces', color: r.color, fontSize: 15, fontWeight: '800' }}>{count}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 8.5, fontWeight: '700' }}>{count === 1 ? 'USER' : 'USERS'}</Text>
                  </View>
                </View>
                <View className="px-3.5 py-2.5">
                  {r.perms.map((p) => (
                    <View key={p} className="flex-row items-start gap-2 py-0.5">
                      <Check size={11} color={colors.success} style={{ marginTop: 3 }} />
                      <Text style={{ color: colors.ink, fontSize: 11, lineHeight: 16, flex: 1 }}>{p}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

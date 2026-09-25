import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Eye, Check } from 'lucide-react-native';
import { Avatar } from '../src/components/ui';
import { colors } from '../src/theme';
import { ROLE_DEFS } from '../src/constants/roles';
import { useAccessStore } from '../src/store/accessStore';
import { useUiStore } from '../src/store/uiStore';

// "View as" picker — preview the app as any user. View-As is STORE state (accessStore),
// never route state, so access-driven UI (pills, and Phase-6 segments) re-derives automatically.
export default function ViewAs() {
  const router = useRouter();
  const users = useAccessStore((s) => s.users);
  const viewAsUser = useAccessStore((s) => s.viewAsUser);
  const realUser = useAccessStore((s) => s.user);
  const setBiz = useUiStore((s) => s.setBiz);
  const showToast = useUiStore((s) => s.showToast);

  const pick = (id: string | null) => {
    const u = id ? users.find((x) => x.id === id) ?? null : null;
    useAccessStore.getState().setViewAs(u);
    setBiz(u ? (u.bizId || 'all') : 'all');
    showToast(u ? `Viewing as ${u.name}` : 'Back to your view');
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center justify-between px-5 pt-3 pb-3">
        <Text style={{ color: colors.ink, fontSize: 19, fontWeight: '700' }}>View as…</Text>
        <Pressable onPress={() => router.back()} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={16} color={colors.coolText} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}>
        <Pressable onPress={() => pick(null)} className="flex-row items-center gap-3 p-3"
          style={{ borderRadius: 14, borderWidth: 1, borderColor: !viewAsUser ? colors.primary : colors.coolDivider, backgroundColor: !viewAsUser ? colors.primarySoft : colors.card }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}><Eye size={18} color="#fff" /></View>
          <View className="flex-1">
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>Your view{realUser ? ` · ${realUser.name}` : ''}</Text>
            <Text style={{ color: colors.coolText, fontSize: 12 }}>Exit preview — see everything you can access</Text>
          </View>
          {!viewAsUser ? <Check size={18} color={colors.primary} /> : null}
        </Pressable>

        {users.map((u) => {
          const on = viewAsUser?.id === u.id;
          const rd = ROLE_DEFS[u.role];
          return (
            <Pressable key={u.id} onPress={() => pick(u.id)} className="flex-row items-center gap-3 p-3"
              style={{ borderRadius: 14, borderWidth: 1, borderColor: on ? colors.primary : colors.coolDivider, backgroundColor: on ? colors.primarySoft : colors.card }}>
              <Avatar initials={u.initials} color={u.color} size={40} />
              <View className="flex-1">
                <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{u.name}</Text>
                <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{u.scopeLine || rd.label}</Text>
              </View>
              <View style={{ backgroundColor: rd.color, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{rd.badge}</Text>
              </View>
              {on ? <Check size={17} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

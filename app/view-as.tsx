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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <View className="flex-row items-center justify-between px-5 pt-3 pb-3">
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>View as…</Text>
        <Pressable onPress={() => router.back()} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F2EC' }}><X size={14} color={colors.textMuted} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 6 }}>
        <Pressable onPress={() => pick(null)} className="flex-row items-center gap-3 p-3"
          style={{ borderRadius: 14, borderWidth: 1, borderColor: !viewAsUser ? colors.ink : colors.cardEdge, backgroundColor: colors.card }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink }}><Eye size={16} color="#fff" /></View>
          <View className="flex-1">
            <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '800' }}>Your view{realUser ? ` · ${realUser.name}` : ''}</Text>
            <Text style={{ color: colors.warmMute, fontSize: 10.5 }}>Exit preview — see everything you can access</Text>
          </View>
          {!viewAsUser ? <Check size={16} color={colors.success} /> : null}
        </Pressable>

        {users.map((u) => {
          const on = viewAsUser?.id === u.id;
          const rd = ROLE_DEFS[u.role];
          return (
            <Pressable key={u.id} onPress={() => pick(u.id)} className="flex-row items-center gap-3 p-3"
              style={{ borderRadius: 14, borderWidth: 1, borderColor: on ? colors.purple : colors.cardEdge, backgroundColor: colors.card }}>
              <Avatar initials={u.initials} color={u.color} size={36} />
              <View className="flex-1">
                <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '800' }}>{u.name}</Text>
                <Text numberOfLines={1} style={{ color: colors.warmMute, fontSize: 10.5 }}>{u.scopeLine || rd.label}</Text>
              </View>
              <View style={{ backgroundColor: rd.color, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                <Text style={{ color: '#fff', fontSize: 8.5, fontWeight: '800' }}>{rd.badge}</Text>
              </View>
              {on ? <Check size={15} color={colors.purple} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

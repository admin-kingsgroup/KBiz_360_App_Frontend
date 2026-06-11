import type { ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, MoreVertical, ChevronRight, MapPin } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { businesses, branches, businessDepts } from '../../src/data/businesses';
import { DEPT_DESCRIPTIONS } from '../../src/constants/departments';
import { useUiStore } from '../../src/store/uiStore';

// Department detail — faithful port of source DepartmentDetailScreen. Resolves the dept from
// the route (biz + name), lists its per-branch groups, each opening the group chat.
export default function DepartmentDetail() {
  const router = useRouter();
  const { biz: bizId, name } = useLocalSearchParams<{ id: string; biz: string; name: string }>();
  const biz = businesses.find((b) => b.id === bizId);
  const dept = (businessDepts[bizId ?? ''] || []).find((d) => d.name === name);
  const showToast = useUiStore((s) => s.showToast);

  if (!biz || !dept) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <Hdr title="Department" onBack={() => router.back()} />
        <View className="items-center" style={{ paddingVertical: 64 }}><Text style={{ color: colors.textMuted }}>Department not found</Text></View>
      </SafeAreaView>
    );
  }
  const code = biz.code;
  const bizBranches = bizId === 'tk' ? branches : [];
  const desc = DEPT_DESCRIPTIONS[dept.name] || 'Department group';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
      <Hdr title={dept.name} subtitle={`${biz.name} · ${desc}`} onBack={() => router.back()}
        right={<Pressable onPress={() => showToast(`${dept.name} settings`)} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><MoreVertical size={18} color={colors.ink} /></Pressable>} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ margin: 14, padding: 16, borderRadius: 16, backgroundColor: dept.color + '18' }} className="flex-row items-center gap-3">
          <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: dept.color, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{dept.icon}</Text></View>
          <View className="flex-1">
            <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.4 }}>{dept.name}</Text>
            <Text style={{ color: colors.ink, opacity: 0.7, fontSize: 11.5, marginTop: 2 }}>{desc}</Text>
            <Text style={{ color: dept.color, fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginTop: 6 }}>{bizBranches.length} GROUP{bizBranches.length === 1 ? '' : 'S'} · {biz.name.toUpperCase()}</Text>
          </View>
        </View>

        <Text style={{ color: colors.textMuted2, fontSize: 10, fontWeight: '800', letterSpacing: 1.3, paddingHorizontal: 16, paddingBottom: 8 }}>GROUPS IN THIS DEPARTMENT</Text>

        {bizBranches.length === 0 ? (
          <View className="items-center px-6" style={{ paddingVertical: 48 }}>
            <MapPin size={28} color={colors.textMuted2} />
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 10 }}>No branches yet</Text>
          </View>
        ) : bizBranches.map((b) => {
          const groupName = `${code} ${b.code} ${dept.name}`;
          return (
            <Pressable key={b.id} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: groupName } })} className="flex-row items-center gap-3" style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: b.color, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>{code} {b.code}</Text></View>
              <View className="flex-1">
                <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13, fontWeight: '800' }}>{groupName}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '600' }}>{b.city} · {b.memberCount} members</Text>
              </View>
              <ChevronRight size={14} color={colors.textMuted2} />
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function Hdr({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View className="flex-row items-center gap-2 px-2 py-2" style={{ backgroundColor: '#fff', borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
      <Pressable onPress={onBack} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
      <View className="flex-1"><Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: '800' }}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5 }}>{subtitle}</Text> : null}</View>
      {right}
    </View>
  );
}

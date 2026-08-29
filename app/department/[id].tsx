import type { ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, MoreVertical, ChevronRight, MessageCircle } from 'lucide-react-native';
import { colors, shadow } from '../../src/theme';
import { oneLine } from '../../src/logic/text';
import { businesses as mockBusinesses } from '../../src/data/businesses';
import { DEPT_DESCRIPTIONS } from '../../src/constants/departments';
import { useAccessStore } from '../../src/store/accessStore';
import { useDirectoryStore } from '../../src/store/directoryStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useRefreshOnFocus } from '../../src/hooks/useRefreshOnFocus';

// Department detail — Branch → Department → many GROUPS. For this department, shows each branch's groups
// (a department can hold several) and a "+ New group" per branch. Branches are access-scoped by the
// directory (a regular user sees only their own).
export default function DepartmentDetail() {
  const router = useRouter();
  const { biz: bizId, name } = useLocalSearchParams<{ id: string; biz: string; name: string }>();
  const isSuper = !!useAccessStore((s) => s.access())?.isSuper;
  const dir = useDirectoryStore();
  const conversations = useMessagingStore((s) => s.conversations);

  // Reload on every focus (not just mount): a group created/renamed/deleted, or a department edited
  // from the "⋮" admin screen on top of this one, shows the moment the user comes back.
  useRefreshOnFocus(() => {
    void useDirectoryStore.getState().load();
    void useMessagingStore.getState().loadConversations();
  });

  const usingReal = dir.businesses.length > 0;
  const biz = (usingReal ? dir.businesses : mockBusinesses).find((b) => b.id === bizId);
  const deptName = name ?? 'Department';
  const desc = DEPT_DESCRIPTIONS[deptName] || 'Department';

  // One section per branch (in this company) that has this department, with that branch's groups.
  const sections = dir.branches
    .filter((br) => (br.companyId ?? 'tk') === bizId)
    .map((br) => {
      const g = br.groups.find((x) => x.name === deptName);
      if (!g) return null;
      const groups = conversations
        .filter((c) => {
          if (c.type !== 'group') return false;
          // Prefer explicit fields; fall back to the deptKey ("<branchId>:<departmentId>") so legacy
          // department groups (created before departmentId existed) still appear.
          const cBranch = c.branchId ?? c.deptKey?.split(':')[0];
          const cDept = c.departmentId ?? c.deptKey?.split(':')[1];
          return cBranch === br.id && cDept === g.id;
        })
        .map((c) => ({
          id: c.id, name: c.name, unread: c.unread ?? 0,
          preview: c.lastMessage ? (c.lastMessage.type === 'text' ? oneLine(c.lastMessage.text) : `[${c.lastMessage.type}]`) : null,
        }));
      return {
        branchId: br.id, deptId: g.id,
        branchLabel: br.city || br.code || 'Branch',
        color: g.color || colors.blue, icon: g.icon || (deptName.trim()[0] ?? '•').toUpperCase(),
        groups,
      };
    })
    .filter(Boolean) as { branchId: string; deptId: string; branchLabel: string; color: string; icon: string; groups: { id: string; name: string; unread: number; preview: string | null }[] }[];

  const openChat = (id: string) => router.push({ pathname: '/chat/[id]', params: { id } });

  const totalGroups = sections.reduce((n, s) => n + s.groups.length, 0);
  const deptColor = sections[0]?.color ?? colors.blue;
  const deptIcon = sections[0]?.icon ?? (deptName.trim()[0] ?? '•').toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top', 'bottom']}>
      <Hdr title={deptName} subtitle={biz ? `${biz.name} · ${desc}` : desc} onBack={() => router.back()}
        right={isSuper ? <Pressable onPress={() => router.push('/admin/departments')} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><MoreVertical size={20} color={colors.ink} /></Pressable> : undefined} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ margin: 14, padding: 16, borderRadius: 16, backgroundColor: deptColor + '18' }} className="flex-row items-center gap-3">
          <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: deptColor, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{deptIcon}</Text></View>
          <View className="flex-1">
            <Text style={{ color: colors.ink, fontSize: 19, fontWeight: '700', letterSpacing: -0.4 }}>{deptName}</Text>
            <Text style={{ color: colors.ink, opacity: 0.7, fontSize: 12.5, marginTop: 2 }}>{desc}</Text>
            <Text style={{ color: deptColor, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7, marginTop: 6 }}>
              {totalGroups} GROUP{totalGroups === 1 ? '' : 'S'} · {sections.length} BRANCH{sections.length === 1 ? '' : 'ES'}
            </Text>
          </View>
        </View>

        {sections.length === 0 ? (
          <View className="items-center px-6" style={{ paddingVertical: 48 }}>
            <MessageCircle size={30} color={colors.coolText3} />
            <Text style={{ color: colors.coolText, fontSize: 14, fontWeight: '700', marginTop: 10 }}>No branches in your access</Text>
            <Text style={{ color: colors.coolText3, fontSize: 12.5, marginTop: 4, textAlign: 'center' }}>This department has no branches you can see.</Text>
          </View>
        ) : totalGroups === 0 ? (
          // All branches are group-less — one clean empty state instead of a column of bare branch headers.
          <View className="items-center px-6" style={{ paddingVertical: 48 }}>
            <MessageCircle size={30} color={colors.coolText3} />
            <Text style={{ color: colors.coolText, fontSize: 14, fontWeight: '700', marginTop: 10 }}>No groups yet</Text>
            <Text style={{ color: colors.coolText3, fontSize: 12.5, marginTop: 4, textAlign: 'center' }}>This department has no group chats yet. Create one from the “+” button on Home.</Text>
          </View>
        ) : sections.filter((s) => s.groups.length > 0).map((s) => (
          <View key={s.branchId} style={{ marginBottom: 6 }}>
            <Text style={{ color: colors.coolText3, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>{s.branchLabel.toUpperCase()}</Text>
            <View style={{ paddingHorizontal: 14, gap: 8 }}>
              {s.groups.map((grp) => (
                <Pressable key={grp.id} onPress={() => openChat(grp.id)} className="flex-row items-center gap-3 p-3"
                  style={[{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 16 }, shadow]}>
                  <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: s.color, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{s.icon}</Text>
                  </View>
                  <View className="flex-1">
                    <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{grp.name}</Text>
                    <Text numberOfLines={1} style={{ color: grp.preview ? colors.coolText : colors.coolText3, fontSize: 12.5, fontStyle: grp.preview ? 'normal' : 'italic', marginTop: 1 }}>{grp.preview || 'No messages yet'}</Text>
                  </View>
                  {grp.unread > 0 ? (
                    <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>{grp.unread}</Text>
                    </View>
                  ) : <ChevronRight size={18} color={colors.coolText3} />}
                </Pressable>
              ))}
              {/* Group creation lives in the "+" create hub on Home (Super-Admin) — no inline button here. */}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Hdr({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
      <Pressable onPress={onBack} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
      <View className="flex-1"><Text numberOfLines={1} style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{subtitle}</Text> : null}</View>
      {right}
    </View>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Check, Search } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import { createGroup } from '../../src/api/chat';
import { listUsers, toUser, listCompanies, listBranches, listDepartments, type DirectoryCompany, type DirectoryBranch, type DirectoryDepartment } from '../../src/api/directory';

// Company-wide leadership is not tied to any branch but can join any group.
const COMPANY_WIDE = new Set(['SUPER_ADMIN', 'DIRECTOR']);

export default function NewGroup() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const meId = useMessagingStore((s) => s.myUserId) ?? '';
  const users = useAccessStore((s) => s.users);
  // Group creation is Super-Admin only. The entry points are hidden for everyone else, but the
  // route is still reachable (deep link, stale UI) — bounce non-supers back.
  const isSuper = !!useAccessStore((s) => s.access())?.isSuper;
  useEffect(() => {
    if (!isSuper) {
      showToast('Only Super Admin can create groups');
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuper]);
  // Optional prefill when opened from a department ("+ New group in this department").
  const prefill = useLocalSearchParams<{ companyId?: string; branchId?: string; departmentId?: string; deptName?: string }>();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [companies, setCompanies] = useState<DirectoryCompany[]>([]);
  const [branches, setBranches] = useState<DirectoryBranch[]>([]);
  const [allDepts, setAllDepts] = useState<DirectoryDepartment[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(prefill.companyId ?? null);
  const [branchId, setBranchId] = useState<string | null>(prefill.branchId ?? null);
  const [departmentId, setDepartmentId] = useState<string | null>(prefill.departmentId ?? null);

  // Departments offered for the selected branch: those tied to this branch, plus the company's
  // branch-less (company-level) departments — deduped by name. A group must belong to a department.
  const departments = useMemo(() => {
    if (!branchId) return [];
    const seen = new Set<string>();
    return allDepts.filter((d) => {
      const match = d.branchId === branchId || (!d.branchId && !!companyId && d.companyId === companyId);
      if (!match) return false;
      const key = (d.name || d.id).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allDepts, branchId, companyId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      users.length === 0 ? listUsers().then((l) => useAccessStore.getState().setUsers(l.map(toUser))) : Promise.resolve(),
      listCompanies().then(setCompanies).catch(() => undefined),
      listBranches().then(setBranches).catch(() => undefined),
      listDepartments().then(setAllDepts).catch(() => undefined),
    ]).catch(() => undefined).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-select the only company so single-company tenants skip a step.
  useEffect(() => { if (!companyId && companies.length === 1) setCompanyId(companies[0]!.id); }, [companies, companyId]);

  // Branches are only offered once a business is picked — a group always lives under
  // business → branch → department, so the branch list is strictly that business's branches.
  const branchesForCompany = useMemo(
    () => (companyId ? branches.filter((b) => b.companyId === companyId) : []),
    [branches, companyId],
  );
  const branchLabel = (b: DirectoryBranch): string => b.code || b.name || b.city || 'Branch';

  // Members offered = the selected branch's people, plus company leadership. Pick a branch first.
  const candidates = useMemo(() => {
    if (!branchId) return [];
    const q = query.trim().toLowerCase();
    return users.filter((u) =>
      u.id !== meId &&
      (COMPANY_WIDE.has(u.role) || (u.branches ?? []).includes(branchId)) &&
      u.name.toLowerCase().includes(q),
    );
  }, [users, meId, branchId, query]);

  const toggle = (id: string): void => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickBranch = (id: string): void => { setBranchId(id); setDepartmentId(null); setSelected(new Set()); setQuery(''); };
  const pickCompany = (id: string): void => { setCompanyId(id); setBranchId(null); setDepartmentId(null); setSelected(new Set()); setQuery(''); };
  const deptLabel = (d: DirectoryDepartment): string => d.name || d.code || 'Department';

  const create = async (): Promise<void> => {
    if (!name.trim()) { showToast('Group name required'); return; }
    if (!companyId) { showToast('Select a business'); return; }
    if (!branchId) { showToast('Select a branch'); return; }
    if (!departmentId) { showToast('Select a department'); return; }
    if (selected.size === 0) { showToast('Select at least one member'); return; }
    setCreating(true);
    try {
      const conv = await createGroup({ name: name.trim(), memberIds: [...selected], companyId, branchId, departmentId });
      await useMessagingStore.getState().loadConversations();
      router.replace({ pathname: '/chat/[id]', params: { id: conv.id } });
    } catch {
      showToast('Could not create group');
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ backgroundColor: '#fff', borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600', flex: 1 }}>New group</Text>
        <Pressable onPress={create} disabled={creating} style={{ backgroundColor: colors.ink, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, opacity: creating ? 0.6 : 1 }}>
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>{creating ? 'Creating…' : 'Create'}</Text>
        </Pressable>
      </View>

      <View className="px-4 pt-3 pb-1">
        <TextInput value={name} onChangeText={setName} placeholder="Group name" placeholderTextColor={colors.textMuted}
          style={{ borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.ink, backgroundColor: '#fff', fontWeight: '700' }} />

        {/* Business (the group lives under business → branch → department) */}
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 6 }}>BUSINESS</Text>
        {companies.length === 0 ? (
          <Text style={{ color: colors.textMuted2, fontSize: 12 }}>No businesses available</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            {companies.map((c) => (
              <Chip key={c.id} label={c.name} active={companyId === c.id} onPress={() => pickCompany(c.id)} />
            ))}
          </ScrollView>
        )}

        {/* Branch (only the selected business's branches) */}
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 6 }}>BRANCH</Text>
        {branchesForCompany.length === 0 ? (
          <Text style={{ color: colors.textMuted2, fontSize: 12 }}>{companyId ? 'No branches for this business' : 'Select a business first'}</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            {branchesForCompany.map((b) => (
              <Chip key={b.id} label={branchLabel(b)} active={branchId === b.id} onPress={() => pickBranch(b.id)} />
            ))}
          </ScrollView>
        )}

        {/* Department (a group lives under a branch's department) */}
        {branchId ? (
          <>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 6 }}>DEPARTMENT</Text>
            {departments.length === 0 ? (
              <Text style={{ color: colors.textMuted2, fontSize: 12 }}>No departments for this branch. Create one in Departments → Manage.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                {departments.map((d) => (
                  <Chip key={d.id} label={deptLabel(d)} active={departmentId === d.id} onPress={() => setDepartmentId(d.id)} />
                ))}
              </ScrollView>
            )}
          </>
        ) : null}

        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 6 }}>
          ADD MEMBERS {selected.size > 0 ? `· ${selected.size} selected` : ''}
        </Text>
        <View className="flex-row items-center gap-2" style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.cardEdge, paddingHorizontal: 12 }}>
          <Search size={14} color={colors.textMuted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search people" placeholderTextColor={colors.textMuted} style={{ flex: 1, paddingVertical: 9, fontSize: 13.5, color: colors.ink }} />
        </View>
      </View>

      {loading ? (
        <View className="items-center" style={{ paddingVertical: 40 }}><ActivityIndicator color={colors.ink} /></View>
      ) : !branchId ? (
        <View className="items-center px-8" style={{ paddingVertical: 40 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>Select a branch to choose members</Text>
          <Text style={{ color: colors.textMuted2, fontSize: 11.5, marginTop: 4, textAlign: 'center' }}>You can add anyone from that branch, plus company Directors.</Text>
        </View>
      ) : (
        <FlatList
          data={candidates}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: 12, gap: 4 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={<Text style={{ color: colors.textMuted, fontSize: 12, padding: 16, textAlign: 'center' }}>No one to add from this branch</Text>}
          renderItem={({ item: u }) => {
            const on = selected.has(u.id);
            return (
              <Pressable onPress={() => toggle(u.id)} className="flex-row items-center gap-3 px-2 py-2.5" style={{ borderRadius: 12, backgroundColor: on ? colors.ink + '0D' : 'transparent' }}>
                <Avatar initials={(u.name[0] ?? '?').toUpperCase()} color={colors.blue} size={36} uri={u.avatar} />
                <View className="flex-1">
                  <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13.5, fontWeight: '600' }}>{u.name}</Text>
                  {u.role ? <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{u.role}</Text> : null}
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? colors.ink : colors.cardEdge, backgroundColor: on ? colors.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Check size={13} color="#fff" /> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
      backgroundColor: active ? colors.ink : '#fff',
      borderWidth: 1, borderColor: active ? colors.ink : colors.cardEdge,
    }}>
      <Text style={{ color: active ? '#fff' : colors.ink, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

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
import { canCreateGroups } from '../../src/logic/groupCreate';
import { listCompanies, listBranches, type DirectoryCompany, type DirectoryBranch } from '../../src/api/directory';
import { refreshDirectoryUsers } from '../../src/store/directoryStore';

// Company-wide leadership is not tied to any branch but can join any group.
const COMPANY_WIDE = new Set(['SUPER_ADMIN', 'DIRECTOR']);

export default function NewGroup() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const meId = useMessagingStore((s) => s.myUserId) ?? '';
  const users = useAccessStore((s) => s.users);
  // Group creation is Super-Admin plus a delegated allow-list. The entry points are hidden for
  // everyone else, but the route is still reachable (deep link, stale UI) — bounce anyone who can't.
  const canCreate = canCreateGroups(useAccessStore((s) => s.effUser()), useAccessStore((s) => s.access()));
  useEffect(() => {
    if (!canCreate) {
      showToast('You don’t have permission to create groups');
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate]);
  // Optional prefill when opened with a business/branch already picked.
  const prefill = useLocalSearchParams<{ companyId?: string; branchId?: string }>();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Members only need the directory USERS (+ the picked branch), so track their load on its own —
  // don't make the member list wait on the slower companies/branches fetches.
  const [usersLoading, setUsersLoading] = useState(users.length === 0);
  const [creating, setCreating] = useState(false);

  const [companies, setCompanies] = useState<DirectoryCompany[]>([]);
  const [branches, setBranches] = useState<DirectoryBranch[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(prefill.companyId ?? null);
  const [branchId, setBranchId] = useState<string | null>(prefill.branchId ?? null);

  useEffect(() => {
    // Load USERS independently and gate only the member list on them (see usersLoading below), so
    // members appear the moment the directory users arrive — the member area no longer waits on the
    // companies/branches fetches. Those populate their own chips as each resolves.
    // Always re-pull (throttled): a user invited a moment ago must be pickable here right away.
    if (users.length === 0) setUsersLoading(true);
    void refreshDirectoryUsers().finally(() => setUsersLoading(false));
    listCompanies().then(setCompanies).catch(() => undefined);
    listBranches().then(setBranches).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-select the only company so single-company tenants skip a step.
  useEffect(() => { if (!companyId && companies.length === 1) setCompanyId(companies[0]!.id); }, [companies, companyId]);

  // Branches are only offered once a business is picked — a group always lives under
  // business → branch, so the branch list is strictly that business's branches.
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
  const pickBranch = (id: string): void => { setBranchId(id); setSelected(new Set()); setQuery(''); };
  const pickCompany = (id: string): void => { setCompanyId(id); setBranchId(null); setSelected(new Set()); setQuery(''); };

  const create = async (): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log('[new-group] create tapped', { name: name.trim(), companyId, branchId, members: selected.size });
    if (!name.trim()) { showToast('Group name required'); return; }
    if (!companyId) { showToast('Select a business'); return; }
    if (!branchId) { showToast('Select a branch'); return; }
    if (selected.size === 0) { showToast('Select at least one member'); return; }
    setCreating(true);
    try {
      const conv = await createGroup({ name: name.trim(), memberIds: [...selected], companyId, branchId });
      await useMessagingStore.getState().loadConversations();
      router.replace({ pathname: '/chat/[id]', params: { id: conv.id } });
    } catch (e) {
      // Surface the server's actual reason — a generic toast hides real failures.
      // eslint-disable-next-line no-console
      console.log('[new-group] create failed:', e);
      showToast(e instanceof Error && e.message ? e.message : 'Could not create group');
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-2" style={{ backgroundColor: colors.card, minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700', flex: 1 }}>New group</Text>
        <Pressable onPress={create} disabled={creating} style={{ backgroundColor: colors.primary, height: 38, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center', opacity: creating ? 0.6 : 1 }}>
          <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '700' }}>{creating ? 'Creating…' : 'Create'}</Text>
        </Pressable>
      </View>

      <View className="px-4 pt-3 pb-1">
        <TextInput value={name} onChangeText={setName} placeholder="Group name" placeholderTextColor={colors.coolText3}
          style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15.5, color: colors.ink, fontWeight: '500' }} />

        {/* Business (the group lives under business → branch) */}
        <Text style={labelStyle}>BUSINESS</Text>
        {companies.length === 0 ? (
          <Text style={{ color: colors.coolText3, fontSize: 13 }}>No businesses available</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            {companies.map((c) => (
              <Chip key={c.id} label={c.name} active={companyId === c.id} onPress={() => pickCompany(c.id)} />
            ))}
          </ScrollView>
        )}

        {/* Branch (only the selected business's branches) */}
        <Text style={labelStyle}>BRANCH</Text>
        {branchesForCompany.length === 0 ? (
          <Text style={{ color: colors.coolText3, fontSize: 13 }}>{companyId ? 'No branches for this business' : 'Select a business first'}</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            {branchesForCompany.map((b) => (
              <Chip key={b.id} label={branchLabel(b)} active={branchId === b.id} onPress={() => pickBranch(b.id)} />
            ))}
          </ScrollView>
        )}

        <Text style={labelStyle}>
          ADD MEMBERS {selected.size > 0 ? `· ${selected.size} selected` : ''}
        </Text>
        <View className="flex-row items-center gap-2" style={{ backgroundColor: colors.coolMuted, borderRadius: 999, paddingHorizontal: 14 }}>
          <Search size={17} color={colors.coolText3} strokeWidth={2.2} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search people" placeholderTextColor={colors.coolText3} style={{ flex: 1, paddingVertical: 11, fontSize: 15, color: colors.ink }} />
        </View>
      </View>

      {!branchId ? (
        <View className="items-center px-8" style={{ paddingVertical: 40 }}>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>Select a branch to choose members</Text>
          <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 5, textAlign: 'center' }}>You can add anyone from that branch, plus company Directors.</Text>
        </View>
      ) : usersLoading ? (
        <View className="items-center" style={{ paddingVertical: 40 }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={candidates}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: 12, gap: 4 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={<Text style={{ color: colors.coolText, fontSize: 13, padding: 16, textAlign: 'center' }}>No one to add from this branch</Text>}
          renderItem={({ item: u }) => {
            const on = selected.has(u.id);
            return (
              <Pressable onPress={() => toggle(u.id)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 px-2 py-2.5" style={{ borderRadius: 12, backgroundColor: on ? colors.primarySoft : 'transparent' }}>
                <Avatar initials={(u.name[0] ?? '?').toUpperCase()} color={colors.blue} size={44} uri={u.avatar} />
                <View className="flex-1">
                  <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{u.name}</Text>
                  {u.role ? <Text style={{ color: colors.coolText, fontSize: 12 }}>{u.role}</Text> : null}
                </View>
                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? colors.primary : colors.coolDivider, backgroundColor: on ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Check size={14} color="#fff" /> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const labelStyle = { color: colors.coolText, fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5, marginTop: 14, marginBottom: 6 };

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{
      height: 34, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
      backgroundColor: active ? colors.primary : colors.coolMuted,
    }}>
      <Text style={{ color: active ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Switch, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Search, Building2 } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import { getKbizMembership, setKbizMembership, humanizeRole, toUser, type KbizMembership } from '../../src/api/directory';
import { useRefreshOnFocus } from '../../src/hooks/useRefreshOnFocus';

// Super-admin: who belongs to the KBiz360 business (its single BOM branch). Every tenant user is
// listed with a toggle — ON adds the BOM branch to their branch_ids, OFF removes it. The backend
// creates the BOM branch under KBiz360 on first load if it doesn't exist yet.
export default function KbizMembers() {
  const router = useRouter();
  const isSuper = !!useAccessStore((s) => s.access())?.isSuper;
  const showToast = useUiStore((s) => s.showToast);
  const [data, setData] = useState<KbizMembership | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Post-toggle re-sync: adopt the server's roster; a failed re-sync keeps the optimistic state.
  const load = (): Promise<void> =>
    getKbizMembership().then((d) => { setData(d); setError(null); }).catch(() => undefined);
  // Reload on every focus (not just mount) so users added / renamed elsewhere appear here.
  useRefreshOnFocus(() => {
    let active = true;
    getKbizMembership()
      .then((d) => { if (active) { setData(d); setError(null); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Could not load members'); });
    return () => { active = false; };
  });

  const toggle = (userId: string, member: boolean) => {
    setData((d) => d && { ...d, users: d.users.map((u) => (u.id === userId ? { ...u, member } : u)) }); // optimistic
    setKbizMembership(userId, member)
      .then(() => { showToast(member ? 'Added to KBiz360 · BOM' : 'Removed from KBiz360 · BOM'); void load(); }) // …then re-sync
      .catch(() => {
        setData((d) => d && { ...d, users: d.users.map((u) => (u.id === userId ? { ...u, member: !member } : u)) }); // revert
        showToast('Could not update membership');
      });
  };

  const shown = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? data.users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      : data.users;
    // Members first, then alphabetical — the current roster reads at a glance.
    return [...list].sort((a, b) => Number(b.member) - Number(a.member) || a.name.localeCompare(b.name));
  }, [data, query]);

  if (!isSuper) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.coolText, fontSize: 14 }}>Requires super admin</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Go back</Text></Pressable>
      </SafeAreaView>
    );
  }

  const memberCount = data?.users.filter((u) => u.member).length ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>KBiz360 Members</Text>
          <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>
            {data ? `${data.company.name} · branch ${data.branch.code ?? data.branch.name} · ${memberCount} member${memberCount === 1 ? '' : 's'}` : 'Business membership'}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center mx-4 mt-3" style={{ gap: 12, height: 48, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.coolMuted }}>
        <Search size={19} color={colors.coolText3} strokeWidth={2.2} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search users" placeholderTextColor={colors.coolText3}
          autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.ink, fontSize: 15 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
        {!data && !error ? (
          <View className="items-center" style={{ paddingVertical: 40 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 10 }}>Loading users…</Text>
          </View>
        ) : null}
        {error ? (
          <View className="items-center" style={{ paddingVertical: 40 }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Building2 size={40} color={colors.primary} /></View>
            <Text style={{ color: colors.coolText, fontSize: 13.5, marginTop: 14, textAlign: 'center', paddingHorizontal: 24 }}>{error}</Text>
          </View>
        ) : null}

        {data ? (
          <>
            <View className="flex-row items-center gap-1.5 mb-2 px-1">
              <Building2 size={12} color={colors.coolText} />
              <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>
                ALL USERS · {shown.length} — TOGGLE ON = IN {(data.branch.code ?? 'BOM').toUpperCase()}
              </Text>
            </View>
            <View style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }}>
              {shown.map((du, i) => {
                const u = toUser(du);
                return (
                  <View key={du.id} className="flex-row items-center gap-3 px-3.5 py-3"
                    style={{ borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.coolDivider }}>
                    <Avatar initials={u.initials} color={u.color} size={44} uri={u.avatar} />
                    <View className="flex-1">
                      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{u.name}</Text>
                      <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12, marginTop: 1 }}>
                        {du.position || humanizeRole(du.role)} · {du.email}
                      </Text>
                    </View>
                    <Switch
                      value={du.member}
                      onValueChange={(v) => toggle(du.id, v)}
                      trackColor={{ true: colors.primary, false: colors.coolDivider }}
                    />
                  </View>
                );
              })}
              {shown.length === 0 ? (
                <View className="items-center" style={{ paddingVertical: 24 }}>
                  <Text style={{ color: colors.coolText, fontSize: 13 }}>No matching users</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

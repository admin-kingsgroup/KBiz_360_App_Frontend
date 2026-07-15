import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Switch, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Search, Building2 } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import { getKbizMembership, setKbizMembership, humanizeRole, toUser, type KbizMembership } from '../../src/api/directory';

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

  useEffect(() => {
    let active = true;
    getKbizMembership()
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Could not load members'); });
    return () => { active = false; };
  }, []);

  const toggle = (userId: string, member: boolean) => {
    setData((d) => d && { ...d, users: d.users.map((u) => (u.id === userId ? { ...u, member } : u)) }); // optimistic
    setKbizMembership(userId, member)
      .then(() => showToast(member ? 'Added to KBiz360 · BOM' : 'Removed from KBiz360 · BOM'))
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Requires super admin</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}><Text style={{ color: colors.blue, fontWeight: '700' }}>Go back</Text></Pressable>
      </SafeAreaView>
    );
  }

  const memberCount = data?.users.filter((u) => u.member).length ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600' }}>KBiz360 Members</Text>
          <Text style={{ color: colors.warmMute, fontSize: 10.5 }}>
            {data ? `${data.company.name} · branch ${data.branch.code ?? data.branch.name} · ${memberCount} member${memberCount === 1 ? '' : 's'}` : 'Business membership'}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center mx-4 mt-3" style={{ gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
        <Search size={16} color={colors.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search users" placeholderTextColor={colors.textMuted}
          autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.ink, fontSize: 14 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
        {!data && !error ? (
          <View className="items-center" style={{ paddingVertical: 40 }}>
            <ActivityIndicator color={colors.ink} />
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>Loading users…</Text>
          </View>
        ) : null}
        {error ? (
          <View className="items-center" style={{ paddingVertical: 40 }}>
            <Building2 size={28} color={colors.cardEdge} />
            <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 10, textAlign: 'center', paddingHorizontal: 24 }}>{error}</Text>
          </View>
        ) : null}

        {data ? (
          <>
            <View className="flex-row items-center gap-1.5 mb-1">
              <Building2 size={11} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 }}>
                ALL USERS · {shown.length} — TOGGLE ON = IN {(data.branch.code ?? 'BOM').toUpperCase()}
              </Text>
            </View>
            <View style={{ backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }}>
              {shown.map((du, i) => {
                const u = toUser(du);
                return (
                  <View key={du.id} className="flex-row items-center gap-2.5 px-3.5 py-2.5"
                    style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.cardEdge }}>
                    <Avatar initials={u.initials} color={u.color} size={36} uri={u.avatar} />
                    <View className="flex-1">
                      <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '800' }}>{u.name}</Text>
                      <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>
                        {du.position || humanizeRole(du.role)} · {du.email}
                      </Text>
                    </View>
                    <Switch
                      value={du.member}
                      onValueChange={(v) => toggle(du.id, v)}
                      trackColor={{ true: colors.success, false: colors.cardEdge }}
                    />
                  </View>
                );
              })}
              {shown.length === 0 ? (
                <View className="items-center" style={{ paddingVertical: 24 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>No matching users</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

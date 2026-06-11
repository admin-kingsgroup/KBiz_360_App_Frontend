import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search, Link2, PhoneCall } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { CallListItem } from '../../src/components/call';
import { colors } from '../../src/theme';
import { useUiStore } from '../../src/store/uiStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { callManager } from '../../src/services/rtc/CallManager';
import { callHistory, type CallLogDTO, type CallMediaType } from '../../src/api/calls';
import { listUsers, type DirectoryUser } from '../../src/api/directory';
import type { CallRecord, CallFilter } from '../../src/types';

const PALETTE = [colors.purple, colors.blue, colors.teal, colors.orange, colors.coral, colors.ink];
const colorFor = (seed: string): string => PALETTE[[...seed].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

// Backend call_log → the record shape CallListItem renders. Missed is a status, so fold it into
// the row's "direction" for the missed icon/colour.
const toRecord = (d: CallLogDTO): CallRecord => ({
  id: d.id,
  contact: { id: d.peer.id, name: d.peer.name, initials: initialsOf(d.peer.name), color: colorFor(d.peer.id) },
  type: d.type,
  direction: d.status === 'missed' ? 'missed' : d.direction,
  ts: d.startedAt,
  durationSec: d.durationSec,
});

const FILTERS: { key: CallFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'missed', label: 'Missed' },
];

export default function CallScreen() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const myId = useMessagingStore((s) => s.myUserId);
  const presence = useMessagingStore((s) => s.presence);

  const [filter, setFilter] = useState<CallFilter>('all');
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState<CallLogDTO[]>([]);
  const [contacts, setContacts] = useState<DirectoryUser[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, u] = await Promise.all([callHistory({ limit: 100 }), listUsers().catch(() => [] as DirectoryUser[])]);
      setHistory(h.calls);
      setContacts(u.filter((x) => x.id !== myId));
    } catch { /* offline / not signed in — keep current */ }
  }, [myId]);

  useEffect(() => { void load(); }, [load]);
  const onRefresh = useCallback(() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }, [load]);

  const records = useMemo(() => {
    let rows = history.map(toRecord);
    if (filter === 'missed') rows = rows.filter((r) => r.direction === 'missed');
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.contact.name.toLowerCase().includes(q));
    return rows;
  }, [history, filter, search]);

  const missed = useMemo(() => history.filter((h) => h.status === 'missed').length, [history]);
  const favourites = useMemo(
    () => [...contacts].sort((a, b) => Number(presence[b.id]?.status === 'online') - Number(presence[a.id]?.status === 'online')).slice(0, 6),
    [contacts, presence],
  );

  const startCall = (id: string, name: string, type: CallMediaType = 'voice') => { void callManager.startOutgoing({ id, name }, type); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3">
        <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 }}>Calls</Text>
      </View>

      <View className="flex-row items-center mx-4" style={{ gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
        <Search size={16} color={colors.textMuted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search calls" placeholderTextColor={colors.textMuted}
          autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.ink, fontSize: 14 }} />
      </View>

      <View className="flex-row px-4" style={{ gap: 8, paddingVertical: 12 }}>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          const badge = f.key === 'missed' ? missed : 0;
          return (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} className="flex-row items-center" style={{ gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? colors.ink : colors.card, borderWidth: 1, borderColor: on ? colors.ink : colors.cardEdge }}>
              <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12.5, fontWeight: '700' }}>{f.label}</Text>
              {badge > 0 ? (
                <View style={{ minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: on ? '#fff' : colors.danger, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: on ? colors.ink : '#fff', fontSize: 10, fontWeight: '800' }}>{badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={records}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />}
        renderItem={({ item }) => (
          <CallListItem call={item} onPress={() => router.push({ pathname: '/call/[id]', params: { id: item.id } })} onCallBack={() => startCall(item.contact.id, item.contact.name, item.type)} />
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <View>
            <Pressable onPress={() => showToast('Call link copied to clipboard')} className="flex-row items-center px-4 py-3" style={{ gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' }}>
                <Link2 size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '700' }}>Create call link</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 1 }}>Share a link for your call</Text>
              </View>
            </Pressable>

            {filter === 'all' && !search && favourites.length ? (
              <View style={{ paddingTop: 8 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 16, marginBottom: 8 }}>FAVOURITES</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 14 }}>
                  {favourites.map((c) => {
                    const online = presence[c.id]?.status === 'online';
                    return (
                      <Pressable key={c.id} onPress={() => startCall(c.id, c.name, 'voice')} style={{ alignItems: 'center', width: 64 }}>
                        <View>
                          <Avatar initials={initialsOf(c.name)} color={colorFor(c.id)} size={56} />
                          {online ? <View style={{ position: 'absolute', right: 1, bottom: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.canvas }} /> : null}
                        </View>
                        <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 11.5, fontWeight: '600', marginTop: 6 }}>{c.name.split(' ')[0]}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 }}>
              {filter === 'missed' ? 'MISSED' : 'RECENT'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 50 }}>
            <PhoneCall size={38} color={colors.cardEdge} />
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 12 }}>{search ? 'No matching calls' : 'No calls yet'}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Search, PhoneCall } from 'lucide-react-native';
import { CallListItem } from '../../src/components/call';
import { colors } from '../../src/theme';
import { useCallSessionStore } from '../../src/store/callSessionStore';
import { callManager } from '../../src/services/rtc/CallManager';
import { callHistory, type CallLogDTO, type CallMediaType } from '../../src/api/calls';
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

  const [filter, setFilter] = useState<CallFilter>('all');
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState<CallLogDTO[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const h = await callHistory({ limit: 100 });
      setHistory(h.calls);
    } catch { /* offline / not signed in — keep current */ }
  }, []);

  // Refetch on focus so a call you just finished (or a missed call) shows in RECENT immediately.
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  // Also refetch when an active call clears (call ended) — covers calling from THIS tab, where the
  // overlay sits on top so focus never changes. The log is written server-side on the call ending.
  const activeCallId = useCallSessionStore((s) => s.active?.callId ?? null);
  useEffect(() => { if (!activeCallId) void load(); }, [activeCallId, load]);
  const onRefresh = useCallback(() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }, [load]);

  const records = useMemo(() => {
    let rows = history.map(toRecord);
    if (filter === 'missed') rows = rows.filter((r) => r.direction === 'missed');
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.contact.name.toLowerCase().includes(q));
    return rows;
  }, [history, filter, search]);

  const missed = useMemo(() => history.filter((h) => h.status === 'missed').length, [history]);

  const startCall = (id: string, name: string, type: CallMediaType = 'voice') => { void callManager.startOutgoing({ id, name }, type); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      {/* White header bar (standard chrome) */}
      <View className="flex-row items-center justify-between px-4" style={{ backgroundColor: colors.card, height: 60, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 }}>Calls</Text>
      </View>

      {/* Grey pill search (Home search language) */}
      <View className="flex-row items-center mx-4" style={{ gap: 12, paddingHorizontal: 16, height: 48, marginTop: 12, borderRadius: 999, backgroundColor: colors.coolMuted }}>
        <Search size={19} color={colors.coolText3} strokeWidth={2.2} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search calls" placeholderTextColor={colors.coolText3}
          autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.ink, fontSize: 15 }} />
      </View>

      {/* Filter chips — grey, green when active */}
      <View className="flex-row px-4" style={{ gap: 8, paddingVertical: 10 }}>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          const badge = f.key === 'missed' ? missed : 0;
          return (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} className="flex-row items-center" style={{ gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? colors.primary : colors.coolMuted }}>
              <Text style={{ color: on ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>{f.label}</Text>
              {badge > 0 ? (
                <View style={{ minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: on ? '#fff' : '#EF4444', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: on ? colors.primary : '#fff', fontSize: 10, fontWeight: '700' }}>{badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={records}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <CallListItem call={item} onPress={() => router.push({ pathname: '/call/[id]', params: { id: item.id } })} onCallBack={() => startCall(item.contact.id, item.contact.name, item.type)} />
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
            {filter === 'missed' ? 'MISSED' : 'RECENT'}
          </Text>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 48, paddingHorizontal: 32 }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <PhoneCall size={40} color={colors.primary} />
            </View>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 16 }}>{search ? 'No matching calls' : 'No calls yet'}</Text>
            {!search ? <Text style={{ color: colors.coolText, fontSize: 13.5, marginTop: 5, textAlign: 'center' }}>Start a voice call from any chat — your history appears here</Text> : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}

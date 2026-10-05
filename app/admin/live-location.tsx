import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Map as MapIcon, Navigation } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { getLiveLocations, type LivePerson } from '../../src/api/location';
import { liveStatus, type LiveTone } from '../../src/logic/locationTrail';
import { useRefreshOnFocus } from '../../src/hooks/useRefreshOnFocus';
import { ApiError } from '../../src/api/client';

// Admin → Live location. Where on-duty staff are right now: everyone the viewer's attendance team
// view covers (the server scopes it), with the last position their phone reported. Phones stream
// only between check-in and check-out, so anyone off duty shows their last seen time at most.
// Tap a person for the day's trail on a map; "Map" shows everyone's latest position together.

const TONE: Record<LiveTone, string> = { live: colors.primary, stale: colors.orange, missing: colors.coral, off: colors.coolText3 };
const ORDER: Record<LiveTone, number> = { live: 0, stale: 1, missing: 2, off: 3 };
const REFRESH_MS = 30_000;

const PersonRow = memo(function PersonRow({ p, now, onOpen }: { p: LivePerson; now: number; onOpen: (p: LivePerson) => void }) {
  const st = liveStatus(p, now);
  return (
    <Pressable onPress={() => onOpen(p)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 px-4 py-3">
      <Avatar initials={p.initials} color={p.color} size={42} />
      <View className="flex-1">
        <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{p.name}</Text>
        <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12.5, marginTop: 1 }}>
          {[p.branch, p.office].filter((x) => x && x !== '—').join(' · ') || '—'}{p.in ? ` · in ${p.in}` : ''}{p.out ? ` · out ${p.out}` : ''}
        </Text>
        <View className="flex-row items-center gap-1.5" style={{ marginTop: 3 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TONE[st.tone] }} />
          <Text numberOfLines={1} style={{ color: TONE[st.tone], fontSize: 12.5, fontWeight: '600', flexShrink: 1 }}>{st.text}</Text>
        </View>
      </View>
      <ChevronRight size={18} color={colors.coolText3} />
    </Pressable>
  );
});

export default function LiveLocationScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<LivePerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback((): Promise<void> =>
    getLiveLocations()
      .then((r) => { setRows(r); setError(null); setNow(Date.now()); })
      .catch((e: unknown) => { setError(e instanceof ApiError ? e.message : 'Could not load — check your connection'); setRows((cur) => cur ?? []); }),
  []);

  // Reload on focus, then keep it fresh while the screen stays open.
  useRefreshOnFocus(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  });
  // "2 min ago" keeps counting between reloads.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const sorted = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => ORDER[liveStatus(a, now).tone] - ORDER[liveStatus(b, now).tone] || a.name.localeCompare(b.name));
  }, [rows, now]);
  const onDuty = sorted.filter((p) => p.tracking).length;
  const sharing = sorted.filter((p) => liveStatus(p, now).tone === 'live').length;
  const located = sorted.filter((p) => p.last?.today).length;

  const openPerson = useCallback((p: LivePerson): void => {
    router.push({ pathname: '/admin/location-trail', params: { userId: p.id, name: p.name } });
  }, [router]);
  const openMap = useCallback((): void => router.push('/admin/location-trail'), [router]);
  const onRefresh = useCallback((): void => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      <View className="flex-row items-center gap-2 px-2" style={{ height: 56, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.coolDivider }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Live location</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>Shared from check-in to check-out</Text>
        </View>
        <Pressable onPress={openMap} disabled={!located} className="flex-row items-center gap-1.5 px-3" style={{ height: 36, borderRadius: 18, marginRight: 8, backgroundColor: located ? colors.primary : colors.coolMuted }}>
          <MapIcon size={15} color={located ? '#fff' : colors.coolText3} />
          <Text style={{ color: located ? '#fff' : colors.coolText3, fontSize: 13, fontWeight: '700' }}>Map</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {rows === null ? (
          <View className="items-center" style={{ paddingVertical: 56 }}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <>
            {error ? (
              <View style={{ borderRadius: 12, backgroundColor: '#FDECEA', padding: 12, marginBottom: 12 }}>
                <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>{error}</Text>
              </View>
            ) : null}
            <View className="flex-row gap-2.5" style={{ marginBottom: 12 }}>
              {([['On duty', onDuty, colors.ink], ['Sharing live', sharing, colors.primary], ['Not sharing', Math.max(0, onDuty - sharing), onDuty - sharing > 0 ? colors.coral : colors.coolText3]] as [string, number, string][]).map(([label, n, tint]) => (
                <View key={label} className="flex-1" style={{ borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, paddingVertical: 10, paddingHorizontal: 12 }}>
                  <Text style={{ color: tint, fontSize: 22, fontWeight: '800' }}>{n}</Text>
                  <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 1 }}>{label}</Text>
                </View>
              ))}
            </View>
            {sorted.length === 0 ? (
              <View className="items-center" style={{ paddingVertical: 48 }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Navigation size={34} color={colors.primary} /></View>
                <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>Nobody to show</Text>
                <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 4, textAlign: 'center' }}>People appear here once their attendance is tracked.</Text>
              </View>
            ) : (
              <View style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>
                {sorted.map((p, i) => (
                  <View key={p.id} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.coolDivider }}>
                    <PersonRow p={p} now={now} onOpen={openPerson} />
                  </View>
                ))}
              </View>
            )}
            <Text style={{ color: colors.coolText3, fontSize: 12, lineHeight: 17, marginTop: 14, paddingHorizontal: 4 }}>
              A phone shares its location only while its owner is checked in, and only after they agreed to work-hours location sharing. “On duty · no location received” means that person has not agreed yet, has location turned off, or has not opened the app since checking in.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

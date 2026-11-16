import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { getTaskDashboard, type TaskDashboard } from '../../src/api/tasks';

// Task dashboard (spec 2026-11-16, section 7): counts, a table by person and one by business or
// branch, over every task this person can see (theirs, the ones they gave, watch, or — for a manager —
// their team's). Tap any number to see the tasks behind it.

type Metric = 'open' | 'overdue' | 'dueToday' | 'check';

export default function TaskDashboardScreen() {
  const router = useRouter();
  const [data, setData] = useState<TaskDashboard | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await getTaskDashboard()); setError(''); }
    catch { setError('Could not load the dashboard. Pull down to retry.'); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const drill = (metric: Metric, extra: { personId?: string; branchId?: string; title: string }): void => {
    router.push({ pathname: '/task/list', params: { metric, ...(extra.personId ? { personId: extra.personId } : {}), ...(extra.branchId ? { branchId: extra.branchId } : {}), title: extra.title } });
  };

  const Tile = ({ label, value, metric, tone }: { label: string; value: number; metric: Metric; tone?: string }) => (
    <Pressable onPress={() => drill(metric, { title: label })} style={{ width: '48%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, padding: 12 }}>
      <Text style={{ color: tone ?? colors.ink, fontSize: 24, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '600', marginTop: 2 }}>{label}</Text>
    </Pressable>
  );
  const Num = ({ n, onPress, tone, flex = 1 }: { n: number | string; onPress?: () => void; tone?: string; flex?: number }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flex, alignItems: 'flex-end', paddingVertical: 4 }}>
      <Text style={{ color: tone ?? colors.ink, fontSize: 13.5, fontWeight: '700', textDecorationLine: onPress ? 'underline' : 'none' }}>{n}</Text>
    </Pressable>
  );
  const Head = ({ cols }: { cols: string[] }) => (
    <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.coolMuted }}>
      {cols.map((c, i) => <Text key={c} style={{ flex: i === 0 ? 2.2 : 1, textAlign: i === 0 ? 'left' : 'right', color: colors.coolText, fontSize: 11, fontWeight: '700' }}>{c}</Text>)}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 54 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <Text style={{ flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' }}>Task dashboard</Text>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 40 }}>
        {!data ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            {error ? <Pressable onPress={() => void load()}><Text style={{ color: colors.danger }}>{error}</Text></Pressable> : <ActivityIndicator color={colors.primary} />}
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Tile label="Open" value={data.counts.open} metric="open" />
              <Tile label="Due today" value={data.counts.dueToday} metric="dueToday" />
              <Tile label="Overdue" value={data.counts.overdue} metric="overdue" tone={data.counts.overdue ? colors.danger : undefined} />
              <Tile label="Waiting for my check" value={data.counts.waitingForMyCheck} metric="check" />
            </View>

            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 8 }}>By person</Text>
            <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>
              <Head cols={['Person', 'Open', 'Overdue', 'Avg days late', 'Closed this month']} />
              {data.byPerson.length === 0 ? <Text style={{ color: colors.coolText, fontSize: 12.5, padding: 12 }}>No tasks yet.</Text> : null}
              {data.byPerson.map((p, i) => (
                <View key={p.userId} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.coolDivider }}>
                  <Text numberOfLines={1} style={{ flex: 2.2, color: colors.ink, fontSize: 13.5, fontWeight: '600' }}>{p.name}</Text>
                  <Num n={p.open} onPress={p.open ? () => drill('open', { personId: p.userId, title: `${p.name} · open` }) : undefined} />
                  <Num n={p.overdue} tone={p.overdue ? colors.danger : undefined} onPress={p.overdue ? () => drill('overdue', { personId: p.userId, title: `${p.name} · overdue` }) : undefined} />
                  <Num n={Number.isFinite(p.avgDaysLate) ? Math.round(p.avgDaysLate * 10) / 10 : '–'} />
                  <Num n={p.closedThisMonth} />
                </View>
              ))}
            </View>

            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 8 }}>By business or branch</Text>
            <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>
              <Head cols={['Business / branch', 'Open', 'Overdue']} />
              {data.byBranch.length === 0 ? <Text style={{ color: colors.coolText, fontSize: 12.5, padding: 12 }}>No tasks yet.</Text> : null}
              {data.byBranch.map((b, i) => {
                const label = [b.companyName, b.branchName].filter(Boolean).join(' · ') || 'Branch';
                return (
                  <View key={b.branchId} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.coolDivider }}>
                    <Text numberOfLines={1} style={{ flex: 2.2, color: colors.ink, fontSize: 13.5, fontWeight: '600' }}>{label}</Text>
                    <Num n={b.open} onPress={b.open ? () => drill('open', { branchId: b.branchId, title: `${label} · open` }) : undefined} />
                    <Num n={b.overdue} tone={b.overdue ? colors.danger : undefined} onPress={b.overdue ? () => drill('overdue', { branchId: b.branchId, title: `${label} · overdue` }) : undefined} />
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { getTaskDashboard, type TaskDashboard } from '../../api/tasks';
import { colors } from '../../theme';
import { textStyles } from '../../theme/typography';
import { ChatTile } from '../chat/ChatTile';

type Person = TaskDashboard['byPerson'][number];

// "1 open · 1 overdue · 2 closed this month" — only the parts that are not zero.
export function personSummary(p: Pick<Person, 'open' | 'overdue' | 'closedThisMonth'>): string {
  const parts = [p.open ? `${p.open} open` : '', p.overdue ? `${p.overdue} overdue` : '', p.closedThisMonth ? `${p.closedThisMonth} closed this month` : ''];
  return parts.filter(Boolean).join(' · ') || 'No open tasks';
}

// Tasks › People (owner 2026-11-17: "instead of Team show the user wise task"). One row per person
// who has tasks you can see — yours, the ones you gave, the ones you watch and, for a manager, the
// team's — with how many are open and overdue: the dashboard's "By person" table, as a list. Tap a
// person for their open tasks. Most overdue first, then most open.
export function PeopleList({ query, meId }: { query: string; meId: string }) {
  const router = useRouter();
  const [data, setData] = useState<TaskDashboard | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await getTaskDashboard()); setError(''); }
    catch { setError('Could not load people. Tap to retry.'); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.byPerson ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [data, query]);

  const open = (p: Person): void => {
    router.push({ pathname: '/task/list', params: { metric: 'open', personId: p.userId, assignee: '1', title: p.userId === meId ? 'Your tasks' : p.name } });
  };

  return (
    <FlatList
      data={people}
      keyExtractor={(p) => p.userId}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 36, flexGrow: 1 }}
      renderItem={({ item: p, index }) => {
        const first = index === 0;
        const last = index === people.length - 1;
        return (
          <Pressable testID={`task-person-${p.userId}`} onPress={() => open(p)} accessibilityRole="button" accessibilityLabel={`${p.name}, ${personSummary(p)}`}
            // A plain style object: this app's Pressable (wrapped by NativeWind) drops a style function.
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10,
              backgroundColor: colors.card, borderColor: colors.coolDivider,
              borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: first ? 1 : 0, borderBottomWidth: 1,
              borderTopLeftRadius: first ? 14 : 0, borderTopRightRadius: first ? 14 : 0,
              borderBottomLeftRadius: last ? 14 : 0, borderBottomRightRadius: last ? 14 : 0,
            }}>
            <ChatTile name={p.name} size={42} radius={12} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: colors.ink, ...textStyles.headline }}>
                {p.name}{p.userId === meId ? <Text style={{ color: colors.coolText, fontWeight: '400' }}>  (you)</Text> : null}
              </Text>
              <Text numberOfLines={1} style={{ color: colors.coolText, ...textStyles.subheadline }}>
                {p.open ? `${p.open} open` : 'No open tasks'}
                {p.overdue ? <Text style={{ color: colors.danger, fontWeight: '600' }}>{`  ·  ${p.overdue} overdue`}</Text> : null}
                {p.closedThisMonth ? `  ·  ${p.closedThisMonth} closed this month` : ''}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.coolText3} />
          </Pressable>
        );
      }}
      ListEmptyComponent={!data ? (
        <Pressable onPress={() => void load()} disabled={!error} style={{ padding: 34, alignItems: 'center' }}>
          {error ? <Text style={{ color: colors.danger, ...textStyles.subheadline }}>{error}</Text> : <ActivityIndicator color={colors.primary} />}
        </Pressable>
      ) : (
        <Text style={{ color: colors.coolText, textAlign: 'center', padding: 28, ...textStyles.subheadline }}>
          {query.trim() ? 'No one matches this search.' : 'No one has tasks you can see yet.'}
        </Text>
      )}
    />
  );
}

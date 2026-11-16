import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { listTasks, type Task, type TaskFlag } from '../../src/api/tasks';
import { useAuthStore } from '../../src/store/authStore';
import { groupMine } from '../../src/logic/taskGroups';
import { TaskRow } from '../../src/components/tasks/TaskRow';

// The tasks behind a dashboard number. The dashboard counts over view=all (everything this person may
// see), so the list asks for exactly that with the same flag, person and branch — the two always agree.

const FLAG: Record<string, TaskFlag | undefined> = { overdue: 'overdue', dueToday: 'due_today', check: 'waiting_check', open: undefined };

export default function TaskDrillList() {
  const router = useRouter();
  const meId = useAuthStore((s) => s.user?.id) ?? '';
  const { metric = 'open', personId, branchId, title } = useLocalSearchParams<{ metric?: string; personId?: string; branchId?: string; title?: string }>();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setTasks(await listTasks({ view: 'all', state: 'open', flag: FLAG[metric], ...(personId ? { personId } : {}), ...(branchId ? { branchId } : {}) }));
      setError('');
    } catch { setError('Could not load these tasks. Pull down to retry.'); }
  }, [metric, personId, branchId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const sections = useMemo(() => groupMine(tasks ?? []).map((g) => ({ key: g.key, title: g.title, data: g.tasks })), [tasks]);
  const open = useCallback((id: string) => router.push({ pathname: '/task/[id]', params: { id } }), [router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 54 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' }}>{title || 'Tasks'}</Text>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(t: Task) => t.id}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 36, flexGrow: 1 }}
        renderSectionHeader={({ section }) => <Text style={{ color: section.key === 'overdue' ? colors.danger : colors.ink, fontSize: 15, fontWeight: '700', marginTop: 14, marginBottom: 6 }}>{section.title}  <Text style={{ color: colors.coolText, fontSize: 12.5 }}>{section.data.length}</Text></Text>}
        renderItem={({ item, index, section }) => (
          <View style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderTopWidth: index === 0 ? 1 : 0, borderTopLeftRadius: index === 0 ? 14 : 0, borderTopRightRadius: index === 0 ? 14 : 0, borderBottomLeftRadius: index === section.data.length - 1 ? 14 : 0, borderBottomRightRadius: index === section.data.length - 1 ? 14 : 0, overflow: 'hidden' }}>
            <TaskRow task={item} meId={meId} onPress={open} last={index === section.data.length - 1} />
          </View>
        )}
        ListEmptyComponent={!tasks ? (
          <View style={{ padding: 34, alignItems: 'center' }}>{error ? <Text style={{ color: colors.danger }}>{error}</Text> : <ActivityIndicator color={colors.primary} />}</View>
        ) : <Text style={{ color: colors.coolText, textAlign: 'center', padding: 28 }}>No tasks here.</Text>}
      />
    </SafeAreaView>
  );
}

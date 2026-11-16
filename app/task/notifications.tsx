import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bell, ChevronLeft } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { listTaskNotifications, markTaskNotificationsOpened, type TaskNotification } from '../../src/api/tasks';
import { useTasksStore } from '../../src/store/tasksStore';

// In-app list of task notifications (spec section 6): every event that was pushed or emailed is here
// too, newest first. Tapping one opens the task; "Mark all read" clears the bell.

const stamp = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export default function TaskNotifications() {
  const router = useRouter();
  const [items, setItems] = useState<TaskNotification[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await listTaskNotifications()); setError(''); }
    catch { setError('Could not load notifications. Pull down to retry.'); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const markRead = async (ids?: string[]): Promise<void> => {
    setItems((list) => list?.map((n) => (!ids || ids.includes(n.id) ? { ...n, opened: true } : n)) ?? list);
    try { await markTaskNotificationsOpened(ids); } catch { /* the next load shows the truth */ }
    void useTasksStore.getState().refreshNotifications();
  };
  const open = (n: TaskNotification): void => {
    if (!n.opened) void markRead([n.id]);
    router.push({ pathname: '/task/[id]', params: { id: n.taskId } });
  };
  const unread = items?.filter((n) => !n.opened).length ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 54 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <Text style={{ flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' }}>Task notifications</Text>
        {unread ? <Pressable onPress={() => void markRead()} hitSlop={8} style={{ paddingHorizontal: 10 }}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>Mark all read</Text></Pressable> : null}
      </View>
      <FlatList
        data={items ?? []}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 30, flexGrow: 1 }}
        ListEmptyComponent={!items ? (
          <View style={{ padding: 34, alignItems: 'center' }}>{error ? <Text style={{ color: colors.danger }}>{error}</Text> : <ActivityIndicator color={colors.primary} />}</View>
        ) : (
          <View style={{ alignItems: 'center', padding: 36 }}>
            <Bell size={36} color={colors.coolText3} />
            <Text style={{ color: colors.coolText, marginTop: 10 }}>No task notifications yet.</Text>
          </View>
        )}
        renderItem={({ item: n }) => (
          <Pressable onPress={() => open(n)} style={{ flexDirection: 'row', gap: 10, backgroundColor: n.opened ? colors.card : colors.primarySoft, borderRadius: 12, borderWidth: 1, borderColor: colors.coolDivider, padding: 12, marginTop: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: n.opened ? 'transparent' : colors.primary }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 14, fontWeight: n.opened ? '600' : '700' }}>{n.title}</Text>
              {n.body ? <Text numberOfLines={2} style={{ color: colors.textBody, fontSize: 13, marginTop: 2 }}>{n.body}</Text> : null}
              <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 4 }}>{stamp(n.sentAt)}</Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

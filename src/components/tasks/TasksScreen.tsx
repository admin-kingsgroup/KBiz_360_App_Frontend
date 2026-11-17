import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart3, Bell, ListChecks, Plus, Search, SlidersHorizontal, X } from 'lucide-react-native';
import type { Task, TaskState, TaskView } from '../../api/tasks';
import { colors } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { listKey, useTasksStore } from '../../store/tasksStore';
import { activeFilterCount, filterTasks, groupAssigned, groupMine, type TaskFilters } from '../../logic/taskGroups';
import { TaskRow } from './TaskRow';
import { FilterSheet } from './FilterSheet';
import { PeopleList } from './PeopleList';

// Tasks tab (spec 2026-11-16, section 7) — replaces Reminders. Three lists: My tasks (assigned to
// me, incl. my personal to-dos), Assigned by me (given to others) and Watching. The fourth was Team
// (managers only); since 2026-11-17 it is People for everyone: each person with tasks you can see,
// with their open and overdue counts (PeopleList), tap for their tasks.

type ListView = Exclude<TaskView, 'all' | 'team'>;
type Segment = ListView | 'people';
const SEGMENTS: Array<{ key: Segment; label: string }> = [
  { key: 'mine', label: 'My tasks' },
  { key: 'assigned', label: 'By me' },
  { key: 'watching', label: 'Watcher' },
  { key: 'people', label: 'Team' },
];

const EMPTY: Record<ListView, string> = {
  mine: 'Nothing assigned to you. Tap New to add a personal to-do.',
  assigned: 'You have not given anyone a task yet.',
  watching: 'You are not watching any tasks.',
};

export default function TasksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const meId = useAuthStore((s) => s.user?.id) ?? '';
  const [view, setView] = useState<Segment>('mine');
  const people = view === 'people';
  // People loads its own list (the dashboard's per-person counts); the task-list plumbing below keeps
  // serving the last task list underneath and is not drawn.
  const listView: ListView = people ? 'mine' : view;
  const [state, setState] = useState<TaskState>('open');
  const [filters, setFilters] = useState<TaskFilters>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const key = listKey(listView, state);
  const list = useTasksStore((s) => s.lists[key]);
  const loading = useTasksStore((s) => !!s.loading[key]);
  const error = useTasksStore((s) => s.errors[key]);
  const lists = useTasksStore((s) => s.lists);
  const notifUnread = useTasksStore((s) => s.notifUnread);
  const counts = useMemo<Partial<Record<Segment, number>>>(() => ({
    mine: lists[listKey('mine', 'open')]?.length,
    assigned: lists[listKey('assigned', 'open')]?.length,
    watching: lists[listKey('watching', 'open')]?.length,
  }), [lists]);

  const load = useCallback(async () => {
    const st = useTasksStore.getState();
    if (!people) await st.load(listView, state);
    void st.refreshBadge(useAuthStore.getState().user?.id);
    void st.refreshNotifications();
  }, [people, listView, state]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  // A task changed on the server (socket 'task:update') → refetch the list on screen.
  const touchedAt = useTasksStore((s) => s.touched.at);
  const firstTouch = useRef(touchedAt);
  useEffect(() => { if (touchedAt && touchedAt !== firstTouch.current && !people) void useTasksStore.getState().load(listView, state); }, [touchedAt, people, listView, state]);
  // Fill the other segments' counts once, so the chips say how many are open there too.
  useFocusEffect(useCallback(() => {
    const st = useTasksStore.getState();
    void st.load('watching', 'open');
  }, []));

  const sections = useMemo(() => {
    const shown = filterTasks(list ?? [], filters);
    const groups = listView === 'assigned' ? groupAssigned(shown) : groupMine(shown);
    return groups.map((g) => ({ key: g.key, title: g.title, data: g.tasks }));
  }, [list, filters, listView]);
  const total = sections.reduce((n, s) => n + s.data.length, 0);
  const filterCount = activeFilterCount(filters);
  const openTask = useCallback((id: string) => router.push({ pathname: '/task/[id]', params: { id } }), [router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View style={{ paddingTop: Math.max(insets.top + 8, 26), paddingHorizontal: 14 }}>
        <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }}><ListChecks size={19} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 }}>Tasks</Text>
            <Text style={{ color: colors.coolText, marginTop: 1, fontSize: 11.5 }}>Give work, follow it and close it</Text>
          </View>
          <Pressable accessibilityLabel={`Task notifications${notifUnread ? `, ${notifUnread} unread` : ''}`} onPress={() => router.push('/task/notifications')} style={{ width: 38, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider }}>
            <Bell size={17} color={colors.primary} />
            {notifUnread ? (
              <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{notifUnread > 99 ? '99+' : notifUnread}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable accessibilityLabel="Task dashboard" onPress={() => router.push('/task/dashboard')} style={{ width: 38, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider }}>
            <BarChart3 size={17} color={colors.primary} />
          </Pressable>
          <Pressable accessibilityLabel="New task" onPress={() => router.push('/task/new')} style={{ minWidth: 66, height: 36, borderRadius: 10, paddingHorizontal: 10, backgroundColor: colors.primary, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={17} color="#fff" /><Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>New</Text>
          </Pressable>
        </View>

        {/* Segments */}
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.coolMuted, borderRadius: 12, padding: 3, gap: 2, marginTop: 6 }}>
          {SEGMENTS.map((s) => {
            const on = view === s.key;
            const n = counts[s.key];
            return (
              <Pressable key={s.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setView(s.key)}
                style={{ flex: 1, minHeight: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, backgroundColor: on ? '#fff' : 'transparent' }}>
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: on ? colors.ink : colors.coolText, fontSize: 12.5, fontWeight: on ? '700' : '600' }}>{s.label}{n ? ` ${n}` : ''}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Search + filter + open/closed */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 6 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.coolDivider }}>
            <Search size={16} color={colors.coolText3} />
            <TextInput value={filters.q ?? ''} onChangeText={(q) => setFilters((f) => ({ ...f, q }))} placeholder={people ? 'Search people' : 'Search by title'} placeholderTextColor={colors.coolText3}
              style={{ flex: 1, paddingVertical: 9, fontSize: 14, color: colors.ink }} />
            {filters.q ? <Pressable onPress={() => setFilters((f) => ({ ...f, q: '' }))} hitSlop={8}><X size={15} color={colors.coolText} /></Pressable> : null}
          </View>
          {people ? null : <>
          <Pressable accessibilityLabel="Filter tasks" onPress={() => setFilterOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, borderRadius: 12, backgroundColor: filterCount ? colors.primarySoft : colors.card, borderWidth: 1, borderColor: filterCount ? colors.primary : colors.coolDivider }}>
            <SlidersHorizontal size={16} color={filterCount ? colors.primary : colors.coolText} />
            {filterCount ? <Text style={{ color: colors.primary, fontSize: 12.5, fontWeight: '700' }}>{filterCount}</Text> : null}
          </Pressable>
          <Pressable accessibilityLabel={state === 'open' ? 'Show closed tasks' : 'Show open tasks'} onPress={() => setState((s) => (s === 'open' ? 'closed' : 'open'))}
            style={{ paddingHorizontal: 11, borderRadius: 12, justifyContent: 'center', backgroundColor: state === 'closed' ? colors.ink : colors.card, borderWidth: 1, borderColor: state === 'closed' ? colors.ink : colors.coolDivider }}>
            <Text style={{ color: state === 'closed' ? '#fff' : colors.coolText, fontSize: 12.5, fontWeight: '700' }}>{state === 'closed' ? 'Closed' : 'Open'}</Text>
          </Pressable>
          </>}
        </View>
      </View>

      {people ? <PeopleList query={filters.q ?? ''} meId={meId} /> : (
      <SectionList
        sections={sections}
        keyExtractor={(t: Task) => t.id}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 36, flexGrow: 1 }}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 6 }}>
            <Text style={{ color: section.key === 'overdue' ? colors.danger : colors.ink, fontSize: 15, fontWeight: '700' }}>{section.title}<Text style={{ color: colors.coolText, fontSize: 12.5, fontWeight: '600' }}>  {section.data.length}</Text></Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderLeftWidth: 1, borderRightWidth: 1,
            borderTopWidth: index === 0 ? 1 : 0, borderBottomWidth: index === section.data.length - 1 ? 1 : 0,
            borderTopLeftRadius: index === 0 ? 14 : 0, borderTopRightRadius: index === 0 ? 14 : 0,
            borderBottomLeftRadius: index === section.data.length - 1 ? 14 : 0, borderBottomRightRadius: index === section.data.length - 1 ? 14 : 0, overflow: 'hidden' }}>
            <TaskRow task={item} meId={meId} onPress={openTask} last={index === section.data.length - 1} />
          </View>
        )}
        ListEmptyComponent={
          loading && !list ? (
            <View style={{ alignItems: 'center', gap: 8, padding: 34 }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.coolText, fontSize: 12 }}>Loading tasks…</Text></View>
          ) : error && !list ? (
            <Pressable onPress={() => void load()} style={{ marginTop: 12, backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12 }}>
              <Text style={{ color: colors.danger }}>Could not load tasks. Tap to retry.</Text>
            </Pressable>
          ) : (
            <Text style={{ color: colors.coolText, textAlign: 'center', padding: 28, fontSize: 13 }}>
              {filterCount || filters.q ? 'No tasks match these filters.' : state === 'closed' ? 'No closed or cancelled tasks here yet.' : EMPTY[listView]}
            </Text>
          )
        }
        ListFooterComponent={total ? <Text style={{ color: colors.coolText3, textAlign: 'center', fontSize: 11.5, marginTop: 14 }}>{total} {total === 1 ? 'task' : 'tasks'}</Text> : undefined}
      />
      )}

      <FilterSheet visible={filterOpen} value={filters} meId={meId} onChange={setFilters} onClose={() => setFilterOpen(false)} />
    </View>
  );
}

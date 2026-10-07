import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Building2, CalendarDays, ChevronDown, ChevronUp, Circle, FileDown, ListTodo, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { listReminders, completeReminder, deleteReminder } from '../../api/reminders';
import { listBranches, listUsers, type DirectoryBranch, type DirectoryUser } from '../../api/directory';
import { ApiError } from '../../api/client';
import type { ReminderRecord } from '../../data/reminders';
import { useAuthStore } from '../../store/authStore';
import { useAccessStore } from '../../store/accessStore';
import { useUiStore } from '../../store/uiStore';
import { colors, radius } from '../../theme';
import { ReminderScreenshot } from './ReminderScreenshot';
import { ReminderText } from './ReminderText';
import { reminderMentionNames } from '../../logic/reminderMentions';
import { buildBranchRefMap, canUseAllEndpoint, deduplicateReminders, groupByBranch, groupByUser, isOverdueReminder, isTodayReminder, resolveUserBranches, sortReminders } from '../../logic/reminderDashboard';
import { bundlePeopleLine, bundleReminders, canEditBundle, completableMembers, myTaskSection, type ReminderBundle } from '../../logic/reminderBundles';
import { reminderPdfSpec, sectionOf, type PdfSection } from '../../logic/reminderPdf';
import { shareReminderPdf } from '../../services/reminderPdf';

type Tab = 'myself' | 'users' | 'branches' | 'all';
const tabs: Array<{ key: Tab; label: string; Icon: typeof CalendarDays; color: string }> = [
  { key: 'myself', label: 'My Task', Icon: CalendarDays, color: colors.primary },
  { key: 'users', label: 'User Wise Reminder', Icon: AlertTriangle, color: colors.danger },
  { key: 'branches', label: 'Branch Wise Reminder', Icon: Building2, color: colors.orange },
  { key: 'all', label: 'All', Icon: ListTodo, color: colors.blue },
];

// Owner 2026-10-07 — My Task splits into three:
//   Self Task      I wrote it for myself (Anubhav → Anubhav)
//   Assigned to Me someone else wrote it for me ("For me" in the ask)
//   Team Task      I wrote it for other people (one line for all of them: Anubhav → Abc, Xyz)
const MY_SECTIONS: Array<{ key: 'self' | 'forme' | 'team'; title: string; empty: string }> = [
  { key: 'self', title: 'Self Task', empty: 'No reminders you set for yourself.' },
  { key: 'forme', title: 'Assigned to Me', empty: 'No one has assigned you a reminder.' },
  { key: 'team', title: 'Team Task', empty: 'You have not assigned any active team tasks.' },
];

type Actions = { onComplete: (b: ReminderBundle) => void; onDelete: (b: ReminderBundle) => void; onEdit: (b: ReminderBundle) => void };

function BundleLine({ b, meId, branchLabel, mentionNames, actions }: { b: ReminderBundle; meId: string; branchLabel?: string; mentionNames: string[]; actions: Actions }) {
  const names = useMemo(() => [...new Set(b.members.flatMap((m) => reminderMentionNames(m, mentionNames)))], [b, mentionNames]);
  const canComplete = completableMembers(b, meId).length > 0;
  const canEdit = canEditBundle(b, meId);
  const title = b.text || 'Untitled reminder';
  return (
    <View style={styles.line}>
      {canComplete ? (
        <Pressable accessibilityLabel={`Complete ${title}`} onPress={() => actions.onComplete(b)} hitSlop={8}>
          <Circle size={20} color={b.overdue ? colors.danger : colors.primary} />
        </Pressable>
      ) : <View style={{ width: 20 }} />}
      <View style={{ flex: 1 }}>
        <ReminderText text={title} names={names} style={styles.task} />
        <Text style={[styles.due, b.overdue && { color: colors.danger }]}>{b.overdue ? 'Overdue' : b.dueAt ? new Date(b.dueAt).toLocaleDateString() : 'No due date'}</Text>
        <Text style={styles.people}>{bundlePeopleLine(b)}</Text>
        {b.image ? <ReminderScreenshot url={b.image} /> : null}
        {branchLabel ? <View style={styles.branchTag}><Building2 size={11} color={colors.primary} /><Text style={styles.branchText}>{branchLabel}</Text></View> : null}
      </View>
      {canEdit ? (
        <Pressable accessibilityLabel={`Edit ${title}`} onPress={() => actions.onEdit(b)} hitSlop={8} style={{ marginRight: 4 }}>
          <Pencil size={17} color={colors.coolText} />
        </Pressable>
      ) : null}
      <Pressable accessibilityLabel={`Delete ${title}`} onPress={() => actions.onDelete(b)} hitSlop={8}>
        <Trash2 size={18} color={colors.coolText3} />
      </Pressable>
    </View>
  );
}

function ExportButton({ label, onPress, busy }: { label: string; onPress: () => void; busy: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Export ${label} as PDF`} onPress={onPress} disabled={busy} hitSlop={8} style={styles.export}>
      {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <FileDown size={14} color={colors.primary} />}
      <Text style={styles.exportText}>PDF</Text>
    </Pressable>
  );
}

function SectionHeader({ title, count, onExport, busy }: { title: string; count?: number; onExport: () => void; busy: boolean }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{title}{count !== undefined ? <Text style={styles.sectionCount}>  {count}</Text> : null}</Text>
      <ExportButton label={title} onPress={onExport} busy={busy} />
    </View>
  );
}

function Group({ title, count, overdueCount, onExport, busy, children }: { title: string; count: number; overdueCount: number; onExport: () => void; busy: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Pressable onPress={() => setOpen(!open)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupTitle}>{title}</Text>
            <Text style={styles.meta}>{count} {count === 1 ? 'task' : 'tasks'}{overdueCount ? ` · ${overdueCount} overdue` : ''}</Text>
          </View>
          {open ? <ChevronUp size={18} color={colors.coolText} /> : <ChevronDown size={18} color={colors.coolText} />}
        </Pressable>
        <View style={{ marginLeft: 10 }}><ExportButton label={title} onPress={onExport} busy={busy} /></View>
      </View>
      {open ? children : null}
    </View>
  );
}

export default function ReminderDashboard() {
  const router = useRouter(); const authUser = useAuthStore((s) => s.user); const access = useAccessStore((s) => s.access());
  const showToast = useUiStore((s) => s.showToast);
  const insets = useSafeAreaInsets();
  const meId = authUser?.id ?? ''; const isSuper = !!access?.isSuper || authUser?.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState<Tab>('myself'); const [records, setRecords] = useState<ReminderRecord[]>([]); const [users, setUsers] = useState<DirectoryUser[]>([]); const [branches, setBranches] = useState<DirectoryBranch[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);
  const load = useCallback(async () => { setError(''); try { const base = await Promise.all(['forme', 'iset', 'review', 'archive'].map((tabName) => listReminders(tabName as 'forme' | 'iset' | 'review' | 'archive'))); let all = base.flatMap((r) => r.visible); if (canUseAllEndpoint(isSuper)) { try { all = [...all, ...(await listReminders('all')).visible]; } catch (e) { if (!(e instanceof ApiError) || e.status !== 403) throw e; } } const [directoryUsers, directoryBranches] = await Promise.all([listUsers(), listBranches()]); setRecords(deduplicateReminders(all)); setUsers(directoryUsers); setBranches(directoryBranches); } catch (e) { if (e instanceof ApiError && e.status === 403) setError('Some dashboard data is not available for your role.'); else setError('Could not load reminders. Pull down to retry.'); } finally { setLoading(false); setRefreshing(false); } }, [isSuper]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const active = useMemo(() => sortReminders(records.filter((r) => r.state !== 'approved')), [records]);
  // Every list below shows BUNDLES: the per-assignee copies of one reminder folded into one line.
  const bundles = useMemo(() => bundleReminders(active), [active]);
  const mySections = useMemo(() => {
    const out: Record<'self' | 'forme' | 'team', ReminderBundle[]> = { self: [], forme: [], team: [] };
    for (const b of bundles) { const s = myTaskSection(b, meId); if (s) out[s].push(b); }
    return out;
  }, [bundles, meId]);
  const todayBundles = useMemo(() => bundleReminders(active.filter((r) => isTodayReminder(r))), [active]);
  const userGroups = useMemo(() => groupByUser(active).map((g) => ({ ...g, bundles: bundleReminders(g.tasks) })), [active]);
  const branchGroups = useMemo(() => groupByBranch(active, users, branches).map((g) => ({ ...g, bundles: bundleReminders(g.tasks) })), [active, users, branches]);
  const branchTaskCount = useMemo(() => new Set(branchGroups.flatMap((group) => group.tasks.map((task) => task.id))).size, [branchGroups]);
  const counts = { myself: mySections.self.length + mySections.forme.length + mySections.team.length, users: userGroups.reduce((n, g) => n + g.tasks.length, 0), branches: branchTaskCount, all: bundles.length };
  // Directory names let a mention of someone who is neither assignee nor creator light up too.
  const directoryNames = useMemo(() => users.map((u) => u.name), [users]);

  const branchLabelOf = useCallback((reminder: ReminderRecord): string[] => {
    const userBranches = resolveUserBranches(reminder.forId, reminder.forName, users, branches);
    if (userBranches.length) return userBranches.map((branch) => branch.code || branch.name || 'Branch');
    const rBranch = String((reminder as any).branch || (reminder as any).branchCode || '').trim();
    if (!rBranch) return [];
    const branchMap = buildBranchRefMap(branches);
    const known = branchMap.get(rBranch) ?? branchMap.get(rBranch.toLowerCase());
    if (known) { const label = known.code || known.name; return label ? [label] : []; }
    return /^[0-9a-f]{24}$/i.test(rBranch) ? [] : [rBranch.toUpperCase()];
  }, [branches, users]);
  const branchLabelFor = useCallback((b: ReminderBundle): string | undefined => {
    const labels = [...new Set(b.members.flatMap(branchLabelOf))];
    return labels.length ? labels.join(' · ') : undefined;
  }, [branchLabelOf]);

  const complete = async (b: ReminderBundle) => {
    const mine = completableMembers(b, meId);
    try { await Promise.all(mine.map((m) => completeReminder(m.id))); await load(); } catch { setError('Could not complete reminder.'); }
  };
  const remove = (b: ReminderBundle) => {
    const n = b.members.length;
    Alert.alert('Delete reminder?', n > 1 ? `This removes it for all ${n} people.` : 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void (async () => {
        const results = await Promise.allSettled(b.members.map((m) => deleteReminder(m.id)));
        if (results.some((r) => r.status === 'rejected')) setError('Could not delete reminder. Only its creator can delete it.');
        await load();
      })(); } },
    ]);
  };
  // Edit opens the composer prefilled; saving updates every copy (one per assignee).
  const edit = (b: ReminderBundle) => {
    const selfCopy = b.members.find((m) => m.forId === meId);
    router.push({ pathname: '/reminder/new', params: { editIds: b.members.map((m) => m.id).join(','), editText: b.text, editDueAt: b.dueAt ?? '', editSelfId: selfCopy?.id ?? '' } });
  };
  const actions: Actions = { onComplete: (b) => void complete(b), onDelete: remove, onEdit: edit };

  const exportPdf = async (title: string, sections: PdfSection[]) => {
    if (exporting) return;
    setExporting(title);
    try { await shareReminderPdf(reminderPdfSpec(title, sections, authUser?.name)); }
    catch { showToast('Could not export the PDF'); }
    finally { setExporting(null); }
  };
  const busy = (title: string) => exporting === title;

  const lines = (list: ReminderBundle[], prefix = '') => list.map((b) => <BundleLine key={`${prefix}${b.key}`} b={b} meId={meId} branchLabel={branchLabelFor(b)} mentionNames={directoryNames} actions={actions} />);
  const empty = (message: string) => <Text style={styles.empty}>{message}</Text>;
  const branchTitle = (g: { branchName: string; branchCode: string }) => `${g.branchName}${g.branchCode && g.branchCode.toUpperCase() !== g.branchName.toUpperCase() ? ` · ${g.branchCode}` : ''}`;
  const userSections = (): PdfSection[] => userGroups.map((g) => sectionOf(g.userName, g.bundles));
  const branchSections = (): PdfSection[] => branchGroups.map((g) => sectionOf(branchTitle(g), g.bundles));

  const userGroupList = (prefix: string) => userGroups.length ? userGroups.map((g) => (
    <Group key={`${prefix}${g.userId}`} title={g.userName} count={g.tasks.length} overdueCount={g.tasks.filter(isOverdueReminder).length}
      busy={busy(`${g.userName} — Reminders`)} onExport={() => void exportPdf(`${g.userName} — Reminders`, [sectionOf(g.userName, g.bundles)])}>
      {lines(g.bundles, prefix)}
    </Group>
  )) : empty('No active user tasks available.');
  const branchGroupList = (prefix: string) => branchGroups.length ? branchGroups.map((g) => (
    <Group key={`${prefix}${g.branchId}`} title={branchTitle(g)} count={g.tasks.length} overdueCount={g.overdueCount}
      busy={busy(`${branchTitle(g)} — Reminders`)} onExport={() => void exportPdf(`${branchTitle(g)} — Reminders`, [sectionOf(branchTitle(g), g.bundles)])}>
      {lines(g.bundles, prefix)}
    </Group>
  )) : empty('No active branch tasks available.');

  return (
    <View style={styles.root}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />} contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 8, 26) }]}>
        <View style={styles.header}>
          <View style={styles.headerIcon}><CalendarDays size={19} color={colors.primary} /></View>
          <View style={styles.headerCopy}><Text style={styles.title}>Reminders</Text><Text style={styles.subtitle}>Plan, track and complete your work</Text></View>
          <Pressable accessibilityLabel="New reminder" onPress={() => router.push('/reminder/new')} style={styles.add}><Plus size={17} color="#fff" /><Text style={styles.addText}>New</Text></Pressable>
        </View>
        <View style={styles.grid}>
          {tabs.map(({ key, label, Icon, color }) => (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[styles.card, tab === key && { borderColor: color, backgroundColor: '#FFFFFF', borderWidth: 1.5 }]}>
              <View style={[styles.cardIcon, { backgroundColor: `${color}18` }]}><Icon size={17} color={color} /></View>
              <Text style={styles.count}>{counts[key]}</Text>
              <Text style={styles.cardText} numberOfLines={2}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.meta}>Loading reminders…</Text></View> : null}
        {error ? <Pressable onPress={() => void load()} style={styles.error}><Text style={{ color: colors.danger }}>{error} Tap to retry.</Text></Pressable> : null}

        {!loading && tab === 'myself' ? MY_SECTIONS.map((s) => (
          <View key={s.key}>
            <SectionHeader title={s.title} count={mySections[s.key].length} busy={busy(s.title)} onExport={() => void exportPdf(s.title, [sectionOf(s.title, mySections[s.key])])} />
            <View style={styles.list}>{mySections[s.key].length ? lines(mySections[s.key]) : empty(s.empty)}</View>
          </View>
        )) : null}

        {!loading && tab === 'users' ? (
          <>
            <SectionHeader title="User Wise Reminder" busy={busy('User Wise Reminder')} onExport={() => void exportPdf('User Wise Reminder', userSections())} />
            {userGroupList('')}
          </>
        ) : null}

        {!loading && tab === 'branches' ? (
          <>
            <SectionHeader title="Branch Wise Reminder" busy={busy('Branch Wise Reminder')} onExport={() => void exportPdf('Branch Wise Reminder', branchSections())} />
            {branchGroupList('')}
          </>
        ) : null}

        {!loading && tab === 'all' ? (
          <>
            <SectionHeader title="Today" count={todayBundles.length} busy={busy('Today')} onExport={() => void exportPdf('Today', [sectionOf('Today', todayBundles)])} />
            <View style={styles.list}>{todayBundles.length ? lines(todayBundles, 'today-') : empty('No active tasks due today.')}</View>
            <SectionHeader title="User Wise Tasks" busy={busy('User Wise Tasks')} onExport={() => void exportPdf('User Wise Tasks', userSections())} />
            {userGroupList('user-')}
            <SectionHeader title="Branch Wise Tasks" busy={busy('Branch Wise Tasks')} onExport={() => void exportPdf('Branch Wise Tasks', branchSections())} />
            {branchGroupList('branch-')}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.coolBg }, content: { paddingHorizontal: 14, paddingBottom: 36 }, header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }, headerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }, headerCopy: { flex: 1 }, title: { color: colors.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 }, subtitle: { color: colors.coolText, marginTop: 2, fontSize: 11.5 }, add: { minWidth: 66, height: 36, borderRadius: 10, paddingHorizontal: 10, backgroundColor: colors.primary, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' }, addText: { color: '#fff', fontSize: 12, fontWeight: '700' }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, card: { width: '48%', minHeight: 96, flexGrow: 1, backgroundColor: colors.card, borderRadius: 14, padding: 11, borderWidth: 1, borderColor: colors.coolDivider, justifyContent: 'space-between' }, cardIcon: { width: 29, height: 29, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, count: { color: colors.ink, fontSize: 21, fontWeight: '700', marginTop: 2 }, cardText: { color: colors.coolText, fontWeight: '600', fontSize: 11.5, lineHeight: 15 }, sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 7 }, section: { color: colors.ink, fontSize: 16, fontWeight: '700' }, sectionCount: { color: colors.coolText, fontSize: 13, fontWeight: '600' }, export: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 9, borderRadius: 8, backgroundColor: colors.primarySoft }, exportText: { color: colors.primaryDark, fontSize: 11.5, fontWeight: '700' }, list: { backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.coolDivider }, line: { minHeight: 70, flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.coolDivider }, task: { color: colors.ink, fontSize: 13.5, lineHeight: 18, fontWeight: '600' }, meta: { color: colors.coolText, fontSize: 11, marginTop: 2 }, due: { color: colors.coolText, fontSize: 11, marginTop: 2 }, people: { color: colors.coolText, fontSize: 11, marginTop: 2 }, branchTag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginTop: 5 }, branchText: { color: colors.primaryDark, fontSize: 10, fontWeight: '700' }, group: { backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.coolDivider, marginTop: 10 }, groupHead: { minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.coolMuted }, groupTitle: { color: colors.ink, fontSize: 13.5, fontWeight: '700' }, empty: { color: colors.coolText, textAlign: 'center', padding: 24, fontSize: 12.5 }, loading: { alignItems: 'center', gap: 8, padding: 34 }, error: { marginTop: 12, backgroundColor: '#FEF2F2', borderRadius: radius.md, padding: 11 } });

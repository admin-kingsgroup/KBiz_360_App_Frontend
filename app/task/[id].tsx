import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { Building2, CalendarDays, ChevronLeft, ExternalLink, Eye, EyeOff, FileText, Hourglass, MessageSquare, Paperclip, Pencil, Repeat, UserPlus, UserRoundPen, Users } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { addTaskAttachment, ensureTaskChat, getTask, historyAt, reassignTask, setTaskWatchers, type Task, type TaskHistoryItem } from '../../src/api/tasks';
import { ApiError } from '../../src/api/client';
import { humanSize, mediaUrl, uploadFile } from '../../src/api/media';
import { useAuthStore } from '../../src/store/authStore';
import { useAccessStore } from '../../src/store/accessStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useTasksStore } from '../../src/store/tasksStore';
import { useUiStore } from '../../src/store/uiStore';
import { ATTACHMENT_MAX_BYTES, dueLabel, historyLine, isOverdue, repeatLabel, STATUS_LABEL, taskChatButton } from '../../src/logic/taskRules';
import { OverdueFlag, PriorityPill, StatusPill, UnreadBadge } from '../../src/components/tasks/TaskPills';
import { StatusActions } from '../../src/components/tasks/StatusActions';
import { PeopleSheet } from '../../src/components/tasks/PeopleSheet';

// Task detail (spec 2026-11-16, section 7): every field, the status buttons this person may press,
// attachments, the full history and the task's chat. The server says what this person may do
// (`actions`, `canEdit`, `canReassign`, `myRole`) — the screen only draws it.

const when = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function Row({ Icon, label, children }: { Icon: typeof CalendarDays; label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.coolDivider }}>
      <Icon size={17} color={colors.coolText} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.coolText, fontSize: 11.5, fontWeight: '700' }}>{label}</Text>
        <View style={{ marginTop: 2 }}>{children}</View>
      </View>
    </View>
  );
}

export default function TaskDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const meId = useAuthStore((s) => s.user?.id) ?? '';
  const users = useAccessStore((s) => s.users);
  const showToast = useUiStore((s) => s.showToast);
  const [task, setTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<TaskHistoryItem[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<null | 'reassign' | 'watchers'>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await getTask(id);
      setTask(d.task);
      setHistory(d.history ?? []);
      setError('');
      useTasksStore.getState().upsert(d.task);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? 'This task is not available to you.' : 'Could not load the task. Pull down to retry.');
    }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  // Someone else changed this task while it is open here (socket 'task:update') → refetch.
  const touched = useTasksStore((s) => s.touched);
  useEffect(() => { if (touched.taskId === id && touched.at) void load(); }, [touched, id, load]);
  const changed = (t: Task): void => { setTask(t); void load(); void useTasksStore.getState().refreshBadge(meId); };

  const nameOf = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u.name]));
    return (uid: string): string | undefined => (uid === meId ? 'You' : map.get(uid));
  }, [users, meId]);

  const isMember = !!task && task.myRole !== 'viewer';
  const amWatcher = !!task && task.watchers.some((w) => w.id === meId);
  const isParty = !!task && (task.assignedTo.id === meId || task.assignedBy.id === meId);

  // The task's chat (owner, 2026-11-17): none comes with the task. The assigner, the assignee or a
  // watcher (owner, 2026-11-18) starts it while the task is open; closed or cancelled, it can only be
  // read (from here); a manager above who is not on the task sees "No chat yet" until one of them
  // starts it, or watches the task and starts it. See logic/taskRules.taskChatButton.
  const chatButton = task ? taskChatButton(task) : null;
  const openChat = async (): Promise<void> => {
    if (!task || !chatButton) return;
    if (chatButton.kind === 'none') return;
    if (chatButton.kind === 'read') { router.push({ pathname: '/task/chat', params: { id: task.id } }); return; }
    let chatId = task.chatId;
    if (chatButton.kind === 'start' || !chatId) {
      setBusy('chat');
      try { chatId = (await ensureTaskChat(task.id)).chatId; setTask({ ...task, chatId }); }
      catch (e) {
        showToast(e instanceof ApiError && e.message ? e.message : 'Could not start the chat');
        return;
      } finally { setBusy(null); }
    }
    // Make sure the chat is in my list (a chat started a moment ago is not loaded yet).
    await useMessagingStore.getState().loadConversations().catch(() => undefined);
    router.push({ pathname: '/chat/[id]', params: { id: chatId } });
  };

  const watch = async (on: boolean): Promise<void> => {
    if (!task) return;
    setBusy('watch');
    try {
      changed(await setTaskWatchers(task.id, on ? { add: [meId] } : { remove: [meId] }));
      showToast(on ? 'You are watching this task' : 'You stopped watching this task');
      if (on) void useMessagingStore.getState().loadConversations();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not change watching');
    } finally { setBusy(null); }
  };

  const toggleWatcher = async (uid: string): Promise<void> => {
    if (!task) return;
    const on = task.watchers.some((w) => w.id === uid);
    try { changed(await setTaskWatchers(task.id, on ? { remove: [uid] } : { add: [uid] })); }
    catch (e) { showToast(e instanceof ApiError ? e.message : 'Could not change watchers'); }
  };

  const reassign = async (uid: string): Promise<void> => {
    if (!task) return;
    setSheet(null);
    setBusy('reassign');
    try {
      changed(await reassignTask(task.id, { assignedTo: uid }));
      showToast(uid === meId ? 'The task is now yours' : `Reassigned to ${nameOf(uid) ?? 'them'}`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not reassign the task');
    } finally { setBusy(null); }
  };

  const addFile = async (kind: 'photo' | 'file'): Promise<void> => {
    if (!task) return;
    try {
      let file: { uri: string; name: string; mime: string; size: number } | null = null;
      if (kind === 'file') {
        const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
        if (r.canceled || !r.assets?.[0]) return;
        const a = r.assets[0];
        file = { uri: a.uri, name: a.name, mime: a.mimeType ?? 'application/octet-stream', size: a.size ?? 0 };
      } else {
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
        if (r.canceled || !r.assets[0]) return;
        const a = r.assets[0];
        let uri = a.uri;
        try { uri = (await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: Math.min(a.width || 1600, 1600) } }], { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG })).uri; } catch { /* original */ }
        file = { uri, name: a.fileName ?? 'photo.jpg', mime: 'image/jpeg', size: a.fileSize ?? 0 };
      }
      if (file.size > ATTACHMENT_MAX_BYTES) { showToast('Files can be up to 20 MB'); return; }
      setBusy('file');
      const up = await uploadFile({ uri: file.uri, name: file.name, mime: file.mime });
      changed(await addTaskAttachment(task.id, { url: up.url, name: up.name || file.name, size: up.size || file.size, mime: up.mime || file.mime }));
      showToast('File added');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not add the file');
    } finally { setBusy(null); }
  };

  if (!task) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
        <Header onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {error ? <Pressable onPress={() => void load()}><Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text></Pressable> : <ActivityIndicator color={colors.primary} />}
        </View>
      </SafeAreaView>
    );
  }

  const overdue = task.overdue || isOverdue(task);
  const biz = [task.companyName, task.branchName].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <Header onBack={() => router.back()} onEdit={task.canEdit ? () => router.push({ pathname: '/task/new', params: { id: task.id } }) : undefined} />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: overdue ? colors.dangerEdge : colors.coolDivider, padding: 14 }}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {overdue ? <OverdueFlag /> : null}
            <PriorityPill priority={task.priority} showNormal />
            <StatusPill status={task.status} />
          </View>
          <Text selectable style={{ color: colors.ink, fontSize: 19, fontWeight: '700', lineHeight: 25 }}>{task.title}</Text>
          {task.description ? <Text selectable style={{ color: colors.textBody, fontSize: 14, lineHeight: 20, marginTop: 8 }}>{task.description}</Text> : null}

          {task.status === 'date_change_requested' && task.requestedDueAt ? (
            <View style={{ marginTop: 12, backgroundColor: colors.warnSoft, borderRadius: 10, padding: 10 }}>
              <Text style={{ color: colors.warn, fontSize: 13, fontWeight: '700' }}>{task.assignedTo.id === meId ? 'You asked' : `${task.assignedTo.name} asked`} to move it to {when(task.requestedDueAt)}</Text>
            </View>
          ) : null}
          {task.status === 'waiting' && task.waitingOn ? (
            <View style={{ marginTop: 12, backgroundColor: colors.warnSoft, borderRadius: 10, padding: 10, flexDirection: 'row', gap: 8 }}>
              <Hourglass size={15} color={colors.warn} />
              <Text style={{ flex: 1, color: colors.warn, fontSize: 13, fontWeight: '600' }}>Waiting on: {task.waitingOn}</Text>
            </View>
          ) : null}

          {task.actions.length ? <View style={{ marginTop: 14 }}><StatusActions task={task} onChanged={changed} /></View> : null}
          {task.myRole === 'viewer' ? <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 12 }}>You can see this task because {task.assignedTo.name.split(' ')[0]} is in your team. {task.chatId ? 'Watch it to join its chat.' : 'Watch it to follow it.'}</Text> : null}
        </View>

        {/* The task's chat — Start chat / Open chat / View chat (read-only) / No chat yet. */}
        {chatButton ? (
          <Pressable onPress={() => void openChat()} disabled={busy === 'chat' || chatButton.kind === 'none'} accessibilityRole={chatButton.kind === 'none' ? 'text' : 'button'}
            style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: chatButton.kind === 'start' ? colors.primarySoft : colors.card, borderRadius: 14, borderWidth: 1, borderColor: chatButton.kind === 'start' ? colors.primary : colors.coolDivider, paddingHorizontal: 14, paddingVertical: 13 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: chatButton.kind === 'none' ? colors.coolMuted : chatButton.kind === 'start' ? colors.card : colors.primarySoft }}>
              {busy === 'chat' ? <ActivityIndicator size="small" color={colors.primary} /> : <MessageSquare size={18} color={chatButton.kind === 'none' ? colors.coolText3 : colors.primary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: chatButton.kind === 'none' ? colors.coolText : chatButton.kind === 'start' ? colors.primaryDark : colors.ink, fontSize: 15, fontWeight: '700' }}>{chatButton.label}</Text>
              <Text style={{ color: colors.coolText, fontSize: 12 }}>{chatButton.sub}</Text>
            </View>
            {chatButton.kind === 'open' ? <UnreadBadge count={task.unread} /> : null}
          </Pressable>
        ) : null}

        <View style={{ marginTop: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, paddingHorizontal: 14 }}>
          <Row Icon={UserRoundPen} label={task.isSelf ? 'FOR' : 'ASSIGNED TO'}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }}>{task.isSelf ? 'Myself (personal to-do)' : task.assignedTo.id === meId ? 'You' : task.assignedTo.name}</Text>
              {task.canReassign ? (
                <Pressable onPress={() => setSheet('reassign')} disabled={busy === 'reassign'} hitSlop={8}>
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>{busy === 'reassign' ? 'Reassigning…' : 'Reassign'}</Text>
                </Pressable>
              ) : null}
            </View>
          </Row>
          {!task.isSelf ? (
            <Row Icon={UserPlus} label="ASSIGNED BY">
              <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }}>{task.assignedBy.id === meId ? 'You' : task.assignedBy.name}</Text>
            </Row>
          ) : null}
          <Row Icon={CalendarDays} label="DUE">
            <Text style={{ color: overdue ? colors.danger : colors.ink, fontSize: 14.5, fontWeight: '600' }}>{dueLabel(task)}{overdue ? ' · overdue' : ''}</Text>
          </Row>
          {biz ? <Row Icon={Building2} label="BUSINESS / BRANCH"><Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }}>{biz}</Text></Row> : null}
          {/* A task given from the ERP's right-click menu (owner, 2026-11-16) points back at the screen it is about. */}
          {task.link ? (
            <Row Icon={ExternalLink} label={task.source === 'erp' ? 'FROM KBIZ BOOKS' : 'LINK'}>
              <Pressable onPress={() => void Linking.openURL(task.link!.url).catch(() => undefined)} hitSlop={6} accessibilityRole="link">
                <Text numberOfLines={2} style={{ color: colors.primary, fontSize: 14.5, fontWeight: '700' }}>{task.link.label}</Text>
                <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 1 }}>Opens the screen in KBiz Books</Text>
              </Pressable>
            </Row>
          ) : null}
          {task.repeat && task.repeat.kind !== 'none' ? <Row Icon={Repeat} label="REPEATS"><Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }}>{repeatLabel(task.repeat)}</Text></Row> : null}
          <Row Icon={Users} label="WATCHERS">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ flex: 1, color: task.watchers.length ? colors.ink : colors.coolText, fontSize: 14, fontWeight: '600' }}>{task.watchers.length ? task.watchers.map((w) => (w.id === meId ? 'You' : w.name)).join(', ') : 'No one'}</Text>
              {isParty ? <Pressable onPress={() => setSheet('watchers')} hitSlop={8}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>Change</Text></Pressable> : null}
            </View>
          </Row>
          {!isParty ? (
            <Pressable onPress={() => void watch(!amWatcher)} disabled={busy === 'watch'} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}>
              {amWatcher ? <EyeOff size={16} color={colors.primary} /> : <Eye size={16} color={colors.primary} />}
              <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>{busy === 'watch' ? 'Saving…' : amWatcher ? 'Stop watching' : 'Watch this task'}</Text>
            </Pressable>
          ) : <View style={{ height: 4 }} />}
        </View>

        {/* Attachments */}
        <View style={{ marginTop: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>Attachments{task.attachments.length ? `  ${task.attachments.length}` : ''}</Text>
            {busy === 'file' ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>
          {task.attachments.length === 0 ? <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 6 }}>No files yet.</Text> : null}
          {task.attachments.map((a, i) => (
            <Pressable key={`${a.url}-${i}`} onPress={() => void Linking.openURL(mediaUrl(a.url))} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: i === task.attachments.length - 1 ? 0 : 1, borderBottomColor: colors.coolDivider }}>
              <FileText size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13.5, fontWeight: '600' }}>{a.name}</Text>
                <Text style={{ color: colors.coolText, fontSize: 11.5 }}>{[a.size ? humanSize(a.size) : '', a.uploadedBy ? nameOf(a.uploadedBy) ?? '' : '', when(a.uploadedAt)].filter(Boolean).join(' · ')}</Text>
              </View>
            </Pressable>
          ))}
          {isMember ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Pressable onPress={() => void addFile('photo')} disabled={!!busy} style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted, borderRadius: 12, paddingVertical: 10 }}>
                <Paperclip size={15} color={colors.primary} /><Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>Add photo</Text>
              </Pressable>
              <Pressable onPress={() => void addFile('file')} disabled={!!busy} style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted, borderRadius: 12, paddingVertical: 10 }}>
                <FileText size={15} color={colors.primary} /><Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>Add file</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* History (audit): every change, who, when — nothing can be deleted. */}
        <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700', marginTop: 18, marginBottom: 8 }}>History</Text>
        <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider, paddingHorizontal: 14 }}>
          {history.length === 0 ? <Text style={{ color: colors.coolText, fontSize: 12.5, paddingVertical: 12 }}>Created {when(task.createdAt)}</Text> : null}
          {[...history].sort((a, b) => historyAt(b).localeCompare(historyAt(a))).map((h, i, arr) => (
            <View key={h.id ?? `${historyAt(h)}-${i}`} style={{ paddingVertical: 10, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: colors.coolDivider }}>
              <Text style={{ color: colors.ink, fontSize: 13.5 }}>
                <Text style={{ fontWeight: '700' }}>{h.userName ?? nameOf(h.userId) ?? 'Someone'}</Text>
                <Text style={{ color: colors.coolText }}> · </Text>
                {historyLine(h, nameOf)}
              </Text>
              {h.comment ? <Text style={{ color: colors.textBody, fontSize: 13, marginTop: 3, fontStyle: 'italic' }}>"{h.comment}"</Text> : null}
              <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 3 }}>{when(historyAt(h))}</Text>
            </View>
          ))}
        </View>
        <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 10, textAlign: 'center' }}>
          {STATUS_LABEL[task.status]}{task.acceptedAt ? ` · accepted ${when(task.acceptedAt)}` : ''}{task.closedAt ? ` · closed ${when(task.closedAt)}` : task.cancelledAt ? ` · cancelled ${when(task.cancelledAt)}` : ''}
        </Text>
      </ScrollView>

      <PeopleSheet visible={sheet === 'reassign'} title="Reassign to" subtitle="They get a notification; the task starts again as Assigned" meId={meId} myself
        exclude={[task.assignedTo.id]} onPick={(uid) => void reassign(uid)} onClose={() => setSheet(null)} />
      <PeopleSheet visible={sheet === 'watchers'} title="Watchers" subtitle="They can see the task and join its chat" meId={meId} multi
        exclude={[task.assignedTo.id, task.assignedBy.id]} selected={task.watchers.map((w) => w.id)}
        onToggle={(uid) => void toggleWatcher(uid)} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

function Header({ onBack, onEdit }: { onBack: () => void; onEdit?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 54 }}>
      <Pressable onPress={onBack} accessibilityLabel="Back" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
      <Text style={{ flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' }}>Task</Text>
      {onEdit ? (
        <Pressable onPress={onEdit} accessibilityLabel="Edit task" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 34, borderRadius: 999, backgroundColor: colors.primarySoft, marginRight: 8 }}>
          <Pencil size={14} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>Edit</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

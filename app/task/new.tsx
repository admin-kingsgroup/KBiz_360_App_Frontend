import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { Building2, CalendarDays, Camera, ChevronDown, Clock, FileText, Image as ImageIcon, Paperclip, Users, X } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { DaySheet, FormField, SheetSave, TimeSheet } from '../../src/components/forms';
import { PeopleSheet } from '../../src/components/tasks/PeopleSheet';
import { BranchSheet, branchLabel } from '../../src/components/tasks/BranchSheet';
import { colors } from '../../src/theme';
import { createTask, getTask, patchTask, type PatchTaskInput, type RepeatRule, type Task, type TaskPriority } from '../../src/api/tasks';
import { ApiError } from '../../src/api/client';
import { listUsers } from '../../src/api/directory';
import { humanSize, uploadFile } from '../../src/api/media';
import { useAuthStore } from '../../src/store/authStore';
import { useAccessStore } from '../../src/store/accessStore';
import { useDirectoryStore } from '../../src/store/directoryStore';
import { useTasksStore } from '../../src/store/tasksStore';
import { useUiStore } from '../../src/store/uiStore';
import { ATTACHMENT_MAX_BYTES, DEFAULT_DUE_TIME, DESCRIPTION_MAX, PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL, TITLE_MAX, dayKeyOf, hhmmOf, validateTaskForm } from '../../src/logic/taskRules';
import { formatTimeOfDay, type TimeOfDay } from '../../src/logic/reminderTime';

// New task / Edit task (spec 2026-11-16, sections 3 and 7). A task is for ONE person — someone else,
// or Myself for a personal to-do (what a reminder used to be). Anyone may give a task to anyone
// (decision 1). The due date is required and never in the past; the time defaults to 6 pm, which the
// server reads in the ASSIGNEE's time zone. Editing (assigner only, logged) changes the title,
// details, due date and time, priority, business/branch and repeat; the person is changed with
// Reassign on the task, and watchers there too.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayText = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};
// Today if 6 pm has not passed yet, else tomorrow.
const defaultDay = (now = new Date()): string => {
  const sixPm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DEFAULT_DUE_TIME.hour, DEFAULT_DUE_TIME.minute);
  return dayKeyOf(now.getTime() < sixPm.getTime() ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
};

interface PendingFile { uri: string; name: string; mime: string; size: number; isImage: boolean }

export default function TaskForm() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const meId = useAuthStore((s) => s.user?.id) ?? '';
  const users = useAccessStore((s) => s.users);
  const businesses = useDirectoryStore((s) => s.businesses);
  const branches = useDirectoryStore((s) => s.branches);
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const editing = !!editId;

  const [original, setOriginal] = useState<Task | null>(null);
  const [loadingTask, setLoadingTask] = useState(editing);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [watcherIds, setWatcherIds] = useState<string[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [day, setDay] = useState<string | null>(editing ? null : defaultDay());
  const [time, setTime] = useState<TimeOfDay | null>(null);
  const [repeat, setRepeat] = useState<RepeatRule>({ kind: 'none' });
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [sheet, setSheet] = useState<null | 'assignee' | 'watchers' | 'branch' | 'day' | 'time'>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  // Branch ids per person — the business/branch defaults to the assignee's first branch.
  const [branchesOf, setBranchesOf] = useState<Record<string, string[]>>({});

  useEffect(() => {
    void useDirectoryStore.getState().load();
    listUsers().then((list) => setBranchesOf(Object.fromEntries(list.map((u) => [u.id, u.branchIds ?? []])))).catch(() => undefined);
  }, []);

  // Edit: load the task and prefill.
  useEffect(() => {
    if (!editId) return;
    getTask(editId).then(({ task }) => {
      setOriginal(task);
      setTitle(task.title);
      setDescription(task.description ?? '');
      setAssignedTo(task.assignedTo.id);
      setBranchId(task.branchId);
      setCompanyId(task.companyId);
      setPriority(task.priority);
      setRepeat(task.repeat ?? { kind: 'none' });
      if (task.dueAt) {
        const d = new Date(task.dueAt);
        setDay(dayKeyOf(d));
        setTime({ hour: d.getHours(), minute: d.getMinutes() });
      }
    }).catch(() => setError('Could not load the task.')).finally(() => setLoadingTask(false));
  }, [editId]);

  // Picking the person fills the business/branch with theirs, until it is picked by hand.
  const branchPickedByHand = useRef(false);
  useEffect(() => {
    if (editing || branchPickedByHand.current || !assignedTo) return;
    const first = (branchesOf[assignedTo] ?? []).find((b) => branches.some((x) => x.id === b));
    if (first) {
      setBranchId(first);
      setCompanyId(branches.find((x) => x.id === first)?.companyId ?? null);
    }
  }, [assignedTo, branchesOf, branches, editing]);

  const personName = (id: string | null): string => {
    if (!id) return 'Choose who it is for';
    if (id === meId) return 'Myself';
    return users.find((u) => u.id === id)?.name ?? original?.assignedTo.name ?? 'Someone';
  };
  const assignee = users.find((u) => u.id === assignedTo);
  const isSelf = !!assignedTo && assignedTo === meId;
  const effectiveTime = time ?? DEFAULT_DUE_TIME;

  const attach = async (kind: 'library' | 'camera' | 'file'): Promise<void> => {
    try {
      if (kind === 'file') {
        const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
        if (r.canceled || !r.assets?.[0]) return;
        const a = r.assets[0];
        if ((a.size ?? 0) > ATTACHMENT_MAX_BYTES) { showToast('Files can be up to 20 MB'); return; }
        setFiles((f) => [...f, { uri: a.uri, name: a.name, mime: a.mimeType ?? 'application/octet-stream', size: a.size ?? 0, isImage: (a.mimeType ?? '').startsWith('image/') }]);
        return;
      }
      if (kind === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { showToast('Camera permission is needed to take photos'); return; }
      }
      const r = kind === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
      if (r.canceled || !r.assets[0]) return;
      const a = r.assets[0];
      let uri = a.uri;
      try {
        const out = await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: Math.min(a.width || 1600, 1600) } }], { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG });
        uri = out.uri;
      } catch { /* keep the original */ }
      setFiles((f) => [...f, { uri, name: a.fileName ?? `photo-${f.length + 1}.jpg`, mime: 'image/jpeg', size: a.fileSize ?? 0, isImage: true }]);
    } catch {
      showToast('Could not add that file');
    }
  };

  const save = async (): Promise<void> => {
    const problem = validateTaskForm({ title, description, assignedTo, branchId, dueDate: day, dueTime: time });
    // Editing an old reminder-made task without a date may keep it undated.
    const undatedEdit = editing && !day && !original?.dueAt;
    if (problem && !(undatedEdit && problem === 'Choose a due date')) { setError(problem); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const due = day ? { dueDate: day, dueTime: hhmmOf(effectiveTime) } : {};
      if (editing && original) {
        const patch: PatchTaskInput = {};
        if (title.trim() !== original.title) patch.title = title.trim();
        if (description !== (original.description ?? '')) patch.description = description;
        if (priority !== original.priority) patch.priority = priority;
        if (branchId && branchId !== original.branchId) { patch.branchId = branchId; patch.companyId = companyId; }
        if (JSON.stringify(repeat) !== JSON.stringify(original.repeat ?? { kind: 'none' })) patch.repeat = repeat;
        if (day) {
          const [y, m, d] = day.split('-').map(Number);
          const local = new Date(y, m - 1, d, effectiveTime.hour, effectiveTime.minute);
          const was = original.dueAt ? new Date(original.dueAt).getTime() : null;
          if (was !== local.getTime()) Object.assign(patch, due);
        }
        if (!Object.keys(patch).length) { router.back(); return; }
        const updated = await patchTask(original.id, patch);
        useTasksStore.getState().upsert(updated);
        showToast('Task updated');
        router.back();
        return;
      }
      // Files go up first; if one fails nothing is saved, so the task never lands without them.
      const attachments = [];
      for (const f of files) {
        const up = await uploadFile({ uri: f.uri, name: f.name, mime: f.mime });
        attachments.push({ url: up.url, name: up.name || f.name, size: up.size || f.size, mime: up.mime || f.mime });
      }
      const created = await createTask({
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        assignedTo: assignedTo as string,
        ...(watcherIds.length ? { watcherIds } : {}),
        branchId: branchId as string,
        ...(companyId ? { companyId } : {}),
        priority,
        ...due,
        ...(repeat.kind !== 'none' ? { repeat } : {}),
        ...(attachments.length ? { attachments } : {}),
      });
      void useTasksStore.getState().refreshBadge(meId);
      showToast(isSelf ? 'Added to your tasks' : `Task given to ${personName(assignedTo)}`);
      router.replace({ pathname: '/task/[id]', params: { id: created.id } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the task. Check your connection and try again.');
      savingRef.current = false;
      setSaving(false);
    }
  };

  const watcherNames = useMemo(() => watcherIds.map((id) => personName(id).split(' ')[0]).join(', '), [watcherIds, users]); // eslint-disable-line react-hooks/exhaustive-deps

  const fieldBox = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 };

  if (loadingTask) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 19, fontWeight: '700' }}>{editing ? 'Edit task' : 'New task'}</Text>
        <Pressable onPress={() => router.back()} accessibilityLabel="Close" style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={16} color={colors.coolText} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        <FormField label="Title" required hint={`${title.trim().length}/${TITLE_MAX}`}>
          <TextInput value={title} onChangeText={(v) => { setTitle(v); if (error) setError(''); }} placeholder="What needs doing?" placeholderTextColor={colors.coolText3}
            maxLength={TITLE_MAX + 20}
            style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.ink }} />
        </FormField>

        <FormField label="Details" hint={description.length > DESCRIPTION_MAX - 200 ? `${description.length}/${DESCRIPTION_MAX.toLocaleString('en-US')}` : 'Optional'}>
          <TextInput value={description} onChangeText={setDescription} placeholder="Anything they need to know" placeholderTextColor={colors.coolText3} multiline
            maxLength={DESCRIPTION_MAX}
            style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14.5, color: colors.ink, minHeight: 84, textAlignVertical: 'top' }} />
        </FormField>

        {editing ? (
          <FormField label="For" hint="To give it to someone else, use Reassign on the task.">
            <View style={[fieldBox, { opacity: 0.8 }]}><Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{personName(assignedTo)}</Text></View>
          </FormField>
        ) : (
          <>
            <FormField label="For" required hint={isSelf ? 'A personal to-do — it starts as Accepted, and Done closes it.' : 'One person. They get a notification and a chat for the task opens.'}>
              <Pressable onPress={() => setSheet('assignee')} style={fieldBox}>
                {assignedTo ? <Avatar initials={isSelf ? 'Me' : assignee?.initials ?? '?'} color={isSelf ? colors.primary : assignee?.color ?? colors.blue} size={30} uri={isSelf ? null : assignee?.avatar ?? null} /> : null}
                <Text style={{ flex: 1, color: assignedTo ? colors.ink : colors.coolText, fontSize: 15, fontWeight: '600' }}>{personName(assignedTo)}</Text>
                <ChevronDown size={18} color={colors.coolText} />
              </Pressable>
            </FormField>
            <FormField label="Watchers" hint="Optional — they can see the task and join its chat.">
              <Pressable onPress={() => setSheet('watchers')} style={fieldBox}>
                <Users size={17} color={colors.primary} />
                <Text numberOfLines={1} style={{ flex: 1, color: watcherIds.length ? colors.ink : colors.coolText, fontSize: 14.5, fontWeight: '600' }}>{watcherIds.length ? watcherNames : 'Add watchers'}</Text>
                <ChevronDown size={18} color={colors.coolText} />
              </Pressable>
            </FormField>
          </>
        )}

        <FormField label="Business / branch" required>
          <Pressable onPress={() => setSheet('branch')} style={fieldBox}>
            <Building2 size={17} color={colors.primary} />
            <Text numberOfLines={1} style={{ flex: 1, color: branchId ? colors.ink : colors.coolText, fontSize: 14.5, fontWeight: '600' }}>{branchLabel(branchId, { businesses, branches }) || original?.branchName || 'Choose business or branch'}</Text>
            <ChevronDown size={18} color={colors.coolText} />
          </Pressable>
        </FormField>

        <FormField label="Priority" required>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {PRIORITIES.map((p) => {
              const on = priority === p;
              return (
                <Pressable key={p} onPress={() => setPriority(p)} style={{ flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? PRIORITY_COLOR[p] : colors.coolMuted }}>
                  <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13.5, fontWeight: '700' }}>{PRIORITY_LABEL[p]}</Text>
                </Pressable>
              );
            })}
          </View>
        </FormField>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1.4 }}>
            <FormField label="Due date" required>
              <Pressable onPress={() => setSheet('day')} style={fieldBox}>
                <CalendarDays size={17} color={colors.primary} />
                <Text numberOfLines={1} style={{ flex: 1, color: day ? colors.ink : colors.coolText, fontSize: 14, fontWeight: '600' }}>{day ? dayText(day) : 'Choose date'}</Text>
              </Pressable>
            </FormField>
          </View>
          <View style={{ flex: 1 }}>
            <FormField label="Time">
              <Pressable onPress={() => setSheet('time')} style={fieldBox}>
                <Clock size={17} color={colors.primary} />
                <Text style={{ flex: 1, color: colors.ink, fontSize: 14, fontWeight: '600' }}>{formatTimeOfDay(effectiveTime)}</Text>
              </Pressable>
            </FormField>
          </View>
        </View>
        <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: -6, marginBottom: 12 }}>
          {isSelf ? 'You get an alert the day before, 2 hours before, and when it is due.' : 'In their time zone (6 pm unless you pick a time). They are alerted before and when it is due.'}
        </Text>

        <FormField label="Repeat">
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {(['none', 'daily', 'weekly', 'monthly'] as const).map((k) => {
              const on = repeat.kind === k;
              const label = k === 'none' ? 'None' : k === 'daily' ? 'Daily' : k === 'weekly' ? 'Weekly' : 'Monthly';
              return (
                <Pressable key={k} onPress={() => {
                  if (k === 'weekly') { const wd = day ? new Date(`${day}T12:00:00`).getDay() : new Date().getDay(); setRepeat({ kind: 'weekly', days: [wd] }); }
                  else if (k === 'monthly') setRepeat({ kind: 'monthly', dayOfMonth: day ? Number(day.slice(8, 10)) : new Date().getDate() });
                  else setRepeat({ kind: k } as RepeatRule);
                }} style={{ paddingHorizontal: 14, height: 36, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? colors.primary : colors.coolMuted }}>
                  <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13, fontWeight: '700' }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {repeat.kind === 'weekly' ? (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              {WEEKDAYS.map((w, i) => {
                const on = repeat.days.includes(i);
                return (
                  <Pressable key={w} onPress={() => setRepeat({ kind: 'weekly', days: on ? repeat.days.filter((d) => d !== i) : [...repeat.days, i].sort() })}
                    style={{ flex: 1, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primarySoft : colors.coolMuted, borderWidth: on ? 1 : 0, borderColor: colors.primary }}>
                    <Text style={{ color: on ? colors.primaryDark : colors.coolText, fontSize: 11.5, fontWeight: '700' }}>{w}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {repeat.kind === 'monthly' ? (
            <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 8 }}>On day {repeat.dayOfMonth} of every month (the last day in shorter months).</Text>
          ) : null}
          {repeat.kind !== 'none' ? <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 4 }}>The next copy is made when this one is closed, or when its date comes.</Text> : null}
        </FormField>

        {!editing ? (
          <FormField label="Attachments" hint="Optional — photos, PDFs or Excel files up to 20 MB. You can add more on the task or in its chat.">
            {files.map((f, i) => (
              <View key={`${f.uri}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.coolDivider, padding: 8, marginBottom: 6 }}>
                {f.isImage ? <Image source={{ uri: f.uri }} style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: colors.coolMuted }} /> : <View style={{ width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }}><FileText size={18} color={colors.primary} /></View>}
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13.5, fontWeight: '600' }}>{f.name}</Text>
                  {f.size ? <Text style={{ color: colors.coolText, fontSize: 11.5 }}>{humanSize(f.size)}</Text> : null}
                </View>
                <Pressable accessibilityLabel={`Remove ${f.name}`} onPress={() => setFiles((list) => list.filter((_, j) => j !== i))} hitSlop={8} style={{ padding: 6 }}><X size={15} color={colors.coolText} /></Pressable>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([['library', 'Photos', ImageIcon], ['camera', 'Camera', Camera], ['file', 'File', Paperclip]] as const).map(([k, label, Icon]) => (
                <Pressable key={k} onPress={() => void attach(k)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.coolMuted, borderRadius: 12, paddingVertical: 11 }}>
                  <Icon size={16} color={colors.primary} />
                  <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '600' }}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </FormField>
        ) : null}

        {error ? <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600', marginBottom: 10 }}>{error}</Text> : null}
        <SheetSave label={saving ? 'Saving…' : editing ? 'Save changes' : isSelf ? 'Add to my tasks' : 'Give task'} disabled={saving || !title.trim()} onPress={() => void save()} />
      </ScrollView>

      <PeopleSheet visible={sheet === 'assignee'} title="Who is it for?" subtitle="One person — or yourself for a personal to-do" meId={meId} myself
        selected={assignedTo ? [assignedTo] : []} onPick={(id) => { setAssignedTo(id); setWatcherIds((w) => w.filter((x) => x !== id)); setSheet(null); if (error) setError(''); }} onClose={() => setSheet(null)} />
      <PeopleSheet visible={sheet === 'watchers'} title="Watchers" subtitle="They can see the task and join its chat" meId={meId} multi
        exclude={assignedTo ? [assignedTo] : []} selected={watcherIds}
        onToggle={(id) => setWatcherIds((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]))} onClose={() => setSheet(null)} />
      <BranchSheet visible={sheet === 'branch'} selected={branchId}
        onPick={(p) => { if (p) { branchPickedByHand.current = true; setBranchId(p.branchId); setCompanyId(p.companyId); } setSheet(null); if (error) setError(''); }} onClose={() => setSheet(null)} />
      <DaySheet visible={sheet === 'day'} title="Due date" initial={day} minDay={dayKeyOf(new Date())}
        maxDay={dayKeyOf(new Date(new Date().getFullYear() + 2, 11, 31))}
        onClose={() => setSheet(null)} onConfirm={(d) => { setDay(d); setSheet(null); if (error) setError(''); }} />
      <TimeSheet visible={sheet === 'time'} day={day} initial={effectiveTime} onClose={() => setSheet(null)} onConfirm={(t) => { setTime(t); setSheet(null); if (error) setError(''); }} />
    </SafeAreaView>
  );
}

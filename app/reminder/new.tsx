import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, FlatList, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { X, CalendarDays, Clock, ChevronDown, Search as SearchIcon, Check, Camera, Image as ImageIcon } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { DaySheet, FormField, SheetSave, TimeSheet } from '../../src/components/forms';
import { colors } from '../../src/theme';
import { createReminder, deleteReminder, updateReminder } from '../../src/api/reminders';
import { ApiError } from '../../src/api/client';
import { listUsers, type DirectoryUser } from '../../src/api/directory';
import { mediaUrl, uploadFile } from '../../src/api/media';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useAccessStore } from '../../src/store/accessStore';
import { scheduleLocal } from '../../src/services/notifications';
import { rememberReminderLocal, cancelReminderLocal } from '../../src/services/notifications/reminderLocal';
import { useUiStore } from '../../src/store/uiStore';
import { secondsUntil } from '../../src/logic/reminderWhen';
import { activeMention, applyMention, rankMentionMatches } from '../../src/logic/mentions';
import { decodeEditMembers, planReminderEdit, type EditMember } from '../../src/logic/reminderEdit';
import type { ReminderRecord } from '../../src/data/reminders';
import { dueAtFor, formatTimeOfDay, isPastTime, timeOfDue, type TimeOfDay } from '../../src/logic/reminderTime';

// Reminder composer (modal). The due date is optional and picked as a calendar day; a time of day is
// optional on top (owner 2026-10-18). Without a time, dueAt is the end of that day (23:59 local).
const PALETTE = [colors.purple, colors.blue, colors.teal, colors.orange, colors.coral, colors.primary];
const colorFor = (id: string): string => PALETTE[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
const dayKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateLabel = (day: string): string => dueAtFor(day, null).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

interface Person { id: string; name: string; initials: string; color: string; avatar?: string | null; role?: string }

export default function NewReminder() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const meId = useMessagingStore((s) => s.myUserId) ?? '';
  const me = useAccessStore((s) => s.user);

  // Edit mode (creator only — the card only offers it to the creator, and the server enforces it):
  // the same composer opens prefilled. The Reminders screen edits a whole reminder at once:
  // `editMembers` carries every per-assignee copy (JSON: id, forId, forName, groupId) and `editImage`
  // the picture on it. Owner 2026-10-18: the edit shows WHO it is for and the picture, and both can be
  // changed — ticking a person adds their copy, unticking removes it (see logic/reminderEdit).
  // `editIds` (comma list) + `editSelfId`, and `editId` + `editForId`, are the older forms; without
  // the copies' people the For row stays hidden there.
  const { editId, editIds, editText, editDueAt, editForId, editSelfId, editMembers, editImage } = useLocalSearchParams<{ editId?: string; editIds?: string; editText?: string; editDueAt?: string; editForId?: string; editSelfId?: string; editMembers?: string; editImage?: string }>();
  const members = useMemo<EditMember[]>(() => {
    const list = decodeEditMembers(editMembers);
    if (list.length) return list;
    return editId && editForId ? [{ id: editId, forId: editForId }] : [];
  }, [editMembers, editId, editForId]);
  const idsToEdit = useMemo(() => (members.length ? members.map((m) => m.id) : editIds ? editIds.split(',').filter(Boolean) : editId ? [editId] : []), [members, editIds, editId]);
  const editing = idsToEdit.length > 0;
  const canEditPeople = editing && members.length > 0;
  const originalImage = editing && editImage ? editImage : null;
  const editInitialDue = useMemo(() => {
    if (!editDueAt) return null;
    const d = new Date(editDueAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [editDueAt]);

  const myself: Person = { id: meId, name: 'Myself', initials: initialsOf(me?.name ?? 'Me'), color: colors.primary, avatar: me?.avatar ?? null };
  const [people, setPeople] = useState<Person[]>([myself]);
  const [peopleError, setPeopleError] = useState(false);
  // Nobody is pre-selected (owner 2026-10-07): the person writing picks Myself or others. A pinned
  // default also doubled every "@Name …" reminder — the mention ADDED Name next to the default Myself.
  // Editing starts from the people it is already for.
  const [forIds, setForIds] = useState<string[]>(() => (canEditPeople ? [...new Set(members.map((m) => m.forId))] : []));
  const [text, setText] = useState(editing ? (editText ?? '') : '');
  // A NEW reminder is due today unless the writer picks another day (owner 2026-10-07); past days
  // are greyed out in the picker (minDay = today). Editing keeps the stored date, or none.
  const [selectedDay, setSelectedDay] = useState<string | null>(editing ? (editInitialDue ? dayKey(editInitialDue) : null) : dayKey(new Date()));
  // Optional time of day (owner 2026-10-18). None = due by the end of the day (23:59), as before.
  const [selectedTime, setSelectedTime] = useState<TimeOfDay | null>(editing && editInitialDue ? timeOfDue(editInitialDue) : null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [personQuery, setPersonQuery] = useState('');
  // Optional picture (photo library or camera). Compressed when picked, uploaded on save and
  // sent as imageUrl — the same field a KBiz Books screenshot lands in. New reminders only.
  const [photo, setPhoto] = useState<{ uri: string; name: string } | null>(null);
  // Editing: the picture already on the reminder (stored url) until it is removed (null).
  const [keptImage, setKeptImage] = useState<string | null>(originalImage);
  const [saving, setSaving] = useState(false);
  // Two rapid taps can both read `saving === false` before React re-renders — the ref is the
  // synchronous guard against creating the reminder twice; the state just drives the button label.
  const savingRef = useRef(false);
  const [cursor, setCursor] = useState(0);
  // Set ONLY right after a mention is inserted, to place the caret; released on the next
  // selection event so the field stays uncontrolled (a permanently controlled selection fights
  // the Android keyboard).
  const [sel, setSel] = useState<{ start: number; end: number } | undefined>(undefined);
  // Picking a suggestion closes the list and the fields below jump up under the finger; a second tap
  // (or the tail of the first) then opened the date sheet (owner's video 2026-10-17). Taps on the
  // fields below are ignored for a moment after a pick.
  const mentionPickedAt = useRef(0);
  const settled = (): boolean => Date.now() - mentionPickedAt.current > 450;

  // Load the real directory for the assignee picker ("Myself" stays pinned first).
  useEffect(() => {
    listUsers()
      .then((users: DirectoryUser[]) => {
        const others = users
          .filter((u) => u.id !== meId)
          .map((u) => ({ id: u.id, name: u.name, initials: initialsOf(u.name), color: colorFor(u.id), avatar: u.avatar ? mediaUrl(u.avatar) : null, role: u.position ?? undefined }));
        setPeople([{ ...myself, name: 'Myself' }, ...others]);
        setPeopleError(false);
      })
      .catch(() => setPeopleError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  // The chosen day at the chosen time, or at 23:59 when no time is set.
  const dueAt = useMemo(() => selectedDay ? dueAtFor(selectedDay, selectedTime) : null, [selectedDay, selectedTime]);
  const whenLabel = selectedDay ? `${dateLabel(selectedDay)}${selectedTime ? ` · ${formatTimeOfDay(selectedTime)}` : ''}` : '';
  // A time already gone by today can't be saved — unless an edit leaves the stored moment as it was.
  const timePassed = !!(selectedDay && selectedTime && isPastTime(selectedDay, selectedTime)) && dueAt?.getTime() !== editInitialDue?.getTime();
  // A person on the reminder who is not in the directory any more still shows, by the name it carries.
  const memberPerson = (id: string): Person | undefined => {
    const m = members.find((x) => x.forId === id);
    if (!m) return undefined;
    const name = id === meId ? 'Myself' : m.forName || 'Unknown';
    return { id, name, initials: initialsOf(m.forName || name), color: colorFor(id) };
  };
  const selectedPeople = forIds.map((id) => people.find((p) => p.id === id) ?? memberPerson(id)).filter((p): p is Person => !!p);
  const firstSelected: Person = selectedPeople[0] ?? { id: '', name: 'Choose people', initials: '+', color: colors.coolText3 };
  const firstNames = selectedPeople.map((p) => (p.id === meId ? 'Myself' : p.name.split(' ')[0]));
  const forLabel = firstNames.length === 0 ? 'Choose people'
    : firstNames.length <= 2 ? firstNames.join(', ')
    : `${firstNames.slice(0, 2).join(', ')} +${firstNames.length - 2}`;
  const toggleFor = (id: string): void =>
    setForIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const filteredPeople = useMemo(() => {
    const q = personQuery.trim().toLowerCase();
    return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  }, [people, personQuery]);

  // ── @-mentions ──
  // Typing "@" in the reminder text opens a people list; picking someone writes their name into
  // the sentence AND adds them to the assignees (mention several people → all of them get it).
  // The "For" row below stays the single source of truth and shows everyone selected.
  // Self reads as "Myself" in the For picker, but a mention must insert the real name.
  const mentionPeople = useMemo(
    () => people.map((p) => (p.id === meId ? { ...p, name: me?.name || 'Me' } : p)),
    [people, meId, me?.name],
  );
  // The caret can arrive before the new text (iOS); clamped, the list no longer flickers shut mid-word.
  const mention = activeMention(text, Math.min(cursor, text.length));
  const mentionMatches = mention ? rankMentionMatches(mentionPeople, mention.query) : [];
  const pickMention = (p: Person): void => {
    if (!mention) return;
    const next = applyMention(text, mention, p.name);
    setText(next.text);
    setCursor(next.cursor);
    setSel({ start: next.cursor, end: next.cursor });
    setForIds((cur) => (cur.includes(p.id) ? cur : [...cur, p.id]));
    mentionPickedAt.current = Date.now();
  };

  const attach = async (a: ImagePicker.ImagePickerAsset): Promise<void> => {
    let uri = a.uri;
    try {
      const out = await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: Math.min(a.width || 1280, 1280) } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
      uri = out.uri;
    } catch { /* fall back to original */ }
    setPhoto({ uri, name: a.fileName ?? 'photo.jpg' });
  };
  const pickPhoto = async (): Promise<void> => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (r.canceled || !r.assets[0]) return;
    await attach(r.assets[0]);
  };
  const takePhoto = async (): Promise<void> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { showToast('Camera permission is needed to take photos'); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (r.canceled || !r.assets[0]) return;
    await attach(r.assets[0]);
  };

  const save = async () => {
    if (!text.trim()) { showToast('Add reminder text'); return; }
    if ((!editing || canEditPeople) && !forIds.length) { showToast('Choose at least one person'); return; }
    if (timePassed) { showToast('That time has already gone by — pick a later time'); return; }
    const due = dueAt;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    // The picture goes up first; if that fails nothing is saved, so the reminder never lands
    // without the picture the user attached — they can retry or remove it and save without.
    let imageUrl: string | undefined;
    if (photo) {
      try {
        imageUrl = (await uploadFile({ uri: photo.uri, name: photo.name, mime: 'image/jpeg' })).url;
      } catch {
        showToast('Could not upload the attachment — try again or remove it');
        savingRef.current = false;
        setSaving(false);
        return;
      }
    }
    if (editing) {
      try {
        const label = whenLabel;
        // Clear date (owner 2026-10-18): a reminder that had a date and now has none sends dueAt null.
        const dated = due && label ? { when: label, dueAt: due.toISOString() } : {};
        const clearing = !due && !!editInitialDue;
        const plan = canEditPeople ? planReminderEdit(members, forIds) : null;
        // Picture: a new one replaces it, removing the shown one clears it, otherwise untouched.
        const finalImage = imageUrl ?? keptImage;
        const imagePatch = imageUrl ? { imageUrl } : originalImage && !keptImage ? { imageUrl: null } : {};
        const kept = { text: text.trim(), ...dated, ...imagePatch, ...(plan?.peopleChanged ? { groupId: plan.groupId } : {}) };
        const patch = clearing ? { ...kept, dueAt: null } : kept;
        const keepIds = plan ? plan.keep.map((m) => m.id) : idsToEdit;
        // A server from before 2026-10-18 rejects dueAt null: save everything else and keep the date.
        let dateKept = false;
        const patchCopy = async (id: string) => {
          try { return await updateReminder(id, patch); } catch (e) {
            if (!clearing || !(e instanceof ApiError) || e.status !== 400) throw e;
            dateKept = true;
            return updateReminder(id, kept);
          }
        };
        const updated = await Promise.all(keepIds.map(patchCopy));
        // New people get their own copy IN the same reminder; removed people's copies go last, after
        // the server has checked the group against them.
        const created: ReminderRecord[] = plan?.add.length
          ? await createReminder({ text: text.trim(), forIds: plan.add, ...dated, ...(finalImage ? { imageUrl: finalImage } : {}), section: 'today', groupId: plan.groupId })
          : [];
        await Promise.all((plan?.remove ?? []).map((m) => deleteReminder(m.id)));
        // My own copy fires a local alarm: move it, arm it (I was added) or drop it (I was removed).
        const selfId = plan ? plan.keep.find((m) => m.forId === meId)?.id : editSelfId || (editId && editForId && editForId === meId ? editId : '');
        if (selfId) {
          await cancelReminderLocal(selfId);
          if (due) void scheduleLocal('⏰ Reminder', text.trim(), { type: 'reminder', id: selfId }, secondsUntil(due)).then((notifId) => rememberReminderLocal(selfId, notifId));
        }
        const mineAdded = created.find((r) => r.forId === meId);
        if (mineAdded && due) void scheduleLocal('⏰ Reminder', text.trim(), { type: 'reminder', id: mineAdded.id }, secondsUntil(due)).then((notifId) => rememberReminderLocal(mineAdded.id, notifId));
        const mineRemoved = plan?.remove.find((m) => m.forId === meId);
        if (mineRemoved) await cancelReminderLocal(mineRemoved.id);
        // A server without the 2026-10-18 update drops the picture change and the group silently.
        const serverBehind = dateKept || ('imageUrl' in imagePatch && updated.some((u) => (u.reminder?.image ?? null) !== (finalImage ?? null)))
          || created.some((r) => !r.groupId);
        showToast(serverBehind ? 'Saved — clearing the date, the picture or new people need the latest server update'
          : `Reminder updated${plan?.peopleChanged ? ` for ${forLabel}` : ''}${label ? ` · ${label}` : ''}`);
        router.back();
      } catch {
        showToast('Could not update reminder');
        savingRef.current = false;
        setSaving(false);
      }
      return;
    }
    try {
      const label = whenLabel;
      const recs = await createReminder({ text: text.trim(), forIds, ...(due && label ? { when: label, dueAt: due.toISOString() } : {}), ...(imageUrl ? { imageUrl } : {}), section: 'today' });
      // My own copy also fires locally at the due time (works offline; the server push is the
      // backup). Remember the notification id so completing the reminder can cancel it.
      const mine = recs.find((r) => r.forId === meId);
      if (mine && due) {
        void scheduleLocal('⏰ Reminder', mine.text ?? '', { type: 'reminder', id: mine.id }, secondsUntil(due))
          .then((notifId) => rememberReminderLocal(mine.id, notifId));
      }
      const onlySelf = forIds.length === 1 && forIds[0] === meId;
      showToast(onlySelf ? (label ? `Reminder set · ${label}` : 'Reminder set') : (label ? `Reminder set for ${forLabel} · ${label}` : `Reminder set for ${forLabel}`));
      router.back();
    } catch {
      showToast('Could not save reminder');
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <View className="flex-row items-center justify-between px-5 pt-3 pb-3">
        <Text style={{ color: colors.ink, fontSize: 19, fontWeight: '700' }}>{editing ? 'Edit reminder' : 'New reminder'}</Text>
        <Pressable onPress={() => router.back()} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={16} color={colors.coolText} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <FormField label="Reminder" required hint={!editing ? 'Type @ to mention someone — it assigns the reminder to them.'
          : canEditPeople ? 'Type @ to add someone — they show under For below.'
          : idsToEdit.length > 1 ? `Edit the reminder or due date — it changes for all ${idsToEdit.length} people.` : 'Edit the reminder or due date.'}>
          <TextInput value={text} onChangeText={setText} placeholder="What needs doing? Type @ to assign" placeholderTextColor={colors.coolText3} multiline
            selection={sel}
            onSelectionChange={(e) => { setCursor(e.nativeEvent.selection.start); if (sel) setSel(undefined); }}
            style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: colors.ink, minHeight: 72, textAlignVertical: 'top' }} />
          {/* Mention suggestions — inline under the field, so the keyboard never covers them. */}
          {mention && mentionMatches.length > 0 ? (
            <View style={{ marginTop: 6, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>
              {mentionMatches.map((p, i) => (
                <Pressable key={p.id} onPress={() => pickMention(p)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-2.5"
                  style={{ paddingHorizontal: 12, paddingVertical: 11, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.coolDivider }}>
                  <Avatar initials={p.initials} color={p.color} size={30} uri={p.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{p.name}</Text>
                    {p.role ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 11.5 }}>{p.role}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </FormField>

        {/* Assignees — current picks + tap to open the searchable multi-select sheet. Shown while
            editing too (owner 2026-10-18), prefilled with the people it is already for. */}
        {editing && !canEditPeople ? null : (
        <FormField label="For" hint={peopleError ? 'Could not load your team — pull down to retry, or save it for yourself.'
          : editing ? 'Tap to add or remove people — someone you add gets their own copy and a notification.'
          : 'You can pick more than one person — each gets their own copy.'}>
          <Pressable onPress={() => { if (!settled()) return; setPersonQuery(''); setAssigneeOpen(true); }} className="flex-row items-center gap-2.5"
            style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 }}>
            <Avatar initials={firstSelected.initials} color={firstSelected.color} size={32} uri={firstSelected.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{forLabel}</Text>
              {selectedPeople.length === 1 && firstSelected.role ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{firstSelected.role}</Text> : null}
            </View>
            <ChevronDown size={18} color={colors.coolText} />
          </Pressable>
        </FormField>
        )}

        <FormField label="Due date" hint="Today by default — pick a later day if it can wait. Past days can't be chosen.">
          <Pressable onPress={() => { if (settled()) setPickerOpen(true); }} className="flex-row items-center gap-2"
            style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
            <CalendarDays size={17} color={colors.primary} />
            <Text style={{ flex: 1, color: selectedDay ? colors.ink : colors.coolText, fontSize: 14, fontWeight: '600' }}>{selectedDay ? dateLabel(selectedDay) : 'Choose date'}</Text>
            <ChevronDown size={18} color={colors.coolText} />
          </Pressable>
          {selectedDay ? <Pressable onPress={() => { if (!settled()) return; setSelectedDay(null); setSelectedTime(null); }} hitSlop={8} style={{ alignSelf: 'flex-start', paddingTop: 8 }}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Clear date</Text></Pressable> : null}
          {selectedDay ? <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 6 }}>Due {whenLabel}</Text> : null}
        </FormField>

        {/* Optional time on the due day — the "⏰ Reminder" push and my local alarm fire at it. */}
        {selectedDay ? (
        <FormField label="Time" hint="Optional — without a time it is due by the end of the day.">
          <Pressable onPress={() => { if (settled()) setTimeOpen(true); }} className="flex-row items-center gap-2"
            style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
            <Clock size={17} color={colors.primary} />
            <Text style={{ flex: 1, color: selectedTime ? colors.ink : colors.coolText, fontSize: 14, fontWeight: '600' }}>{selectedTime ? formatTimeOfDay(selectedTime) : 'Add a time'}</Text>
            <ChevronDown size={18} color={colors.coolText} />
          </Pressable>
          {selectedTime ? <Pressable onPress={() => { if (settled()) setSelectedTime(null); }} hitSlop={8} style={{ alignSelf: 'flex-start', paddingTop: 8 }}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Remove time</Text></Pressable> : null}
          {timePassed ? <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '600', marginTop: 6 }}>That time has already gone by — pick a later time.</Text> : null}
        </FormField>
        ) : null}

        {/* Optional picture — while editing it shows the one already on the reminder, which can be
            removed and replaced (owner 2026-10-18). */}
        <FormField label="Attachment" hint={editing ? 'Add, change or remove the picture — tap × to remove it, then pick a new one.' : 'Optional — add a photo or screenshot to go with the reminder.'}>
          {photo || keptImage ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <Image source={{ uri: photo ? photo.uri : mediaUrl(keptImage ?? '') }} resizeMode="cover" style={{ width: 168, height: 96, borderRadius: 12, backgroundColor: colors.coolMuted }} />
              <Pressable accessibilityLabel="Remove attachment" onPress={() => (photo ? setPhoto(null) : setKeptImage(null))} hitSlop={8}
                style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
                <X size={13} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <View className="flex-row gap-2.5">
              <Pressable onPress={() => { if (settled()) void pickPhoto(); }} className="flex-row items-center justify-center gap-2" style={{ flex: 1, backgroundColor: colors.coolMuted, borderRadius: 12, paddingVertical: 12 }}>
                <ImageIcon size={17} color={colors.primary} />
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>Photo library</Text>
              </Pressable>
              <Pressable onPress={() => { if (settled()) void takePhoto(); }} className="flex-row items-center justify-center gap-2" style={{ flex: 1, backgroundColor: colors.coolMuted, borderRadius: 12, paddingVertical: 12 }}>
                <Camera size={17} color={colors.primary} />
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>Camera</Text>
              </Pressable>
            </View>
          )}
        </FormField>

        <SheetSave label={saving ? 'Saving…' : editing ? 'Save changes' : 'Set reminder'} disabled={!text.trim() || saving} onPress={save} />
      </ScrollView>

      <DaySheet
        visible={pickerOpen}
        title="Choose due date"
        initial={selectedDay}
        minDay={dayKey(new Date())}
        maxDay={dayKey(new Date(new Date().getFullYear() + 2, 11, 31))}
        onClose={() => setPickerOpen(false)}
        onConfirm={(day) => { setSelectedDay(day); setPickerOpen(false); }}
      />

      <TimeSheet
        visible={timeOpen}
        day={selectedDay}
        initial={selectedTime}
        onClose={() => setTimeOpen(false)}
        onConfirm={(t) => { setSelectedTime(t); setTimeOpen(false); }}
      />

      {/* Assignee picker — searchable directory list, Myself pinned first */}
      <Modal visible={assigneeOpen} transparent animationType="slide" onRequestClose={() => setAssigneeOpen(false)}>
        <Pressable onPress={() => setAssigneeOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => undefined} style={{ backgroundColor: colors.coolBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(28, insets.bottom + 16), maxHeight: '75%' }}>
            <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.coolDivider }} /></View>
            <View className="flex-row items-center justify-between px-5 pb-2">
              <View>
                <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Remind who?</Text>
                <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 1 }}>{forIds.length ? `${forIds.length} selected — tap to add or remove` : 'Tap people to select'}</Text>
              </View>
              <Pressable onPress={() => setAssigneeOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={15} color={colors.coolText} /></Pressable>
            </View>
            <View className="flex-row items-center gap-2 mx-4 mb-2" style={{ backgroundColor: colors.coolMuted, borderRadius: 999, paddingHorizontal: 14 }}>
              <SearchIcon size={16} color={colors.coolText3} />
              <TextInput value={personQuery} onChangeText={setPersonQuery} placeholder="Search people" placeholderTextColor={colors.coolText3} style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: colors.ink }} />
            </View>
            <FlatList
              data={filteredPeople}
              keyExtractor={(p) => p.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
              ListEmptyComponent={<Text style={{ color: colors.coolText, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>{peopleError ? 'Could not load your team' : 'No one matches'}</Text>}
              renderItem={({ item: p }) => (
                <Pressable onPress={() => toggleFor(p.id)} className="flex-row items-center" style={{ gap: 12, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 12 }}>
                  <Avatar initials={p.initials} color={p.color} size={40} uri={p.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{p.name}</Text>
                    {p.role ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{p.role}</Text> : null}
                  </View>
                  {forIds.includes(p.id) ? <Check size={18} color={colors.primary} strokeWidth={3} /> : null}
                </Pressable>
              )}
            />
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <Pressable onPress={() => setAssigneeOpen(false)} style={{ height: 46, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 14.5, fontWeight: '700' }}>Done{forIds.length ? ` · ${forIds.length}` : ''}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

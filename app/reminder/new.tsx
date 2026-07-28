import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, FlatList } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, CalendarClock, ChevronDown, Search as SearchIcon, Check } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { FormField, SheetSave, DateTimeSheet } from '../../src/components/forms';
import { colors } from '../../src/theme';
import { createReminder } from '../../src/api/reminders';
import { listUsers, type DirectoryUser } from '../../src/api/directory';
import { mediaUrl } from '../../src/api/media';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useAccessStore } from '../../src/store/accessStore';
import { scheduleLocal } from '../../src/services/notifications';
import { rememberReminderLocal } from '../../src/services/notifications/reminderLocal';
import { useUiStore } from '../../src/store/uiStore';
import { WHEN_PRESETS, presetDue, formatWhenLabel, secondsUntil, parseWhen, type WhenPresetKey } from '../../src/logic/reminderWhen';
import { activeMention, applyMention, rankMentionMatches } from '../../src/logic/mentions';

// Reminder composer (modal). Assignee = searchable directory sheet; due time = presets or a real
// date+time picker. Every reminder carries a real dueAt so the backend can push "⏰ Reminder due"
// to the assignee; self-reminders also schedule a local OS notification at that time.
const PALETTE = [colors.purple, colors.blue, colors.teal, colors.orange, colors.coral, colors.primary];
const colorFor = (id: string): string => PALETTE[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

interface Person { id: string; name: string; initials: string; color: string; avatar?: string | null; role?: string }

export default function NewReminder() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const meId = useMessagingStore((s) => s.myUserId) ?? '';
  const me = useAccessStore((s) => s.user);

  const myself: Person = { id: meId, name: 'Myself', initials: initialsOf(me?.name ?? 'Me'), color: colors.primary, avatar: me?.avatar ?? null };
  const [people, setPeople] = useState<Person[]>([myself]);
  const [peopleError, setPeopleError] = useState(false);
  const [forIds, setForIds] = useState<string[]>(meId ? [meId] : []);
  const [text, setText] = useState('');
  const [preset, setPreset] = useState<WhenPresetKey | 'custom'>('today_evening');
  const [customDue, setCustomDue] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [personQuery, setPersonQuery] = useState('');
  const [saving, setSaving] = useState(false);
  // Two rapid taps can both read `saving === false` before React re-renders — the ref is the
  // synchronous guard against creating the reminder twice; the state just drives the button label.
  const savingRef = useRef(false);
  const [cursor, setCursor] = useState(0);
  // Set ONLY right after a mention is inserted, to place the caret; released on the next
  // selection event so the field stays uncontrolled (a permanently controlled selection fights
  // the Android keyboard).
  const [sel, setSel] = useState<{ start: number; end: number } | undefined>(undefined);

  // The store can still be hydrating when this modal opens, leaving no assignee — backfill Myself
  // once the real user id lands (otherwise saving fails server-side with "Unknown assignee").
  useEffect(() => { if (!forIds.length && meId) setForIds([meId]); }, [forIds.length, meId]);

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

  // ── "when" read out of the text ──
  // "call the agent tomorrow 5pm" pre-selects Tomorrow 5:00 PM. It only ever fills a slot the
  // user hasn't set themselves: touching any preset or the date picker pins the choice and stops
  // the text from moving it again.
  const [whenTouched, setWhenTouched] = useState(false);
  const detectedWhen = useMemo(() => parseWhen(text), [text]);
  useEffect(() => {
    if (whenTouched) return;
    if (detectedWhen) { setCustomDue(detectedWhen.due); setPreset('custom'); }
    else { setCustomDue(null); setPreset('today_evening'); } // phrase deleted → back to the default
  }, [detectedWhen, whenTouched]);

  // The reminder's real due time: from the preset, or the custom pick.
  const dueAt = useMemo(
    () => (preset === 'custom' ? customDue : presetDue(preset)),
    [preset, customDue],
  );
  const selectedPeople = forIds.map((id) => people.find((p) => p.id === id)).filter((p): p is Person => !!p);
  const firstSelected = selectedPeople[0] ?? myself;
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
  const mention = activeMention(text, cursor);
  const mentionMatches = mention ? rankMentionMatches(mentionPeople, mention.query) : [];
  const pickMention = (p: Person): void => {
    if (!mention) return;
    const next = applyMention(text, mention, p.name);
    setText(next.text);
    setCursor(next.cursor);
    setSel({ start: next.cursor, end: next.cursor });
    setForIds((cur) => (cur.includes(p.id) ? cur : [...cur, p.id]));
  };

  const save = async () => {
    if (!text.trim()) { showToast('Add reminder text'); return; }
    if (!forIds.length) { showToast('Choose at least one person'); return; }
    // Recompute at press time — the memoized dueAt goes stale while the form sits open, so a
    // reminder could otherwise be created already-due and fire its local notification instantly.
    const due = preset === 'custom' ? customDue : presetDue(preset);
    if (!due) { showToast('Pick a date & time'); return; }
    if (due.getTime() <= Date.now()) { showToast('That time has passed — pick a new one'); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const label = formatWhenLabel(due);
      const recs = await createReminder({ text: text.trim(), forIds, when: label, dueAt: due.toISOString(), section: 'today' });
      // My own copy also fires locally at the due time (works offline; the server push is the
      // backup). Remember the notification id so completing the reminder can cancel it.
      const mine = recs.find((r) => r.forId === meId);
      if (mine) {
        void scheduleLocal('⏰ Reminder', mine.text ?? '', { type: 'reminder', id: mine.id }, secondsUntil(due))
          .then((notifId) => rememberReminderLocal(mine.id, notifId));
      }
      const onlySelf = forIds.length === 1 && forIds[0] === meId;
      showToast(onlySelf ? `Reminder set · ${label}` : `Reminder set for ${forLabel} · ${label}`);
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
        <Text style={{ color: colors.ink, fontSize: 19, fontWeight: '700' }}>New reminder</Text>
        <Pressable onPress={() => router.back()} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={16} color={colors.coolText} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <FormField label="Reminder" required hint="Type @ to mention someone — it assigns the reminder to them.">
          <TextInput value={text} onChangeText={setText} placeholder="What needs doing? Type @ to assign" placeholderTextColor={colors.coolText3} multiline
            selection={sel}
            onSelectionChange={(e) => { setCursor(e.nativeEvent.selection.start); if (sel) setSel(undefined); }}
            style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: colors.ink, minHeight: 72, textAlignVertical: 'top' }} />
          {/* Mention suggestions — inline under the field, so the keyboard never covers them. */}
          {mention && mentionMatches.length > 0 ? (
            <View style={{ marginTop: 6, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>
              {mentionMatches.map((p, i) => (
                <Pressable key={p.id} onPress={() => pickMention(p)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-2.5"
                  style={{ paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.coolDivider }}>
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

        {/* Assignees — current picks + tap to open the searchable multi-select sheet */}
        <FormField label="For" hint={peopleError ? 'Could not load your team — pull down to retry, or save it for yourself.' : 'You can pick more than one person — each gets their own copy.'}>
          <Pressable onPress={() => { setPersonQuery(''); setAssigneeOpen(true); }} className="flex-row items-center gap-2.5"
            style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 }}>
            <Avatar initials={firstSelected.initials} color={firstSelected.color} size={32} uri={firstSelected.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{forLabel}</Text>
              {selectedPeople.length === 1 && firstSelected.role ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{firstSelected.role}</Text> : null}
            </View>
            <ChevronDown size={18} color={colors.coolText} />
          </Pressable>
        </FormField>

        {/* Due time — presets plus a real date+time picker */}
        <FormField label="When" required>
          <View className="flex-row flex-wrap gap-1.5">
            {WHEN_PRESETS.map((w) => {
              const on = preset === w.key;
              return (
                <Pressable key={w.key} onPress={() => { setWhenTouched(true); setPreset(w.key); }} style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? colors.primary : colors.coolMuted }}>
                  <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12.5, fontWeight: '600' }}>{w.label}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setPickerOpen(true)} className="flex-row items-center gap-1"
              style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: preset === 'custom' ? colors.primary : colors.coolMuted }}>
              <CalendarClock size={13} color={preset === 'custom' ? '#fff' : colors.coolText} />
              <Text style={{ color: preset === 'custom' ? '#fff' : colors.ink, fontSize: 12.5, fontWeight: '600' }}>
                {preset === 'custom' && customDue ? formatWhenLabel(customDue) : 'Pick date & time'}
              </Text>
            </Pressable>
          </View>
          {detectedWhen && !whenTouched ? (
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600', marginTop: 6 }}>
              Picked up “{detectedWhen.match}” from your text{detectedWhen.hasTime ? '' : ' — assuming 9:00 AM'}
            </Text>
          ) : null}
          {dueAt ? <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 6 }}>Will remind {forIds.length === 1 && forIds[0] === meId ? 'you' : forLabel} · {formatWhenLabel(dueAt)}</Text> : null}
        </FormField>

        <SheetSave label={saving ? 'Saving…' : 'Set reminder'} disabled={!text.trim() || !dueAt || saving} onPress={save} />
      </ScrollView>

      {/* Custom date & time picker */}
      <DateTimeSheet
        visible={pickerOpen}
        initial={customDue}
        onClose={() => setPickerOpen(false)}
        onConfirm={(d) => { setWhenTouched(true); setCustomDue(d); setPreset('custom'); setPickerOpen(false); }}
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

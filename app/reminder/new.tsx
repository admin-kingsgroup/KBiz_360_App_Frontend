import { useEffect, useMemo, useState } from 'react';
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
import { useUiStore } from '../../src/store/uiStore';
import { WHEN_PRESETS, presetDue, formatWhenLabel, secondsUntil, type WhenPresetKey } from '../../src/logic/reminderWhen';

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
  const [forId, setForId] = useState(meId);
  const [text, setText] = useState('');
  const [preset, setPreset] = useState<WhenPresetKey | 'custom'>('today_evening');
  const [customDue, setCustomDue] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [personQuery, setPersonQuery] = useState('');
  const [saving, setSaving] = useState(false);

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

  // The reminder's real due time: from the preset, or the custom pick.
  const dueAt = useMemo(
    () => (preset === 'custom' ? customDue : presetDue(preset)),
    [preset, customDue],
  );
  const selected = people.find((p) => p.id === forId) ?? myself;
  const filteredPeople = useMemo(() => {
    const q = personQuery.trim().toLowerCase();
    return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  }, [people, personQuery]);

  const save = async () => {
    if (!text.trim()) { showToast('Add reminder text'); return; }
    // Recompute at press time — the memoized dueAt goes stale while the form sits open, so a
    // reminder could otherwise be created already-due and fire its local notification instantly.
    const due = preset === 'custom' ? customDue : presetDue(preset);
    if (!due) { showToast('Pick a date & time'); return; }
    if (due.getTime() <= Date.now()) { showToast('That time has passed — pick a new one'); return; }
    if (saving) return;
    setSaving(true);
    try {
      const label = formatWhenLabel(due);
      const rec = await createReminder({ text: text.trim(), forId, when: label, dueAt: due.toISOString(), section: 'today' });
      const isSelf = forId === meId;
      // Self-reminders also fire locally at the due time (works offline; the server push is the backup).
      if (isSelf) void scheduleLocal('⏰ Reminder', rec.text ?? '', { type: 'reminder', id: rec.id }, secondsUntil(due));
      showToast(isSelf ? `Reminder set · ${label}` : `Reminder set for ${selected.name.split(' ')[0]} · ${label}`);
      router.back();
    } catch {
      showToast('Could not save reminder');
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
        <FormField label="Reminder" required>
          <TextInput value={text} onChangeText={setText} placeholder="What needs doing?" placeholderTextColor={colors.coolText3} multiline
            style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: colors.ink, minHeight: 72, textAlignVertical: 'top' }} />
        </FormField>

        {/* Assignee — current pick + tap to open the searchable directory sheet */}
        <FormField label="For" hint={peopleError ? 'Could not load your team — pull down to retry, or save it for yourself.' : undefined}>
          <Pressable onPress={() => { setPersonQuery(''); setAssigneeOpen(true); }} className="flex-row items-center gap-2.5"
            style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 }}>
            <Avatar initials={selected.initials} color={selected.color} size={32} uri={selected.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{selected.name}</Text>
              {selected.role ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{selected.role}</Text> : null}
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
                <Pressable key={w.key} onPress={() => setPreset(w.key)} style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? colors.primary : colors.coolMuted }}>
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
          {dueAt ? <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 6 }}>Will remind {forId === meId ? 'you' : selected.name.split(' ')[0]} · {formatWhenLabel(dueAt)}</Text> : null}
        </FormField>

        <SheetSave label={saving ? 'Saving…' : 'Set reminder'} disabled={!text.trim() || !dueAt || saving} onPress={save} />
      </ScrollView>

      {/* Custom date & time picker */}
      <DateTimeSheet
        visible={pickerOpen}
        initial={customDue}
        onClose={() => setPickerOpen(false)}
        onConfirm={(d) => { setCustomDue(d); setPreset('custom'); setPickerOpen(false); }}
      />

      {/* Assignee picker — searchable directory list, Myself pinned first */}
      <Modal visible={assigneeOpen} transparent animationType="slide" onRequestClose={() => setAssigneeOpen(false)}>
        <Pressable onPress={() => setAssigneeOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => undefined} style={{ backgroundColor: colors.coolBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(28, insets.bottom + 16), maxHeight: '75%' }}>
            <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.coolDivider }} /></View>
            <View className="flex-row items-center justify-between px-5 pb-2">
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Remind who?</Text>
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
                <Pressable onPress={() => { setForId(p.id); setAssigneeOpen(false); }} className="flex-row items-center" style={{ gap: 12, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 12 }}>
                  <Avatar initials={p.initials} color={p.color} size={40} uri={p.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{p.name}</Text>
                    {p.role ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{p.role}</Text> : null}
                  </View>
                  {p.id === forId ? <Check size={18} color={colors.primary} strokeWidth={3} /> : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

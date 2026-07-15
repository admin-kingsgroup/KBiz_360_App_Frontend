import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
const PALETTE = [colors.purple, colors.blue, colors.teal, colors.orange, colors.coral, colors.ink];
const colorFor = (id: string): string => PALETTE[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

interface Person { id: string; name: string; initials: string; color: string; avatar?: string | null; role?: string }

export default function NewReminder() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const meId = useMessagingStore((s) => s.myUserId) ?? '';
  const me = useAccessStore((s) => s.user);

  const myself: Person = { id: meId, name: 'Myself', initials: initialsOf(me?.name ?? 'Me'), color: colors.ink, avatar: me?.avatar ?? null };
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
    if (!dueAt) { showToast('Pick a date & time'); return; }
    if (saving) return;
    setSaving(true);
    try {
      const label = formatWhenLabel(dueAt);
      const rec = await createReminder({ text: text.trim(), forId, when: label, dueAt: dueAt.toISOString(), section: 'today' });
      const isSelf = forId === meId;
      // Self-reminders also fire locally at the due time (works offline; the server push is the backup).
      if (isSelf) void scheduleLocal('⏰ Reminder', rec.text ?? '', { type: 'reminder', id: rec.id }, secondsUntil(dueAt));
      showToast(isSelf ? `Reminder set · ${label}` : `Reminder set for ${selected.name.split(' ')[0]} · ${label}`);
      router.back();
    } catch {
      showToast('Could not save reminder');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <View className="flex-row items-center justify-between px-5 pt-3 pb-3">
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>New reminder</Text>
        <Pressable onPress={() => router.back()} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F2EC' }}><X size={14} color={colors.textMuted} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <FormField label="Reminder" required>
          <TextInput value={text} onChangeText={setText} placeholder="What needs doing?" placeholderTextColor={colors.textMuted} multiline
            style={{ borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: colors.ink, minHeight: 64, textAlignVertical: 'top' }} />
        </FormField>

        {/* Assignee — current pick + tap to open the searchable directory sheet */}
        <FormField label="For" hint={peopleError ? 'Could not load your team — pull down to retry, or save it for yourself.' : undefined}>
          <Pressable onPress={() => { setPersonQuery(''); setAssigneeOpen(true); }} className="flex-row items-center gap-2.5"
            style={{ borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fff' }}>
            <Avatar initials={selected.initials} color={selected.color} size={28} uri={selected.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '700' }}>{selected.name}</Text>
              {selected.role ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5 }}>{selected.role}</Text> : null}
            </View>
            <ChevronDown size={16} color={colors.textMuted} />
          </Pressable>
        </FormField>

        {/* Due time — presets plus a real date+time picker */}
        <FormField label="When" required>
          <View className="flex-row flex-wrap gap-1.5">
            {WHEN_PRESETS.map((w) => {
              const on = preset === w.key;
              return (
                <Pressable key={w.key} onPress={() => setPreset(w.key)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: on ? colors.teal : '#fff', borderColor: on ? colors.teal : colors.cardEdge }}>
                  <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 11.5, fontWeight: '700' }}>{w.label}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setPickerOpen(true)} className="flex-row items-center gap-1"
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: preset === 'custom' ? colors.ink : '#fff', borderColor: preset === 'custom' ? colors.ink : colors.cardEdge }}>
              <CalendarClock size={12} color={preset === 'custom' ? '#fff' : colors.ink} />
              <Text style={{ color: preset === 'custom' ? '#fff' : colors.ink, fontSize: 11.5, fontWeight: '700' }}>
                {preset === 'custom' && customDue ? formatWhenLabel(customDue) : 'Pick date & time'}
              </Text>
            </Pressable>
          </View>
          {dueAt ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>Will remind {forId === meId ? 'you' : selected.name.split(' ')[0]} · {formatWhenLabel(dueAt)}</Text> : null}
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
          <Pressable onPress={() => undefined} style={{ backgroundColor: colors.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28, maxHeight: '75%' }}>
            <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.cardEdge }} /></View>
            <View className="flex-row items-center justify-between px-5 pb-2">
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>Remind who?</Text>
              <Pressable onPress={() => setAssigneeOpen(false)} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}><X size={14} color={colors.textMuted} /></Pressable>
            </View>
            <View className="flex-row items-center gap-2 mx-4 mb-2" style={{ backgroundColor: '#FAFAF7', borderRadius: 18, borderWidth: 1, borderColor: colors.cardEdge, paddingHorizontal: 12 }}>
              <SearchIcon size={15} color={colors.textMuted} />
              <TextInput value={personQuery} onChangeText={setPersonQuery} placeholder="Search people" placeholderTextColor={colors.textMuted} style={{ flex: 1, paddingVertical: 8, fontSize: 13.5, color: colors.ink }} />
            </View>
            <FlatList
              data={filteredPeople}
              keyExtractor={(p) => p.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
              ListEmptyComponent={<Text style={{ color: colors.textMuted, fontSize: 12.5, textAlign: 'center', paddingVertical: 24 }}>{peopleError ? 'Could not load your team' : 'No one matches'}</Text>}
              renderItem={({ item: p }) => (
                <Pressable onPress={() => { setForId(p.id); setAssigneeOpen(false); }} className="flex-row items-center" style={{ gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 }}>
                  <Avatar initials={p.initials} color={p.color} size={36} uri={p.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{p.name}</Text>
                    {p.role ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5 }}>{p.role}</Text> : null}
                  </View>
                  {p.id === forId ? <Check size={16} color={colors.teal} strokeWidth={3} /> : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

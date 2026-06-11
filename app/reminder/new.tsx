import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { FormField, SheetSave } from '../../src/components/forms';
import { colors } from '../../src/theme';
import { createReminder } from '../../src/api/reminders';
import { listUsers, type DirectoryUser } from '../../src/api/directory';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useAccessStore } from '../../src/store/accessStore';
import { scheduleLocal } from '../../src/services/notifications';
import { useUiStore } from '../../src/store/uiStore';

// Reminder composer (modal). Assignee picker uses the real directory; reminders persist via the
// Mongo reminders API. Self-reminders also schedule a local OS notification at the chosen time.
const PRESETS = ['Today · 5:00 PM', 'Tomorrow · 9:00 AM', 'Next Monday', 'In 1 hour'];
const PALETTE = [colors.purple, colors.blue, colors.teal, colors.orange, colors.coral, colors.ink];
const colorFor = (id: string): string => PALETTE[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

function presetToDelaySeconds(preset: string): number {
  const now = new Date();
  const at = new Date(now);
  if (preset.startsWith('Today')) { at.setHours(17, 0, 0, 0); if (at <= now) at.setDate(at.getDate() + 1); }
  else if (preset.startsWith('Tomorrow')) { at.setDate(now.getDate() + 1); at.setHours(9, 0, 0, 0); }
  else if (preset.startsWith('Next Monday')) { const d = (8 - now.getDay()) % 7 || 7; at.setDate(now.getDate() + d); at.setHours(9, 0, 0, 0); }
  else if (preset.startsWith('In 1 hour')) { return 3600; }
  return Math.max(1, Math.round((at.getTime() - now.getTime()) / 1000));
}

interface Person { id: string; name: string; initials: string; color: string }

export default function NewReminder() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const meId = useMessagingStore((s) => s.myUserId) ?? '';
  const myName = useAccessStore((s) => s.user?.name) ?? 'Myself';

  const [people, setPeople] = useState<Person[]>([{ id: meId, name: 'Myself', initials: initialsOf(myName), color: colors.ink }]);
  const [forId, setForId] = useState(meId);
  const [text, setText] = useState('');
  const [when, setWhen] = useState(PRESETS[0]);
  const [saving, setSaving] = useState(false);

  // Load the real directory for the assignee picker ("Myself" stays pinned first).
  useEffect(() => {
    listUsers()
      .then((users: DirectoryUser[]) => {
        const others = users.filter((u) => u.id !== meId).map((u) => ({ id: u.id, name: u.name, initials: initialsOf(u.name), color: colorFor(u.id) }));
        setPeople([{ id: meId, name: 'Myself', initials: initialsOf(myName), color: colors.ink }, ...others]);
      })
      .catch(() => undefined);
  }, [meId, myName]);

  const save = async () => {
    if (!text.trim()) { showToast('Add reminder text'); return; }
    if (saving) return;
    setSaving(true);
    try {
      const rec = await createReminder({ text: text.trim(), forId, when, section: 'today' });
      const isSelf = forId === meId;
      if (isSelf) void scheduleLocal('⏰ Reminder', rec.text ?? '', { type: 'reminder', id: rec.id }, presetToDelaySeconds(when));
      const who = people.find((p) => p.id === forId);
      showToast(isSelf ? 'Reminder added' : `Reminder set for ${(who?.name ?? '').split(' ')[0]}`);
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
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <FormField label="Reminder" required>
          <TextInput value={text} onChangeText={setText} placeholder="What needs doing?" placeholderTextColor={colors.textMuted} multiline
            style={{ borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: colors.ink, minHeight: 64, textAlignVertical: 'top' }} />
        </FormField>

        <FormField label="For">
          <View className="flex-row flex-wrap gap-1.5">
            {people.map((p) => {
              const on = forId === p.id;
              return (
                <Pressable key={p.id} onPress={() => setForId(p.id)} className="flex-row items-center gap-1.5"
                  style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: on ? colors.ink : '#fff', borderColor: on ? colors.ink : colors.cardEdge }}>
                  <Avatar initials={p.initials} color={p.color} size={18} />
                  <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 11.5, fontWeight: '800' }}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </FormField>

        <FormField label="When">
          <View className="flex-row flex-wrap gap-1.5">
            {PRESETS.map((w) => {
              const on = when === w;
              return (
                <Pressable key={w} onPress={() => setWhen(w)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: on ? colors.teal : '#fff', borderColor: on ? colors.teal : colors.cardEdge }}>
                  <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 11.5, fontWeight: '700' }}>{w}</Text>
                </Pressable>
              );
            })}
          </View>
        </FormField>

        <SheetSave label={saving ? 'Saving…' : 'Set reminder'} disabled={!text.trim() || saving} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}

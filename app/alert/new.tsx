import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Check, Search as SearchIcon, Megaphone } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { FormField } from '../../src/components/forms';
import { colors } from '../../src/theme';
import { createAlert } from '../../src/api/alerts';
import { listUsers, type DirectoryUser } from '../../src/api/directory';
import { useAccessStore } from '../../src/store/accessStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { usePulseStore } from '../../src/store/pulseStore';
import { useUiStore } from '../../src/store/uiStore';

// Announcement composer (modal, super-admin only). The admin writes a title + message and picks
// which users receive it ("Everyone" or a hand-picked list). Recipients see it in their System
// Alerts section; the backend stores the recipient list per event and filters /api/alerts by it.
const PALETTE = [colors.purple, colors.blue, colors.teal, colors.orange, colors.coral, colors.ink];
const colorFor = (id: string): string => PALETTE[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

export default function NewAlert() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const meId = useMessagingStore((s) => s.myUserId) ?? '';
  const isSuper = !!useAccessStore((s) => s.access())?.isSuper;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [everyone, setEveryone] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [usersError, setUsersError] = useState(false);
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);

  // Recipient directory (the sender is excluded — supers see every alert anyway).
  useEffect(() => {
    listUsers()
      .then((list) => setUsers(list.filter((u) => u.id !== meId)))
      .catch(() => setUsersError(true));
  }, [meId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, query]);
  const selectedCount = Object.values(selected).filter(Boolean).length;

  if (!isSuper) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top', 'bottom']}>
        <View className="items-center px-6" style={{ paddingVertical: 64 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700' }}>Only super admins can create alerts.</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}><Text style={{ color: colors.blue, fontSize: 13, fontWeight: '800' }}>Go back</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const send = () => {
    const t = title.trim();
    if (!t) { showToast('Give the alert a title'); return; }
    const recipients = everyone ? ['*'] : Object.keys(selected).filter((id) => selected[id]);
    if (recipients.length === 0) { showToast('Pick at least one recipient'); return; }
    setSending(true);
    createAlert({ title: t, body: body.trim(), recipients })
      .then(() => {
        void usePulseStore.getState().refresh();
        showToast('Alert sent');
        router.back();
      })
      .catch(() => { setSending(false); showToast('Could not send the alert'); });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ backgroundColor: '#fff', borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><X size={20} color={colors.ink} /></Pressable>
        <View className="flex-row items-center gap-1.5 flex-1">
          <Megaphone size={15} color={colors.ink} />
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '800' }}>New alert</Text>
        </View>
        <Pressable onPress={send} disabled={sending} style={{ backgroundColor: colors.ink, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginRight: 6, opacity: sending ? 0.6 : 1 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{sending ? 'Sending…' : 'Send'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <FormField label="Title" required>
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Office closed on Friday" placeholderTextColor={colors.textMuted2} maxLength={160}
            style={{ backgroundColor: '#fff', borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, fontSize: 13.5 }} />
        </FormField>
        <FormField label="Message">
          <TextInput value={body} onChangeText={setBody} placeholder="Details (optional)" placeholderTextColor={colors.textMuted2} multiline maxLength={2000}
            style={{ backgroundColor: '#fff', borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, fontSize: 13.5, minHeight: 88, textAlignVertical: 'top' }} />
        </FormField>

        {/* Recipients */}
        <FormField label="Who sees this alert" required hint={everyone ? 'Every app user will see it in System Alerts.' : `${selectedCount} selected`}>
          <View className="flex-row items-center gap-3" style={{ backgroundColor: '#fff', borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700' }}>Everyone</Text>
            <Switch value={everyone} onValueChange={setEveryone} trackColor={{ true: colors.success, false: colors.cardEdge }} />
          </View>
        </FormField>

        {!everyone ? (
          <View style={{ backgroundColor: '#fff', borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 12, overflow: 'hidden' }}>
            <View className="flex-row items-center gap-2 px-3" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
              <SearchIcon size={14} color={colors.textMuted2} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search people" placeholderTextColor={colors.textMuted2}
                style={{ flex: 1, paddingVertical: 10, color: colors.ink, fontSize: 13 }} />
            </View>
            {usersError ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, padding: 14 }}>Couldn’t load the user list. Check your connection.</Text>
            ) : shown.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, padding: 14 }}>No people match.</Text>
            ) : shown.map((u) => {
              const on = !!selected[u.id];
              return (
                <Pressable key={u.id} onPress={() => setSelected((s) => ({ ...s, [u.id]: !on }))} className="flex-row items-center gap-2.5 px-3"
                  style={{ paddingVertical: 9, borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: on ? '#F6FAF7' : 'transparent' }}>
                  <Avatar initials={initialsOf(u.name)} color={colorFor(u.id)} size={30} />
                  <View className="flex-1">
                    <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{u.name}</Text>
                    <Text numberOfLines={1} style={{ color: colors.textMuted2, fontSize: 10.5 }}>{u.position || u.role}</Text>
                  </View>
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: on ? colors.success : colors.cardEdge, backgroundColor: on ? colors.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <Check size={12} color="#fff" /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

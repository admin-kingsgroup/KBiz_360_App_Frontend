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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top', 'bottom']}>
        <View className="items-center px-6" style={{ paddingVertical: 64 }}>
          <Text style={{ color: colors.coolText, fontSize: 14, fontWeight: '700' }}>Only super admins can create alerts.</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}><Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>Go back</Text></Pressable>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={colors.ink} /></Pressable>
        <View className="flex-row items-center gap-1.5 flex-1">
          <Megaphone size={17} color={colors.primary} />
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>New alert</Text>
        </View>
        <Pressable onPress={send} disabled={sending} style={{ backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 18, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: 6, opacity: sending ? 0.6 : 1 }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{sending ? 'Sending…' : 'Send'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <FormField label="Title" required>
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Office closed on Friday" placeholderTextColor={colors.coolText3} maxLength={160}
            style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, color: colors.ink, fontSize: 15, fontWeight: '500' }} />
        </FormField>
        <FormField label="Message">
          <TextInput value={body} onChangeText={setBody} placeholder="Details (optional)" placeholderTextColor={colors.coolText3} multiline maxLength={2000}
            style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, color: colors.ink, fontSize: 15, minHeight: 96, textAlignVertical: 'top' }} />
        </FormField>

        {/* Recipients */}
        <FormField label="Who sees this alert" required hint={everyone ? 'Every app user will see it in System Alerts.' : `${selectedCount} selected`}>
          <View className="flex-row items-center gap-3" style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ flex: 1, color: colors.ink, fontSize: 15, fontWeight: '600' }}>Everyone</Text>
            <Switch value={everyone} onValueChange={setEveryone} trackColor={{ true: colors.primary, false: colors.coolDivider }} />
          </View>
        </FormField>

        {!everyone ? (
          <View style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 12, overflow: 'hidden' }}>
            <View className="flex-row items-center gap-2 px-3" style={{ borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
              <SearchIcon size={16} color={colors.coolText3} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search people" placeholderTextColor={colors.coolText3}
                style={{ flex: 1, paddingVertical: 12, color: colors.ink, fontSize: 14 }} />
            </View>
            {usersError ? (
              <Text style={{ color: colors.coolText, fontSize: 13, padding: 14 }}>Couldn’t load the user list. Check your connection.</Text>
            ) : shown.length === 0 ? (
              <Text style={{ color: colors.coolText, fontSize: 13, padding: 14 }}>No people match.</Text>
            ) : shown.map((u) => {
              const on = !!selected[u.id];
              return (
                <Pressable key={u.id} onPress={() => setSelected((s) => ({ ...s, [u.id]: !on }))} className="flex-row items-center gap-2.5 px-3"
                  style={{ paddingVertical: 11, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: on ? colors.primarySoft : 'transparent' }}>
                  <Avatar initials={initialsOf(u.name)} color={colorFor(u.id)} size={34} />
                  <View className="flex-1">
                    <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }}>{u.name}</Text>
                    <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 11.5 }}>{u.position || u.role}</Text>
                  </View>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: on ? colors.primary : colors.coolDivider, backgroundColor: on ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <Check size={13} color="#fff" /> : null}
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

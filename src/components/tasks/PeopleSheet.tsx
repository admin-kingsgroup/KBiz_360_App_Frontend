import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Modal } from '../ui/Modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Search as SearchIcon, X } from 'lucide-react-native';
import { Avatar } from '../ui';
import { colors } from '../../theme';
import { useAccessStore } from '../../store/accessStore';
import { refreshDirectoryUsers } from '../../store/directoryStore';

// Searchable people picker for tasks — the whole directory (anyone can give a task to anyone,
// decision 1). Single mode (Assign to, Reassign) closes on a pick; multi mode (Watchers) toggles.
// "Myself" is pinned first when `myself` is set: a task for yourself is a personal to-do.

export interface PeopleSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  meId: string;
  myself?: boolean;
  multi?: boolean;
  selected?: string[];
  exclude?: string[];
  onPick?: (id: string) => void;
  onToggle?: (id: string) => void;
  onClose: () => void;
}

export function PeopleSheet({ visible, title, subtitle, meId, myself = false, multi = false, selected = [], exclude = [], onPick, onToggle, onClose }: PeopleSheetProps) {
  const insets = useSafeAreaInsets();
  const users = useAccessStore((s) => s.users);
  const me = useAccessStore((s) => s.user);
  const [q, setQ] = useState('');
  useEffect(() => { if (visible) { setQ(''); void refreshDirectoryUsers(); } }, [visible]);

  const people = useMemo(() => {
    const others = users.filter((u) => u.id !== meId && !exclude.includes(u.id) && u.status !== 'inactive')
      .sort((a, b) => a.name.localeCompare(b.name));
    const list = others.map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.color, avatar: u.avatar ?? null, sub: u.position || u.roleName || '' }));
    const mine = myself && meId && !exclude.includes(meId)
      ? [{ id: meId, name: 'Myself', initials: me?.initials ?? 'Me', color: colors.primary, avatar: me?.avatar ?? null, sub: 'A personal to-do' }]
      : [];
    const all = [...mine, ...list];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((p) => p.name.toLowerCase().includes(needle) || p.sub.toLowerCase().includes(needle)) : all;
  }, [users, meId, exclude, myself, me, q]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.coolBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(24, insets.bottom + 12), maxHeight: '80%' }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.coolDivider }} /></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>{title}</Text>
              {subtitle ? <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 1 }}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Close" style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={15} color={colors.coolText} /></Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.coolMuted, borderRadius: 999, paddingHorizontal: 14 }}>
            <SearchIcon size={16} color={colors.coolText3} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search people" placeholderTextColor={colors.coolText3} style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: colors.ink }} />
          </View>
          <FlatList
            data={people}
            keyExtractor={(p) => p.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
            ListEmptyComponent={<Text style={{ color: colors.coolText, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>{users.length ? 'No one matches' : 'Loading people…'}</Text>}
            renderItem={({ item: p }) => (
              <Pressable onPress={() => (multi ? onToggle?.(p.id) : onPick?.(p.id))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 }}>
                <Avatar initials={p.initials} color={p.color} size={38} uri={p.avatar} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{p.name}</Text>
                  {p.sub ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{p.sub}</Text> : null}
                </View>
                {selected.includes(p.id) ? <Check size={18} color={colors.primary} strokeWidth={3} /> : null}
              </Pressable>
            )}
          />
          {multi ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <Pressable onPress={onClose} style={{ height: 46, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 14.5, fontWeight: '700' }}>Done{selected.length ? ` · ${selected.length}` : ''}</Text>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

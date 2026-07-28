import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Modal, ActivityIndicator, ScrollView, Alert, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, UserPlus, Shield, Trash2, LogOut, Check, X, Pencil, Search } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import { getConversation, updateGroup, addGroupMembers, removeGroupMember, promoteGroupAdmin, deleteGroup, type ChatConversation } from '../../src/api/chat';
import { listUsers, toUser } from '../../src/api/directory';

export default function GroupInfo() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = id ?? '';
  const showToast = useUiStore((s) => s.showToast);
  const meId = useMessagingStore((s) => s.myUserId) ?? '';
  const isSuper = !!useAccessStore((s) => s.access())?.isSuper;
  const myEmail = (useAccessStore((s) => s.user)?.email ?? '').toLowerCase().trim();
  const users = useAccessStore((s) => s.users);

  const [conv, setConv] = useState<ChatConversation | undefined>();
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const refresh = (): void => { getConversation(convId).then(setConv).catch(() => undefined); };
  useEffect(() => {
    getConversation(convId).then(setConv).catch(() => undefined).finally(() => setLoading(false));
    if (users.length === 0) listUsers().then((l) => useAccessStore.getState().setUsers(l.map(toUser))).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  const nameOf = useMemo(() => { const m = new Map(users.map((u) => [u.id, u.name])); return (uid: string): string => m.get(uid) ?? 'Member'; }, [users]);
  const positionOf = useMemo(() => { const m = new Map(users.map((u) => [u.id, u.position ?? null])); return (uid: string): string | null => m.get(uid) ?? null; }, [users]);
  const avatarOf = useMemo(() => { const m = new Map(users.map((u) => [u.id, u.avatar ?? null])); return (uid: string): string | null => m.get(uid) ?? null; }, [users]);
  const members = conv?.members ?? [];
  const memberIds = new Set(members.map((m) => m.userId));
  const canManage = conv?.myRole === 'admin' || conv?.createdBy === meId || isSuper;
  // Add-only allowlist (mirrors the backend): these users may add people to a group they belong to,
  // without full management rights.
  const ADD_MEMBER_EMAILS = ['faiz@travkings.com', 'pravesh@travkings.com', 'farhan@travkings.com'];
  const canAddMembers = canManage || (ADD_MEMBER_EMAILS.includes(myEmail) && memberIds.has(meId));
  // Edit allowlist (mirrors the backend GROUP_EDIT_EMAILS): may rename and remove members in a
  // group they belong to — delete/promote stay gated on canManage.
  const EDIT_GROUP_EMAILS = ['faiz@travkings.com'];
  const canEdit = canManage || (EDIT_GROUP_EMAILS.includes(myEmail) && memberIds.has(meId));
  // Rename-only allowlist (mirrors the backend GROUP_RENAME_EMAILS): name edit only.
  const RENAME_GROUP_EMAILS = ['farhan@travkings.com'];
  const canRename = canEdit || (RENAME_GROUP_EMAILS.includes(myEmail) && memberIds.has(meId));
  const sorted = [...members].sort((a, b) => (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1));
  // For a branch-department group, only offer people from that branch — plus company-wide
  // leadership (Super-Admins & Directors), who aren't tied to any branch but can be added to
  // any group. Non-branch groups offer the whole directory.
  const COMPANY_WIDE = new Set(['SUPER_ADMIN', 'DIRECTOR']);
  const candidates = users.filter((u) =>
    !memberIds.has(u.id) &&
    (!conv?.branchId || COMPANY_WIDE.has(u.role) || (u.branches ?? []).includes(conv.branchId)) &&
    u.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const saveName = async (): Promise<void> => {
    if (!nameInput.trim()) return;
    setEditingName(false);
    try { setConv(await updateGroup(convId, { name: nameInput.trim() })); await useMessagingStore.getState().loadConversations(); } catch { showToast('Could not rename'); }
  };
  const remove = async (uid: string): Promise<void> => {
    try { await removeGroupMember(convId, uid); refresh(); await useMessagingStore.getState().loadConversations(); } catch { showToast('Could not remove'); }
  };
  const promote = async (uid: string): Promise<void> => {
    try { await promoteGroupAdmin(convId, uid); refresh(); showToast('Promoted to admin'); } catch { showToast('Could not promote'); }
  };
  const addSelected = async (): Promise<void> => {
    if (selected.size === 0) { setAddOpen(false); return; }
    try { setConv(await addGroupMembers(convId, [...selected])); await useMessagingStore.getState().loadConversations(); } catch { showToast('Could not add members'); }
    setSelected(new Set()); setQuery(''); setAddOpen(false);
  };
  const leave = async (): Promise<void> => {
    try { await removeGroupMember(convId, meId); await useMessagingStore.getState().loadConversations(); router.replace('/(tabs)'); } catch { showToast('Could not leave group'); }
  };
  const del = async (): Promise<void> => {
    try { await deleteGroup(convId); await useMessagingStore.getState().loadConversations(); showToast('Group deleted'); router.replace('/(tabs)'); } catch { showToast('Could not delete group'); }
  };
  const toggle = (uid: string): void => setSelected((s) => { const n = new Set(s); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });

  const confirmRemove = (uid: string): void => Alert.alert('Remove member', `Remove ${nameOf(uid)} from "${conv?.name ?? 'this group'}"?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => void remove(uid) },
  ]);
  const confirmLeave = (): void => Alert.alert('Leave group', 'You will no longer receive messages from this group.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: () => void leave() },
  ]);
  const confirmDelete = (): void => Alert.alert('Delete group', `Delete "${conv?.name ?? 'this group'}" for everyone? This removes the group and all its messages and cannot be undone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void del() },
  ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-2" style={{ backgroundColor: colors.card, minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Group info</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.primary} /></View>
      ) : !conv ? (
        <View className="flex-1 items-center justify-center"><Text style={{ color: colors.coolText }}>Group not found</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {/* Group identity */}
          <View className="items-center" style={{ marginBottom: 18 }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800' }}>{(conv.name[0] ?? 'G').toUpperCase()}</Text>
            </View>
            {editingName ? (
              <View className="flex-row items-center gap-2" style={{ marginTop: 12 }}>
                <TextInput value={nameInput} onChangeText={setNameInput} autoFocus style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, fontSize: 16, fontWeight: '600', color: colors.ink, minWidth: 180 }} />
                <Pressable onPress={saveName}><Check size={22} color={colors.primary} /></Pressable>
              </View>
            ) : (
              <Pressable disabled={!canRename} onPress={() => { setNameInput(conv.name); setEditingName(true); }} className="flex-row items-center gap-1.5" style={{ marginTop: 12 }}>
                <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700' }}>{conv.name}</Text>
                {canRename ? <Pencil size={15} color={colors.coolText3} /> : null}
              </Pressable>
            )}
            <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 3 }}>{conv.memberCount} members</Text>
          </View>

          {/* Add members — full managers OR the add-only allowlist (canAddMembers) */}
          {canAddMembers ? (
            <Pressable onPress={() => setAddOpen(true)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 px-3 py-3" style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 16, marginBottom: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><UserPlus size={20} color="#fff" /></View>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>Add members</Text>
            </Pressable>
          ) : null}

          {/* Members */}
          <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, paddingHorizontal: 2 }}>MEMBERS</Text>
          <View style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }}>
            {sorted.map((m, i) => (
              <View key={m.userId} className="flex-row items-center gap-3 px-3 py-3" style={{ borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.coolDivider }}>
                <Avatar initials={(nameOf(m.userId)[0] ?? '?').toUpperCase()} color={colors.blue} size={44} uri={avatarOf(m.userId)} />
                <View className="flex-1">
                  <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{m.userId === meId ? 'You' : nameOf(m.userId)}</Text>
                  {positionOf(m.userId) ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12, marginTop: 1 }}>{positionOf(m.userId)}</Text> : null}
                </View>
                {m.role === 'admin' ? <View style={{ backgroundColor: colors.purple + '1A', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 }}><Text style={{ color: colors.purple, fontSize: 10.5, fontWeight: '700' }}>Admin</Text></View> : null}
                {canEdit && m.userId !== meId ? (
                  <View className="flex-row items-center gap-1">
                    {canManage && m.role !== 'admin' ? <Pressable onPress={() => promote(m.userId)} hitSlop={6} style={{ padding: 6 }}><Shield size={17} color={colors.coolText3} /></Pressable> : null}
                    <Pressable onPress={() => confirmRemove(m.userId)} hitSlop={6} style={{ padding: 6 }}><Trash2 size={17} color={colors.danger} /></Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </View>

          {/* Leave */}
          <Pressable onPress={confirmLeave} className="flex-row items-center justify-center gap-2" style={{ marginTop: 16, height: 50, borderRadius: 999, borderWidth: 1.5, borderColor: colors.danger + '55', backgroundColor: colors.card }}>
            <LogOut size={17} color={colors.danger} />
            <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>Leave group</Text>
          </Pressable>

          {/* Delete — admins / creator / super only. Removes the group + all messages for everyone. */}
          {canManage ? (
            <Pressable onPress={confirmDelete} className="flex-row items-center justify-center gap-2" style={{ marginTop: 10, height: 50, borderRadius: 999, backgroundColor: colors.danger }}>
              <Trash2 size={17} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Delete group</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      {/* Add-members modal */}
      <Modal visible={addOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        >
          {/* tap the dimmed area above the sheet to dismiss */}
          <Pressable style={{ flex: 1 }} onPress={() => { setAddOpen(false); setSelected(new Set()); }} />
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, height: '80%', paddingBottom: 12 }}>
            <View className="flex-row items-center justify-between px-4 py-3" style={{ borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>Add members{selected.size ? ` · ${selected.size}` : ''}</Text>
              <View className="flex-row items-center gap-3">
                <Pressable onPress={addSelected} hitSlop={8}><Text style={{ color: colors.primary, fontSize: 15, fontWeight: '700' }}>Add</Text></Pressable>
                <Pressable onPress={() => { setAddOpen(false); setSelected(new Set()); }} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={17} color={colors.coolText} /></Pressable>
              </View>
            </View>
            <View className="flex-row items-center gap-2 mx-4 my-3" style={{ backgroundColor: colors.coolMuted, borderRadius: 999, paddingHorizontal: 14 }}>
              <Search size={17} color={colors.coolText3} strokeWidth={2.2} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search people" placeholderTextColor={colors.coolText3} style={{ flex: 1, paddingVertical: 11, fontSize: 15, color: colors.ink }} />
            </View>
            <FlatList
              style={{ flex: 1 }}
              data={candidates}
              keyExtractor={(u) => u.id}
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              ListEmptyComponent={<Text style={{ color: colors.coolText, fontSize: 13, padding: 16, textAlign: 'center' }}>Everyone is already in this group</Text>}
              renderItem={({ item: u }) => {
                const on = selected.has(u.id);
                return (
                  <Pressable onPress={() => toggle(u.id)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 px-2 py-2.5" style={{ borderRadius: 12, backgroundColor: on ? colors.primarySoft : 'transparent' }}>
                    <Avatar initials={(u.name[0] ?? '?').toUpperCase()} color={colors.blue} size={44} uri={u.avatar} />
                    <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: '600', flex: 1 }}>{u.name}</Text>
                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? colors.primary : colors.coolDivider, backgroundColor: on ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <Check size={14} color="#fff" /> : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

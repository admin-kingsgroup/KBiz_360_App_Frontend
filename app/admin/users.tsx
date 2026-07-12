import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Switch, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { User as UserIcon, Plus, Edit3, ChevronLeft, LogOut, BriefcaseBusiness, X } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import { listUsers, toUser } from '../../src/api/directory';
import { authApi, adminApi } from '../../src/api';
import { useMessagingStore } from '../../src/store/messagingStore';
import type { User } from '../../src/types/user';

// Users tab — faithful port of source UsersTab. Reads canonical accessStore.users.
// Tap a user to edit; "other staff" aggregate rows just toast (source behavior preserved).
export default function Users() {
  const router = useRouter();
  const users = useAccessStore((s) => s.users);
  const me = useAccessStore((s) => s.user);
  const isSuper = !!useAccessStore((s) => s.access())?.isSuper;
  const showToast = useUiStore((s) => s.showToast);
  const [loading, setLoading] = useState(true);
  const [appAccess, setAppAccess] = useState<Record<string, boolean>>({}); // userId → can use the app
  const [tracking, setTracking] = useState<Record<string, boolean>>({}); // userId → attendance tracked
  const [editing, setEditing] = useState<User | null>(null); // user whose position is being edited
  const [posInput, setPosInput] = useState('');
  const [savingPos, setSavingPos] = useState(false);

  // Hydrate the canonical user list from the real CRM directory (read-only).
  useEffect(() => {
    let active = true;
    listUsers()
      .then((list) => { if (active) useAccessStore.getState().setUsers(list.map(toUser)); })
      .catch(() => { /* keep any cached users */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Super-admin: load each user's app-access state for the per-user toggles.
  useEffect(() => {
    if (!isSuper) return;
    let active = true;
    adminApi.getUserAccess().then((s) => { if (active) setAppAccess(s); }).catch(() => undefined);
    adminApi.getAttendanceTracking().then((s) => { if (active) setTracking(s); }).catch(() => undefined);
    return () => { active = false; };
  }, [isSuper]);

  // Toggle whether a user's attendance is taken (off = exempt, e.g. owners/directors who don't punch).
  const toggleTracking = (id: string, on: boolean) => {
    setTracking((s) => ({ ...s, [id]: on })); // optimistic
    adminApi.setAttendanceTracking(id, on)
      .then(() => showToast(on ? 'Attendance tracking on' : 'Attendance not taken for this user'))
      .catch(() => { setTracking((s) => ({ ...s, [id]: !on })); showToast('Could not update'); });
  };

  // Toggle a user's app access. Disabling logs them out + blocks re-login until re-enabled.
  const toggleAccess = (id: string, enabled: boolean) => {
    setAppAccess((s) => ({ ...s, [id]: enabled })); // optimistic
    adminApi.setUserAccess(id, enabled)
      .then(() => showToast(enabled ? 'App access enabled' : 'App access disabled — user signed out'))
      .catch(() => { setAppAccess((s) => ({ ...s, [id]: !enabled })); showToast('Could not update access'); });
  };

  // Super-admin: open the position editor for a user, and save it.
  const openPosition = (u: User) => { setEditing(u); setPosInput(u.position ?? ''); };
  const savePosition = () => {
    if (!editing) return;
    const id = editing.id;
    const position = posInput.trim();
    setSavingPos(true);
    adminApi.setUserPosition(id, position)
      .then(() => {
        // Optimistic: reflect immediately…
        useAccessStore.getState().setUsers(useAccessStore.getState().users.map((u) => (u.id === id ? { ...u, position: position || null } : u)));
        showToast(position ? 'Position updated' : 'Position cleared');
        setEditing(null);
        // …then re-sync from the server so it stays put across reloads (authoritative).
        listUsers().then((list) => useAccessStore.getState().setUsers(list.map(toUser))).catch(() => undefined);
      })
      .catch(() => showToast('Could not save position'))
      .finally(() => setSavingPos(false));
  };

  // Tapping a teammate opens (or creates) a 1:1 conversation and navigates into the chat.
  const openUser = async (id: string, name: string) => {
    if (id === 'a9' || name.toLowerCase().includes('other')) { showToast('Group of staff — open individually'); return; }
    try {
      const convId = await useMessagingStore.getState().openDirect(id);
      router.push({ pathname: '/chat/[id]', params: { id: convId } });
    } catch {
      showToast('Could not open chat');
    }
  };
  const signOut = () => { void authApi.logout(); showToast('Signed out'); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View>
          <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600' }}>Team & Users</Text>
          <Text style={{ color: colors.warmMute, fontSize: 10.5 }}>{users.length} shown</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
        {loading && users.length === 0 ? (
          <View className="items-center" style={{ paddingVertical: 40 }}>
            <ActivityIndicator color={colors.ink} />
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>Loading team…</Text>
          </View>
        ) : null}
        <View className="flex-row items-center gap-1.5 mb-1">
          <UserIcon size={11} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 }}>ALL USERS · {users.length}</Text>
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }}>
          {users.map((u, i) => {
            return (
              <Pressable key={u.id} onPress={() => openUser(u.id, u.name)} className="flex-row items-center gap-2.5 px-3.5 py-2.5"
                style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.cardEdge }}>
                <Avatar initials={u.initials} color={u.color} size={36} uri={u.avatar} />
                <View className="flex-1">
                  <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '800' }}>{u.name}</Text>
                  {/* Show the POSITION (job title) when set; otherwise the real CRM role (e.g. "Company Manager"). */}
                  {u.position
                    ? <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 10.5, marginTop: 2, fontWeight: '600' }}>{u.position}</Text>
                    : (u.roleName || u.scopeLine) ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>{u.roleName || u.scopeLine}</Text> : null}
                </View>
                {/* Super-admin: edit this user's position (for everyone, including self). */}
                {isSuper ? (
                  <View onStartShouldSetResponder={() => true}>
                    <Pressable onPress={() => openPosition(u)} hitSlop={8} style={{ padding: 5 }}>
                      <BriefcaseBusiness size={15} color={colors.teal} />
                    </Pressable>
                  </View>
                ) : null}
                {/* Super-admin app-access toggle (can't disable yourself). onStartShouldSetResponder
                    stops the row's onPress from firing when you tap the switch. */}
                {isSuper && u.id !== me?.id ? (
                  <View onStartShouldSetResponder={() => true}>
                    <Switch
                      value={appAccess[u.id] !== false}
                      onValueChange={(v) => toggleAccess(u.id, v)}
                      trackColor={{ true: colors.success, false: colors.cardEdge }}
                    />
                  </View>
                ) : !isSuper ? (
                  <Edit3 size={13} color={colors.textMuted} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={() => router.push('/admin/user-form')} className="flex-row items-center justify-center gap-1.5 mt-3"
          style={{ paddingVertical: 13, borderRadius: 13, backgroundColor: colors.ink }}>
          <Plus size={15} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>Invite user · pick role & access</Text>
        </Pressable>
        <Pressable onPress={signOut} className="flex-row items-center justify-center gap-2 mt-3"
          style={{ paddingVertical: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.coral + '40' }}>
          <LogOut size={14} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: '700' }}>Sign out → back to Login</Text>
        </Pressable>
      </ScrollView>

      {/* Position editor (super-admin) */}
      <Modal visible={!!editing} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 4 }}>
              <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '700' }}>Position</Text>
              <Pressable onPress={() => setEditing(null)} hitSlop={8}><X size={18} color={colors.textMuted} /></Pressable>
            </View>
            <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: 12 }}>
              {editing?.name}{editing?.roleName ? ` · ${editing.roleName}` : ''}
            </Text>
            <TextInput
              value={posInput}
              onChangeText={setPosInput}
              autoFocus
              placeholder="e.g. Senior Finance Manager"
              placeholderTextColor={colors.textMuted}
              style={{ borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.ink, fontWeight: '600' }}
              onSubmitEditing={savePosition}
              returnKeyType="done"
            />
            <Text style={{ color: colors.textMuted2, fontSize: 10.5, marginTop: 8 }}>This is a display title only — it does not change the user&apos;s role or access. Leave blank to clear.</Text>

            {/* Attendance tracking toggle (saves immediately) */}
            <View className="flex-row items-center gap-3" style={{ marginTop: 14, paddingTop: 14, borderTopColor: colors.cardEdge, borderTopWidth: 1 }}>
              <View className="flex-1">
                <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>Take attendance</Text>
                <Text style={{ color: colors.textMuted2, fontSize: 10.5, marginTop: 2 }}>Off = exempt (no check-in/out, hidden from the team list).</Text>
              </View>
              {editing ? (
                <Switch
                  value={tracking[editing.id] !== false}
                  onValueChange={(v) => toggleTracking(editing.id, v)}
                  trackColor={{ true: colors.success, false: colors.cardEdge }}
                />
              ) : null}
            </View>

            <Pressable onPress={savePosition} disabled={savingPos} style={{ marginTop: 14, backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: savingPos ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{savingPos ? 'Saving…' : 'Save position'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

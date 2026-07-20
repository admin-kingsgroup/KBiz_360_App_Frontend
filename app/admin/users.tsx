import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Switch, Modal, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { User as UserIcon, Plus, Edit3, ChevronLeft, LogOut, BriefcaseBusiness, Bell, X } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { pulseChannels } from '../../src/data/pulse';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import { listUsers, toUser } from '../../src/api/directory';
import { authApi, adminApi } from '../../src/api';
import { useMessagingStore } from '../../src/store/messagingStore';
import type { User } from '../../src/types/user';

// Users tab — reads canonical accessStore.users. Tapping a row opens a 1:1 chat; super-admins get
// per-row actions: pencil = full editor (role/branches/password/status), briefcase = position,
// switch = app access. "Other staff" aggregate rows just toast (source behavior preserved).
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
  const [alertsUser, setAlertsUser] = useState<User | null>(null); // user whose alert channels are being edited
  const [alertGrants, setAlertGrants] = useState<Record<string, string[]>>({}); // userId → grants like "BOM-accounts"

  // The grantable channels — every branch-scoped channel in the registry ("BOM-hr",
  // "BOM-accounts", "BOM-crm", …). Announcements are recipient-addressed, not granted.
  const channelOptions = pulseChannels
    .filter((c) => c.branch)
    .map((c) => ({ grant: `${c.branch}-${c.module}`, name: c.name, icon: c.icon }));

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
    adminApi.getAlertVisibility().then((s) => { if (active) setAlertGrants(s); }).catch(() => undefined);
    return () => { active = false; };
  }, [isSuper]);

  // Toggle one alert-channel grant for a user. Saves immediately (the server live-pushes
  // 'alert:visibility' to that user, so their Home feed updates without a re-login).
  const toggleAlertGrant = (userId: string, grant: string, on: boolean) => {
    const current = alertGrants[userId] || [];
    const next = on ? [...new Set([...current, grant])] : current.filter((g) => g !== grant);
    setAlertGrants((s) => ({ ...s, [userId]: next })); // optimistic
    adminApi.setAlertVisibility(userId, next)
      .then((r) => setAlertGrants((s) => ({ ...s, [userId]: r.alerts ?? next })))
      .catch(() => { setAlertGrants((s) => ({ ...s, [userId]: current })); showToast('Could not update alert access'); });
  };

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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      {/* Standard white header */}
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Team & Users</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>{users.length} shown</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
        {loading && users.length === 0 ? (
          <View className="items-center" style={{ paddingVertical: 40 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 10 }}>Loading team…</Text>
          </View>
        ) : null}
        <View className="flex-row items-center gap-1.5 mb-2 px-1">
          <UserIcon size={12} color={colors.coolText} />
          <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>ALL USERS · {users.length}</Text>
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }}>
          {users.map((u, i) => {
            return (
              <Pressable key={u.id} onPress={() => openUser(u.id, u.name)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 px-3.5 py-3"
                style={{ borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.coolDivider }}>
                <Avatar initials={u.initials} color={u.color} size={44} uri={u.avatar} />
                <View className="flex-1">
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{u.name}</Text>
                  {/* Show the POSITION (job title) when set; otherwise the real CRM role (e.g. "Company Manager"). */}
                  {u.position
                    ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12.5, marginTop: 1 }}>{u.position}</Text>
                    : (u.roleName || u.scopeLine) ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12.5, marginTop: 1 }}>{u.roleName || u.scopeLine}</Text> : null}
                </View>
                {/* Super-admin: full editor (role, branches, password, status) + position (job title). */}
                {isSuper ? (
                  <View onStartShouldSetResponder={() => true} className="flex-row items-center">
                    <Pressable onPress={() => router.push({ pathname: '/admin/user-form', params: { id: u.id } })} hitSlop={8} style={{ padding: 6 }}>
                      <Edit3 size={17} color={colors.ink} />
                    </Pressable>
                    <Pressable onPress={() => openPosition(u)} hitSlop={8} style={{ padding: 6 }}>
                      <BriefcaseBusiness size={17} color={colors.primary} />
                    </Pressable>
                    <Pressable onPress={() => setAlertsUser(u)} hitSlop={8} style={{ padding: 6 }}>
                      <Bell size={17} color={(alertGrants[u.id] || []).length ? colors.orange : colors.coolText3} />
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
                      trackColor={{ true: colors.primary, false: colors.coolDivider }}
                    />
                  </View>
                ) : !isSuper ? (
                  <Edit3 size={15} color={colors.coolText3} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* Creating users is super-admin only (the API enforces it) — hide the button from others. */}
        {isSuper ? (
          <Pressable onPress={() => router.push('/admin/user-form')} className="flex-row items-center justify-center gap-1.5 mt-3"
            style={{ height: 50, borderRadius: 999, backgroundColor: colors.primary }}>
            <Plus size={17} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Invite user · pick role & access</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={signOut} className="flex-row items-center justify-center gap-2 mt-3"
          style={{ height: 50, borderRadius: 999, borderWidth: 1.5, borderColor: colors.danger + '55', backgroundColor: colors.card }}>
          <LogOut size={17} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>Sign out</Text>
        </Pressable>
      </ScrollView>

      {/* System-alert channel access (super-admin): which channels this user sees on Home. */}
      <Modal visible={!!alertsUser} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAlertsUser(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 18 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 4 }}>
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>System Alerts</Text>
              <Pressable onPress={() => setAlertsUser(null)} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={18} color={colors.coolText} /></Pressable>
            </View>
            <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12.5, marginBottom: 10 }}>
              {alertsUser?.name}{alertsUser?.roleName ? ` · ${alertsUser.roleName}` : ''}
            </Text>
            {channelOptions.map((opt, i) => (
              <View key={opt.grant} className="flex-row items-center gap-3"
                style={{ paddingVertical: 10, borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.coolDivider }}>
                <Text style={{ fontSize: 18 }}>{opt.icon}</Text>
                <Text style={{ flex: 1, color: colors.ink, fontSize: 14, fontWeight: '600' }}>{opt.name}</Text>
                {alertsUser ? (
                  <Switch
                    value={(alertGrants[alertsUser.id] || []).includes(opt.grant)}
                    onValueChange={(v) => toggleAlertGrant(alertsUser.id, opt.grant, v)}
                    trackColor={{ true: colors.primary, false: colors.coolDivider }}
                  />
                ) : null}
              </View>
            ))}
            <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 10 }}>
              Changes apply instantly on the user&apos;s phone. Super-admins always see every channel regardless of these switches.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Position editor (super-admin) */}
      <Modal visible={!!editing} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 18 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 4 }}>
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Position</Text>
              <Pressable onPress={() => setEditing(null)} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={18} color={colors.coolText} /></Pressable>
            </View>
            <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12.5, marginBottom: 12 }}>
              {editing?.name}{editing?.roleName ? ` · ${editing.roleName}` : ''}
            </Text>
            <TextInput
              value={posInput}
              onChangeText={setPosInput}
              autoFocus
              placeholder="e.g. Senior Finance Manager"
              placeholderTextColor={colors.coolText3}
              style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: colors.ink, fontWeight: '500' }}
              onSubmitEditing={savePosition}
              returnKeyType="done"
            />
            <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 8 }}>This is a display title only — it does not change the user&apos;s role or access. Leave blank to clear.</Text>

            {/* Attendance tracking toggle (saves immediately) */}
            <View className="flex-row items-center gap-3" style={{ marginTop: 14, paddingTop: 14, borderTopColor: colors.coolDivider, borderTopWidth: 1 }}>
              <View className="flex-1">
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>Take attendance</Text>
                <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 2 }}>Off = exempt (no check-in/out, hidden from the team list).</Text>
              </View>
              {editing ? (
                <Switch
                  value={tracking[editing.id] !== false}
                  onValueChange={(v) => toggleTracking(editing.id, v)}
                  trackColor={{ true: colors.primary, false: colors.coolDivider }}
                />
              ) : null}
            </View>

            <Pressable onPress={savePosition} disabled={savingPos} style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 999, height: 48, alignItems: 'center', justifyContent: 'center', opacity: savingPos ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{savingPos ? 'Saving…' : 'Save position'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

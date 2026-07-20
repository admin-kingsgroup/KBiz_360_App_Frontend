import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ChevronRight, Users, Shield, LogOut, Building2, Activity, Clock, MapPin, X, Pencil, KeyRound, Camera, FolderKanban } from 'lucide-react-native';
import { ROLE_ICONS } from '../../src/components/ui/roleIcons';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { ROLE_DEFS } from '../../src/constants/roles';
import { useUiStore } from '../../src/store/uiStore';
import { listCompanies, listUsers, listBranches, listRoles, updateMyProfile, setMyAvatar, changeMyPassword, humanizeRole, toUser } from '../../src/api/directory';
import { uploadFile, mediaUrl } from '../../src/api/media';
import { ApiError } from '../../src/api/client';
import { authApi } from '../../src/api';

// Profile tab — identity card + admin entries. Counts are loaded live from the CRM directory.
export default function Profile() {
  const router = useRouter();
  const user = useAccessStore((s) => s.user);
  const isSuper = !!useAccessStore((s) => s.access())?.isSuper;
  const showToast = useUiStore((s) => s.showToast);
  const [counts, setCounts] = useState({ companies: 0, users: 0, branches: 0, roles: 0 });
  const [loaded, setLoaded] = useState(false);
  const [meInfo, setMeInfo] = useState<{ position: string | null; roleName: string } | null>(null); // my position + real CRM role
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confPw, setConfPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  // Pick a photo → upload → set as profile picture (reflects everywhere via the directory + chat DTOs).
  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showToast('Photo permission denied'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setPicking(true);
    try {
      const up = await uploadFile({ uri: a.uri, name: a.fileName || 'avatar.jpg', mime: a.mimeType || 'image/jpeg' });
      await setMyAvatar(up.url);
      const cur = useAccessStore.getState().user;
      if (cur) useAccessStore.getState().setUser({ ...cur, avatar: mediaUrl(up.url) });
      // Sync authStore + the persisted session so the photo survives an app restart.
      void authApi.refreshMe();
      // Refresh the directory so the new photo also shows in member lists / Team & Users.
      listUsers().then((l) => useAccessStore.getState().setUsers(l.map(toUser))).catch(() => undefined);
      showToast('Profile picture updated');
    } catch (e) { showToast(e instanceof ApiError ? e.message : 'Could not update picture'); } finally { setPicking(false); }
  };

  const savePassword = () => {
    if (newPw.length < 6) { showToast('New password must be at least 6 characters'); return; }
    if (newPw !== confPw) { showToast('Passwords do not match'); return; }
    setSavingPw(true);
    changeMyPassword(curPw, newPw)
      .then(() => { showToast('Password changed'); setPwOpen(false); setCurPw(''); setNewPw(''); setConfPw(''); })
      .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not change password'))
      .finally(() => setSavingPw(false));
  };

  const openEdit = () => { setNameInput(user?.name ?? ''); setPhoneInput(''); setEditing(true); };
  const saveProfile = () => {
    const full = nameInput.trim();
    if (!full) { showToast('Name required'); return; }
    const parts = full.split(/\s+/);
    setSavingProfile(true);
    updateMyProfile({ firstName: parts[0] ?? '', lastName: parts.slice(1).join(' '), phone: phoneInput.trim() || null })
      .then(() => {
        const initials = parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
        if (user) useAccessStore.getState().setUser({ ...user, name: full, initials });
        // Sync authStore + the persisted session so the new name survives an app restart.
        void authApi.refreshMe();
        showToast('Profile updated');
        setEditing(false);
      })
      .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not update profile'))
      .finally(() => setSavingProfile(false));
  };

  useEffect(() => {
    let active = true;
    Promise.all([listCompanies(), listUsers(), listBranches(), listRoles()])
      .then(([c, u, b, r]) => {
        if (!active) return;
        setCounts({ companies: c.length, users: u.length, branches: b.length, roles: r.length });
        setLoaded(true);
        const me = u.find((x) => x.id === user?.id);
        if (me) {
          setMeInfo({ position: me.position ?? null, roleName: humanizeRole(me.role) });
          // Refresh the avatar from the server, but NEVER wipe an existing one with a stale null.
          if (me.avatar) { const cur = useAccessStore.getState().user; if (cur) useAccessStore.getState().setUser({ ...cur, avatar: mediaUrl(me.avatar) }); }
        }
      })
      .catch(() => { /* offline — leave counts at 0 */ });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;
  const rd = ROLE_DEFS[user.role];
  const RoleIcon = ROLE_ICONS[user.role];
  const n = (v: number) => (loaded ? String(v) : '–');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      {/* White header bar (standard chrome) */}
      <View className="flex-row items-center px-4" style={{ height: 60, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 }}>Profile</Text>
      </View>

      {/* flexGrow lets the content fill the screen height so the menu card can stretch to the bottom
          bar instead of leaving a gap above it (short lists on non-super accounts / tall screens). */}
      <ScrollView contentContainerStyle={{ paddingBottom: 32, paddingTop: 12, flexGrow: 1 }}>
        {/* Identity card — green hero */}
        <Pressable onPress={openEdit} className="mx-4 mb-4" style={{ borderRadius: 20, padding: 16, backgroundColor: colors.primary }}>
          <View className="flex-row items-center gap-3">
            <Pressable onPress={(e) => { e.stopPropagation?.(); void pickAvatar(); }} style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryDark, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.5)' }}>
              {user.avatar
                ? <Image source={{ uri: user.avatar }} style={{ width: 55, height: 55, borderRadius: 28 }} />
                : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 19 }}>{user.initials}</Text>}
              <View style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                {picking ? <ActivityIndicator size="small" color={colors.primary} /> : <Camera size={12} color={colors.primary} />}
              </View>
            </Pressable>
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <RoleIcon size={12} color="rgba(255,255,255,0.9)" />
                {/* Show the person's POSITION (job title) if set, else their real CRM role — not the tier badge. */}
                <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 }}>
                  {(meInfo?.position || meInfo?.roleName || rd.badge).toUpperCase()}
                </Text>
              </View>
              <Text style={{ color: '#fff', fontSize: 19, fontWeight: '700', marginTop: 2 }}>{user.name}</Text>
              {/* When a position is shown above, show the real role here too; otherwise the email. */}
              <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>{meInfo?.position && meInfo?.roleName ? `${meInfo.roleName} · ${user.email}` : user.email}</Text>
            </View>
            <ChevronRight size={20} color="rgba(255,255,255,0.75)" />
          </View>
          {/* Company-wide totals are a Super-Admin view — hidden for everyone else. */}
          {isSuper ? (
            <View className="flex-row mt-3 pt-3" style={{ gap: 20, borderTopColor: 'rgba(255,255,255,0.2)', borderTopWidth: 1 }}>
              {[[n(counts.companies), 'businesses'], [n(counts.users), 'users'], [n(counts.branches), 'branches']].map(([v, l]) => (
                <View key={l} className="flex-row items-baseline" style={{ gap: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{v}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>{l}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>

        {/* Admin sections — grows to fill the space between the identity card and the sign-out button. */}
        <View className="mx-4" style={{ flex: 1, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>
          {[
            // Everyone: personal settings.
            { key: 'attendance', label: 'Attendance', sub: 'Check in/out & team status', Icon: Clock, onPress: () => router.push('/attendance') },
            { key: 'password', label: 'Change password', sub: 'Update your sign-in password', Icon: KeyRound, onPress: () => setPwOpen(true) },
            // Workspace administration: Super-Admin only (each target screen also enforces its own guard).
            ...(isSuper ? [
              { key: 'office-locations', label: 'Office locations', sub: 'Set branch geofences for attendance', Icon: MapPin, onPress: () => router.push('/admin/office-locations') },
              { key: 'businesses', label: 'Businesses', sub: loaded ? `${counts.companies} business${counts.companies === 1 ? '' : 'es'} · ${counts.branches} branches` : 'Companies & branches', Icon: Building2, onPress: () => router.push('/admin/businesses') },
              { key: 'users', label: 'Team & Users', sub: loaded ? `${counts.users} people` : 'Team directory', Icon: Users, onPress: () => router.push('/admin/users') },
              { key: 'roles', label: 'Roles & Permissions', sub: loaded ? `${counts.roles}-tier access hierarchy` : 'Access hierarchy', Icon: Shield, onPress: () => router.push('/admin/roles') },
              { key: 'departments', label: 'Departments', sub: 'Create departments for a business or branch', Icon: FolderKanban, onPress: () => router.push('/admin/departments') },
              { key: 'kbiz-members', label: 'KBiz360 Members', sub: 'Toggle who belongs to KBiz360 · BOM', Icon: Building2, onPress: () => router.push('/admin/kbiz-members') },
              { key: 'chat-analytics', label: 'Chat Analytics', sub: 'Messaging insights & activity', Icon: Activity, onPress: () => router.push('/admin/chat-analytics') },
            ] : []),
          ].map((row, i) => (
            <Pressable key={row.key} onPress={row.onPress} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 px-4 py-3.5"
              style={{ borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.coolDivider }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <row.Icon size={19} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{row.label}</Text>
                <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 1 }}>{row.sub}</Text>
              </View>
              <ChevronRight size={18} color={colors.coolText3} />
            </Pressable>
          ))}
        </View>

        {/* Sign out */}
        <Pressable onPress={() => { void authApi.logout(); showToast('Signed out'); }} className="flex-row items-center justify-center gap-2 mx-4 mt-4"
          style={{ height: 50, borderRadius: 999, borderWidth: 1.5, borderColor: colors.danger + '55', backgroundColor: colors.card }}>
          <LogOut size={17} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>Sign out</Text>
        </Pressable>
      </ScrollView>

      {/* Edit profile */}
      <Modal visible={editing} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setEditing(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 18 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
              <View className="flex-row items-center gap-2"><Pencil size={18} color={colors.primary} /><Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Edit profile</Text></View>
              <Pressable onPress={() => setEditing(false)} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={18} color={colors.coolText} /></Pressable>
            </View>
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 }}>NAME</Text>
            <TextInput value={nameInput} onChangeText={setNameInput} autoFocus placeholder="Your name" placeholderTextColor={colors.coolText3}
              style={[pwInput, { fontWeight: '600' }]} />
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 }}>PHONE</Text>
            <TextInput value={phoneInput} onChangeText={setPhoneInput} keyboardType="phone-pad" placeholder="Optional" placeholderTextColor={colors.coolText3}
              style={pwInput} />
            <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 8 }}>Your email and role are managed by an administrator.</Text>
            <Pressable onPress={saveProfile} disabled={savingProfile} style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 999, height: 48, alignItems: 'center', justifyContent: 'center', opacity: savingProfile ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{savingProfile ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change password */}
      <Modal visible={pwOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPwOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 18 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
              <View className="flex-row items-center gap-2"><KeyRound size={18} color={colors.primary} /><Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Change password</Text></View>
              <Pressable onPress={() => setPwOpen(false)} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={18} color={colors.coolText} /></Pressable>
            </View>
            <TextInput value={curPw} onChangeText={setCurPw} secureTextEntry placeholder="Current password" placeholderTextColor={colors.coolText3} autoCapitalize="none"
              style={pwInput} />
            <TextInput value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="New password (min 6)" placeholderTextColor={colors.coolText3} autoCapitalize="none"
              style={[pwInput, { marginTop: 10 }]} />
            <TextInput value={confPw} onChangeText={setConfPw} secureTextEntry placeholder="Confirm new password" placeholderTextColor={colors.coolText3} autoCapitalize="none"
              style={[pwInput, { marginTop: 10 }]} />
            <Pressable onPress={savePassword} disabled={savingPw} style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 999, height: 48, alignItems: 'center', justifyContent: 'center', opacity: savingPw ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{savingPw ? 'Saving…' : 'Update password'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const pwInput = { backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: colors.ink, fontWeight: '500' as const };

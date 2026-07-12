import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ChevronRight, Users, Shield, LogOut, Building2, Activity, Clock, MapPin, X, Pencil, KeyRound, Camera } from 'lucide-react-native';
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
  const canManage = !!useAccessStore((s) => s.access())?.canManage;
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View className="px-4 py-2" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600', letterSpacing: -0.3 }}>Profile & Workspace</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32, paddingTop: 12 }}>
        {/* Identity card */}
        <Pressable onPress={openEdit} className="mx-4 mb-4" style={{ borderRadius: 16, padding: 16, backgroundColor: colors.ink }}>
          <View className="flex-row items-center gap-3">
            <Pressable onPress={(e) => { e.stopPropagation?.(); void pickAvatar(); }} style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.orange }}>
              {user.avatar
                ? <Image source={{ uri: user.avatar }} style={{ width: 52, height: 52, borderRadius: 26 }} />
                : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{user.initials}</Text>}
              <View style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.ink }}>
                {picking ? <ActivityIndicator size="small" color="#fff" /> : <Camera size={10} color="#fff" />}
              </View>
            </Pressable>
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <RoleIcon size={11} color={rd.color === colors.ink ? colors.orange : rd.color} />
                {/* Show the person's POSITION (job title) if set, else their real CRM role — not the tier badge. */}
                <Text numberOfLines={1} style={{ color: rd.color === colors.ink ? colors.orange : rd.color, fontSize: 9.5, fontWeight: '700', letterSpacing: 1.4 }}>
                  {(meInfo?.position || meInfo?.roleName || rd.badge).toUpperCase()}
                </Text>
              </View>
              <Text style={{ fontFamily: 'Fraunces', color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 2 }}>{user.name}</Text>
              {/* When a position is shown above, show the real role here too; otherwise the email. */}
              <Text numberOfLines={1} style={{ color: '#C5C5C8', fontSize: 10.5 }}>{meInfo?.position && meInfo?.roleName ? `${meInfo.roleName} · ${user.email}` : user.email}</Text>
            </View>
            <ChevronRight size={18} color="#C5C5C8" />
          </View>
          <View className="flex-row gap-4 mt-3 pt-3" style={{ borderTopColor: 'rgba(255,255,255,0.12)', borderTopWidth: 1 }}>
            {[[n(counts.companies), 'businesses'], [n(counts.users), 'users'], [n(counts.branches), 'branches']].map(([v, l]) => (
              <View key={l} className="flex-row items-baseline gap-1">
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{v}</Text>
                <Text style={{ color: '#C5C5C8', fontSize: 10 }}>{l}</Text>
              </View>
            ))}
          </View>
        </Pressable>

        {/* Admin sections */}
        <View className="mx-4" style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge, overflow: 'hidden' }}>
          {[
            { key: 'attendance', label: 'Attendance', sub: 'Check in/out & team status', Icon: Clock, onPress: () => router.push('/attendance') },
            { key: 'password', label: 'Change password', sub: 'Update your sign-in password', Icon: KeyRound, onPress: () => setPwOpen(true) },
            ...(canManage ? [{ key: 'office-locations', label: 'Office locations', sub: 'Set branch geofences for attendance', Icon: MapPin, onPress: () => router.push('/admin/office-locations') }] : []),
            { key: 'businesses', label: 'Businesses', sub: loaded ? `${counts.companies} business${counts.companies === 1 ? '' : 'es'} · ${counts.branches} branches` : 'Companies & branches', Icon: Building2, onPress: () => router.push('/admin/businesses') },
            { key: 'users', label: 'Team & Users', sub: loaded ? `${counts.users} people` : 'Team directory', Icon: Users, onPress: () => router.push('/admin/users') },
            { key: 'roles', label: 'Roles & Permissions', sub: loaded ? `${counts.roles}-tier access hierarchy` : 'Access hierarchy', Icon: Shield, onPress: () => router.push('/admin/roles') },
            ...(isSuper ? [{ key: 'chat-analytics', label: 'Chat Analytics', sub: 'Messaging insights & activity', Icon: Activity, onPress: () => router.push('/admin/chat-analytics') }] : []),
          ].map((row, i) => (
            <Pressable key={row.key} onPress={row.onPress} className="flex-row items-center gap-3 px-4 py-3.5"
              style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.cardEdge }}>
              <row.Icon size={18} color={colors.ink} />
              <View className="flex-1">
                <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{row.label}</Text>
                <Text style={{ color: colors.warmMute, fontSize: 10.5 }}>{row.sub}</Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        {/* Sign out */}
        <Pressable onPress={() => { void authApi.logout(); showToast('Signed out'); }} className="flex-row items-center justify-center gap-2 mx-4 mt-3"
          style={{ paddingVertical: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.coral + '40' }}>
          <LogOut size={15} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: '700' }}>Sign out → back to Login</Text>
        </Pressable>
      </ScrollView>

      {/* Edit profile */}
      <Modal visible={editing} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setEditing(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
              <View className="flex-row items-center gap-1.5"><Pencil size={15} color={colors.ink} /><Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '700' }}>Edit profile</Text></View>
              <Pressable onPress={() => setEditing(false)} hitSlop={8}><X size={18} color={colors.textMuted} /></Pressable>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 }}>NAME</Text>
            <TextInput value={nameInput} onChangeText={setNameInput} autoFocus placeholder="Your name" placeholderTextColor={colors.textMuted}
              style={{ borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.ink, fontWeight: '700' }} />
            <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 }}>PHONE</Text>
            <TextInput value={phoneInput} onChangeText={setPhoneInput} keyboardType="phone-pad" placeholder="Optional" placeholderTextColor={colors.textMuted}
              style={{ borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.ink, fontWeight: '600' }} />
            <Text style={{ color: colors.textMuted2, fontSize: 10, marginTop: 8 }}>Your email and role are managed by an administrator.</Text>
            <Pressable onPress={saveProfile} disabled={savingProfile} style={{ marginTop: 14, backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: savingProfile ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{savingProfile ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change password */}
      <Modal visible={pwOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPwOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
              <View className="flex-row items-center gap-1.5"><KeyRound size={15} color={colors.ink} /><Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '700' }}>Change password</Text></View>
              <Pressable onPress={() => setPwOpen(false)} hitSlop={8}><X size={18} color={colors.textMuted} /></Pressable>
            </View>
            <TextInput value={curPw} onChangeText={setCurPw} secureTextEntry placeholder="Current password" placeholderTextColor={colors.textMuted} autoCapitalize="none"
              style={pwInput} />
            <TextInput value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="New password (min 6)" placeholderTextColor={colors.textMuted} autoCapitalize="none"
              style={[pwInput, { marginTop: 10 }]} />
            <TextInput value={confPw} onChangeText={setConfPw} secureTextEntry placeholder="Confirm new password" placeholderTextColor={colors.textMuted} autoCapitalize="none"
              style={[pwInput, { marginTop: 10 }]} />
            <Pressable onPress={savePassword} disabled={savingPw} style={{ marginTop: 14, backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: savingPw ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{savingPw ? 'Saving…' : 'Update password'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const pwInput = { borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.ink, fontWeight: '600' as const };

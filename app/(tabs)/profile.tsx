import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { ChevronRight, Users, Shield, LogOut, LogIn, Building2, Activity, Clock, MapPin, X, Pencil, KeyRound, Camera, HardDrive, Lock, Palmtree, ClipboardCheck, CalendarDays, ReceiptIndianRupee } from 'lucide-react-native';
import { ROLE_ICONS } from '../../src/components/ui/roleIcons';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { ROLE_DEFS } from '../../src/constants/roles';
import { useUiStore } from '../../src/store/uiStore';
import { listCompanies, listUsers, listBranches, listRoles, updateMyProfile, setMyAvatar, changeMyPassword, humanizeRole } from '../../src/api/directory';
import { refreshDirectoryUsers } from '../../src/store/directoryStore';
import { uploadFile, mediaUrl } from '../../src/api/media';
import { ApiError } from '../../src/api/client';
import { authApi } from '../../src/api';
import { getMyAttendance } from '../../src/api/attendance';
import { getMyAttendanceMonth } from '../../src/api/hr';

// "HH:MM" wall-clock for an ISO timestamp (hero attendance stat) — mirrors the Chats header chip.
const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

// Profile tab — identity card + admin entries. Counts are loaded live from the CRM directory.
export default function Profile() {
  const router = useRouter();
  const user = useAccessStore((s) => s.user);
  const isSuper = !!useAccessStore((s) => s.access())?.isSuper;
  const showToast = useUiStore((s) => s.showToast);
  const [counts, setCounts] = useState({ companies: 0, users: 0, branches: 0, roles: 0 });
  const [loaded, setLoaded] = useState(false);
  const [meInfo, setMeInfo] = useState<{ position: string | null; roleName: string } | null>(null); // my position + real CRM role
  // Hero stat strip — today's punch, paid-leave balance and days present this month. Two calls:
  // /attendance/me for today, /hr/my-attendance for the month (it carries leaveBalance AND the
  // present count, so the balance needs no separate /hr/my-leave round trip).
  const [today, setToday] = useState<{ inTime: string | null; outTime: string | null; exempt: boolean } | null>(null);
  const [month, setMonth] = useState<{ leaveBalance: number | null; present: number; exempt: boolean } | null>(null);
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
      void refreshDirectoryUsers({ force: true });
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

  // Prefill the existing phone — seeding '' meant an untouched Save sent phone:null and wiped it.
  const openEdit = () => { setNameInput(user?.name ?? ''); setPhoneInput(user?.phone ?? ''); setEditing(true); };
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
        // Refresh the directory so the new name/phone shows in member lists / Team & Users now.
        void refreshDirectoryUsers({ force: true });
        showToast('Profile updated');
        setEditing(false);
      })
      .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not update profile'))
      .finally(() => setSavingProfile(false));
  };

  // Refetch on focus (the tab stays mounted all session) so counts reflect businesses/branches/users
  // created elsewhere in the app without a restart.
  useFocusEffect(useCallback(() => {
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
    // Hero stats. Deliberately NOT in the Promise.all above: the directory counts and the HR stats
    // fail independently (a user with no ERP record still gets counts, and vice versa), so one
    // rejection must not blank the other half of the screen.
    getMyAttendance()
      .then((m) => { if (active) setToday({ inTime: m.inTime, outTime: m.outTime, exempt: !!m.exempt }); })
      .catch(() => { /* offline — hero falls back to '–' */ });
    getMyAttendanceMonth()
      .then((m) => { if (active) setMonth({ leaveBalance: m.leaveBalance?.balance ?? null, present: m.summary.present, exempt: m.exempt }); })
      .catch(() => { /* offline — hero falls back to '–' */ });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  if (!user) return null;
  const rd = ROLE_DEFS[user.role];
  const RoleIcon = ROLE_ICONS[user.role];

  // Attendance is not tracked for exempt users — their TODAY stat and the check-in/out quick action
  // are dropped rather than shown as a permanent "Absent".
  const exempt = !!today?.exempt || !!month?.exempt;
  // 'in' = punched in, still open · 'done' = in and out · 'out' = no punch yet today.
  const punch: 'in' | 'out' | 'done' = today?.inTime ? (today.outTime ? 'done' : 'in') : 'out';
  const todayStat = !today ? '–'
    : today.inTime ? (today.outTime ? `${hhmm(today.inTime)}–${hhmm(today.outTime)}` : `In ${hhmm(today.inTime)}`)
    : 'Absent';
  // The ERP accrues 2.5 days a month, so a balance is often fractional — trim the '.0' but keep '.5'.
  const days = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const leaveStat = month?.leaveBalance != null ? `${days(month.leaveBalance)} days` : '–';
  const monthStat = month ? `${month.present} present` : '–';
  const stats = [
    ...(exempt ? [] : [{ k: 'TODAY', v: todayStat, live: punch === 'in' }]),
    { k: 'LEAVE LEFT', v: leaveStat, live: false },
    { k: 'THIS MONTH', v: monthStat, live: false },
  ];
  // First quick action tracks the punch state; all three are navigations, never a punch — punching
  // needs the geofence/permission checks that live on the Attendance screen.
  const punchAction = punch === 'in' ? { label: 'Check out', Icon: LogOut }
    : punch === 'out' ? { label: 'Check in', Icon: LogIn }
    : { label: 'Attendance', Icon: Clock };
  const quickActions = [
    ...(exempt ? [] : [{ key: 'punch', label: punchAction.label, Icon: punchAction.Icon, tint: colors.primary, onPress: () => router.navigate('/attendance') }]),
    { key: 'leave', label: 'Apply leave', Icon: Palmtree, tint: colors.teal, onPress: () => router.push('/hr/leave') },
    { key: 'payslip', label: 'Payslip', Icon: ReceiptIndianRupee, tint: colors.purple, onPress: () => router.push('/hr/payslip') },
  ];

  return (
    // top only — the tab navigator already reserves the bottom inset inside the tab bar height;
    // including 'bottom' here would double it and strand the footer above a dead strip.
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      {/* White header bar (standard chrome) */}
      <View className="flex-row items-center px-4" style={{ height: 60, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 }}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24, paddingTop: 12 }}>
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
              <Text numberOfLines={1} style={{ color: '#fff', fontSize: 19, fontWeight: '700' }}>{user.name}</Text>
              <View className="flex-row items-center" style={{ gap: 6, marginTop: 5 }}>
                {/* Show the person's POSITION (job title) if set, else their real CRM role — not the tier badge. */}
                <View className="flex-row items-center" style={{ gap: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <RoleIcon size={11} color="#fff" />
                  <Text numberOfLines={1} style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>
                    {(meInfo?.position || meInfo?.roleName || rd.badge).toUpperCase()}
                  </Text>
                </View>
                <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11.5, flexShrink: 1 }}>{user.email}</Text>
              </View>
            </View>
            <ChevronRight size={20} color="rgba(255,255,255,0.75)" />
          </View>
          {/* Personal stat strip — shown to EVERYONE (the old company-wide totals were Super-Admin
              only, leaving this space dead for most people; those counts still read on the
              Administration rows below). Values fall back to '–' until the fetches land. */}
          <View className="flex-row mt-3 pt-3" style={{ borderTopColor: 'rgba(255,255,255,0.2)', borderTopWidth: 1 }}>
            {stats.map((s, i) => (
              <View key={s.k} className="flex-row flex-1">
                {i > 0 ? <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: 12 }} /> : null}
                <View className="flex-1">
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9.5, fontWeight: '700', letterSpacing: 1 }}>{s.k}</Text>
                  <View className="flex-row items-center" style={{ gap: 5, marginTop: 3 }}>
                    {s.live ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }} /> : null}
                    <Text numberOfLines={1} style={{ color: '#fff', fontSize: 14.5, fontWeight: '700' }}>{s.v}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </Pressable>

        {/* Quick actions — the three things people open this tab to do, one tap instead of two. */}
        <View className="flex-row mx-4 mb-4" style={{ gap: 10 }}>
          {quickActions.map((a) => (
            <Pressable key={a.key} onPress={a.onPress} android_ripple={{ color: colors.coolMuted }}
              className="flex-1 items-center" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 8, gap: 6 }}>
              <a.Icon size={20} color={a.tint} />
              <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 12.5, fontWeight: '600' }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Menu — labeled sections, each row with its own tinted icon chip (settings-app language).
            Cards hug their rows; the flexible spacer after them absorbs leftover height. */}
        {[
          // Work vs app settings were one undifferentiated 7-row list; splitting them lets the eye
          // skip the half it isn't looking for.
          {
            title: 'Work',
            rows: [
              { key: 'attendance', label: 'Attendance', sub: 'Check in/out & team status', Icon: Clock, tint: colors.primary, value: punch === 'in' && !exempt ? 'In' : null, chip: true, onPress: () => router.navigate('/attendance') },
              { key: 'leave', label: 'Paid leave', sub: 'Balance & leave applications', Icon: Palmtree, tint: colors.teal, value: month?.leaveBalance != null ? days(month.leaveBalance) : null, chip: false, onPress: () => router.push('/hr/leave') },
              { key: 'my-month', label: 'My Attendance', sub: 'Month calendar & holiday list', Icon: CalendarDays, tint: colors.blue, value: null, chip: false, onPress: () => router.push('/hr/month') },
              { key: 'payslip', label: 'My Payslip', sub: 'Monthly earnings & deductions', Icon: ReceiptIndianRupee, tint: colors.purple, value: null, chip: false, onPress: () => router.push('/hr/payslip') },
            ],
          },
          {
            title: 'App & privacy',
            rows: [
              { key: 'password', label: 'Change password', sub: 'Update your sign-in password', Icon: KeyRound, tint: colors.orange, value: null, chip: false, onPress: () => setPwOpen(true) },
              { key: 'chat-privacy', label: 'Chat privacy', sub: 'Last seen, read receipts, blocked contacts', Icon: Lock, tint: colors.blue, value: null, chip: false, onPress: () => router.push('/chat/privacy') },
              { key: 'storage', label: 'Storage', sub: 'Chats and downloads kept on this phone', Icon: HardDrive, tint: colors.teal, value: null, chip: false, onPress: () => router.push('/storage') },
            ],
          },
          // Workspace administration: Super-Admin only (each target screen also enforces its own guard).
          ...(isSuper ? [{
            title: 'Administration',
            rows: [
              { key: 'office-locations', label: 'Office locations', sub: 'Set branch geofences for attendance', Icon: MapPin, tint: colors.coral, value: null, chip: false, onPress: () => router.push('/admin/office-locations') },
              { key: 'regularizations', label: 'Time corrections', sub: 'Approve staff attendance-time requests', Icon: ClipboardCheck, tint: colors.orange, value: null, chip: false, onPress: () => router.push('/admin/regularizations') },
              { key: 'businesses', label: 'Businesses', sub: loaded ? `${counts.companies} business${counts.companies === 1 ? '' : 'es'} · ${counts.branches} branches` : 'Companies & branches', Icon: Building2, tint: colors.blue, value: null, chip: false, onPress: () => router.push('/admin/businesses') },
              { key: 'users', label: 'Team & Users', sub: loaded ? `${counts.users} people` : 'Team directory', Icon: Users, tint: colors.purple, value: null, chip: false, onPress: () => router.push('/admin/users') },
              { key: 'roles', label: 'Roles & Permissions', sub: loaded ? `${counts.roles}-tier access hierarchy` : 'Access hierarchy', Icon: Shield, tint: colors.teal, value: null, chip: false, onPress: () => router.push('/admin/roles') },
              { key: 'kbiz-members', label: 'KBiz360 Members', sub: 'Toggle who belongs to KBiz360 · BOM', Icon: Building2, tint: colors.primary, value: null, chip: false, onPress: () => router.push('/admin/kbiz-members') },
              { key: 'chat-analytics', label: 'Chat Analytics', sub: 'Messaging insights & activity', Icon: Activity, tint: colors.blue, value: null, chip: false, onPress: () => router.push('/admin/chat-analytics') },
            ],
          }] : []),
        ].map((sec) => (
          <View key={sec.title} className="mb-4">
            <Text className="mx-5 mb-1.5" style={{ color: colors.coolText, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>{sec.title.toUpperCase()}</Text>
            <View className="mx-4" style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>
              {sec.rows.map((row, i) => (
                <Pressable key={row.key} onPress={row.onPress} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 px-4 py-3.5"
                  style={{ borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.coolDivider }}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: `${row.tint}1A`, alignItems: 'center', justifyContent: 'center' }}>
                    <row.Icon size={19} color={row.tint} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{row.label}</Text>
                    <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12.5, marginTop: 1 }}>{row.sub}</Text>
                  </View>
                  {/* Right-edge value — answers the row without opening it (live punch state, leave balance). */}
                  {row.value ? (
                    row.chip
                      ? <View style={{ backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginRight: 2 }}>
                          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{row.value}</Text>
                        </View>
                      : <Text style={{ color: colors.coolText, fontSize: 13, fontWeight: '600', marginRight: 2 }}>{row.value}</Text>
                  ) : null}
                  <ChevronRight size={18} color={colors.coolText3} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* Sign out rides at the END of the scroll rather than in a pinned footer. The pinned bar
            cost ~88px of permanent height and the list scrolled underneath it, so the last row was
            always clipped mid-row; in-flow it can't overlap anything. */}
        <View style={{ paddingHorizontal: 16, paddingTop: 2 }}>
          <Pressable onPress={() => { void authApi.logout(); showToast('Signed out'); }} className="flex-row items-center justify-center gap-2"
            style={{ height: 48, borderRadius: 999, borderWidth: 1.5, borderColor: colors.danger + '55', backgroundColor: colors.card }}>
            <LogOut size={17} color={colors.danger} />
            <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>Sign out</Text>
          </Pressable>
          <Text style={{ color: colors.coolText3, fontSize: 11.5, marginTop: 10, textAlign: 'center' }}>
            KBiz360 Smart Connect · v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>

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

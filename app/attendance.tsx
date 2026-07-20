import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, Alert, Linking, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { ChevronLeft, ChevronRight, Clock, Check, Navigation, Zap, ScanFace, Lock, CheckCircle2, ArrowDownLeft, ArrowUpRight, MapPinOff, MapPin, Building2, X } from 'lucide-react-native';
import { Modal } from 'react-native';
import { Avatar } from '../src/components/ui';
import { colors } from '../src/theme';
import { useGeoFence } from '../src/hooks/useGeoFence';
import { useAttendanceStore } from '../src/store/attendanceStore';
import { useAccessStore } from '../src/store/accessStore';
import { useUiStore } from '../src/store/uiStore';
import { canFacePunch, nextAwaySince, awayLongEnough } from '../src/logic/attendance';
import { saveConsent } from '../src/services/storage';
import { checkIn, checkOut, getMyAttendance, getTeamAttendance, getAttendanceHistory, getUserAttendanceHistory, adminSetAttendanceDay, getOffices, getAdminOffices, assignUserOffice, assignUserWorkBranch, type AttendanceOffice, type AttendanceHistoryEntry, type AdminBranchOffices } from '../src/api/attendance';
import { getCurrentSsid } from '../src/services/wifi';
import { ssidMatches } from '../src/logic/wifi';
import { syncAttendanceGeofencing, getBackgroundLocationState, type BackgroundLocationState } from '../src/services/backgroundAttendance';
import { ApiError } from '../src/api/client';
import type { PunchMethod, TeamAttendanceEntry } from '../src/types';

const WARN = '#E8A13A'; // semantic warning (orange) — kept distinct from the brand green.
const fmt = (d: Date | null) => (d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null);
// Device-local 'YYYY-MM-DD' key (matches the backend business day for on-site devices).
const keyOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayKey = (): string => keyOf(new Date());
// 'YYYY-MM-DD' → "Today" / "Yesterday" / "Mon 26 May" for the history list.
const dateLabel = (key: string): string => {
  const d = new Date(key + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === yest.getTime()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
};

// Attendance — faithful port of source AttendanceScreen, wired to the tested attendanceStore
// (computePresence/autoPunch/canFacePunch/facePunch). Wi-Fi is a simulated toggle (source-faithful);
// geofence uses expo-location via useGeoFence; face fallback is biometric (expo-local-authentication),
// no ML. Consent-gated on first use.
export default function Attendance() {
  const router = useRouter();
  const [offices, setOffices] = useState<AttendanceOffice[]>([]);
  const [office, setOffice] = useState<AttendanceOffice | null>(null);
  const [tab, setTab] = useState<'mine' | 'team'>('mine');
  const [clock, setClock] = useState(new Date());
  const [scanning, setScanning] = useState(false);
  const [team, setTeam] = useState<TeamAttendanceEntry[]>([]);
  const [teamDate, setTeamDate] = useState(todayKey()); // day shown on the admin team tab
  const [history, setHistory] = useState<AttendanceHistoryEntry[]>([]);
  const [userHistory, setUserHistory] = useState<AttendanceHistoryEntry[] | null>(null); // selected teammate's recent days (admin modal)
  const [adminOffices, setAdminOffices] = useState<AdminBranchOffices[]>([]); // for the super-admin reassign picker
  const [reassign, setReassign] = useState<TeamAttendanceEntry | null>(null);
  const [exempt, setExempt] = useState(false); // this account is exempt from attendance
  const [ssid, setSsid] = useState<string | null>(null); // Wi-Fi network the device is on (null when unreadable)
  const awaySinceRef = useRef<number | null>(null); // confirmed-outside timer for the auto check-out grace
  const autoBlockedUntilRef = useRef(0); // back-off after the server rejects an auto punch (no retry storm)

  const role = useAccessStore((s) => s.user?.role);
  const isSuper = role === 'SUPER_ADMIN';
  const consent = useAttendanceStore((s) => s.consent);
  const att = useAttendanceStore((s) => s.att);
  const presence = useAttendanceStore((s) => s.presence);
  const refreshPresence = useAttendanceStore((s) => s.refreshPresence);
  const runAutoPunch = useAttendanceStore((s) => s.runAutoPunch);
  const showToast = useUiStore((s) => s.showToast);

  const { coords, geoState } = useGeoFence(office);

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  // Poll the connected Wi-Fi SSID (Android needs location perms/services on to read it; the
  // consent flow already asks). Drives the Wi-Fi half of presence — verified again server-side.
  useEffect(() => {
    let alive = true;
    const read = (): void => { void getCurrentSsid().then((s) => { if (alive) setSsid(s); }); };
    read();
    const t = setInterval(read, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Background-location state drives the "Allow all the time" banner; re-checked when the app
  // returns from Settings (AppState active) so the banner clears the moment the user grants it.
  const [bgLocation, setBgLocation] = useState<BackgroundLocationState>('granted');
  useEffect(() => {
    const check = (): void => { void getBackgroundLocationState().then(setBgLocation); };
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { check(); void syncAttendanceGeofencing(); } });
    return () => sub.remove();
  }, []);

  // Load the caller's office geofence(s), today's record, history, and the team view on open.
  useEffect(() => {
    getOffices().then((list) => { setOffices(list); setOffice((cur) => cur ?? list[0] ?? null); }).catch(() => undefined);
    void syncAttendanceGeofencing(); // ensure background geofencing is registered for the user's offices

    getMyAttendance()
      .then((m) => { setExempt(!!m.exempt); useAttendanceStore.getState().setAtt({ inTime: m.inTime ? new Date(m.inTime) : null, outTime: m.outTime ? new Date(m.outTime) : null, via: (m.via as PunchMethod | null) ?? null }); })
      .catch(() => undefined);
    getAttendanceHistory().then(setHistory).catch(() => undefined);
    if (isSuper) getAdminOffices().then(setAdminOffices).catch(() => undefined); // offices for the reassign picker
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Team view follows the selected day (today by default; admin can browse past days).
  const loadTeam = (): Promise<void> =>
    getTeamAttendance(teamDate === todayKey() ? undefined : teamDate).then(setTeam).catch(() => undefined);
  useEffect(() => { void loadTeam(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamDate]);
  const shiftTeamDay = (n: number): void => {
    setTeamDate((cur) => {
      const d = new Date(cur + 'T00:00:00');
      d.setDate(d.getDate() + n);
      const next = keyOf(d);
      return next > todayKey() ? cur : next;
    });
  };

  // Selected teammate's recent attendance for the admin modal (null = loading).
  useEffect(() => {
    if (!reassign || !isSuper) { setUserHistory(null); return; }
    setUserHistory(null);
    getUserAttendanceHistory(reassign.id, 14).then(setUserHistory).catch(() => setUserHistory([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reassign?.id]);

  // Super-admin: move a teammate to a different office (or back to the branch default).
  const reassignTo = (userId: string, officeId: string | null): void => {
    assignUserOffice(userId, officeId)
      .then(() => { showToast('Office updated'); setReassign(null); void loadTeam(); })
      .catch(() => showToast('Could not update office'));
  };
  // Super-admin: set a teammate's WORKING branch (where they mark attendance). Keeps the modal open,
  // re-pointed at the refreshed entry, so the office list below re-scopes to the new branch.
  const reassignBranchTo = (userId: string, branchId: string | null): void => {
    assignUserWorkBranch(userId, branchId)
      .then(() => {
        showToast('Working branch updated');
        return getTeamAttendance(teamDate === todayKey() ? undefined : teamDate).then((list) => {
          setTeam(list);
          setReassign((cur) => (cur ? list.find((t) => t.id === cur.id) ?? null : null));
        });
      })
      .catch(() => showToast('Could not update branch'));
  };
  const reassignBranchOffices = reassign ? (adminOffices.find((b) => b.branchId === reassign.branchId)?.offices ?? []) : [];

  // Super-admin: correct one day for the selected teammate (present 10:00–19:00 / absent).
  // Stored server-side as 'Manual' with the admin's id, so corrections stay distinguishable.
  const setMemberDay = (date: string, present: boolean): void => {
    if (!reassign) return;
    adminSetAttendanceDay({ userId: reassign.id, date, present })
      .then(() => {
        showToast(present ? 'Marked present (Manual)' : 'Marked absent');
        getUserAttendanceHistory(reassign.id, 14).then(setUserHistory).catch(() => undefined);
        if (date === teamDate) void loadTeam(); // the day being shown on the team tab changed
      })
      .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not update the day'));
  };

  // Persist a punch to the backend and adopt the server's record. `silent` = auto (no success
  // toast). Failures are NEVER silent: the server is the record of truth, so on rejection we
  // re-adopt its state (the optimistic local punch would otherwise show "checked in" all day
  // while the server has nothing — the person then reads as absent tomorrow) and tell the user.
  const apiPunch = async (kind: 'in' | 'out', method: 'auto' | 'face', silent = false): Promise<void> => {
    try {
      const body = { coords: coords ? { lat: coords.lat, lng: coords.lng } : null, method, wifiSsid: ssid };
      const m = kind === 'in' ? await checkIn(body) : await checkOut(body);
      useAttendanceStore.getState().setAtt({ inTime: m.inTime ? new Date(m.inTime) : null, outTime: m.outTime ? new Date(m.outTime) : null, via: (m.via as PunchMethod | null) ?? null });
      getAttendanceHistory().then(setHistory).catch(() => undefined);
      if (!silent) showToast(kind === 'in' ? `Checked in · ${fmt(m.inTime ? new Date(m.inTime) : null)}` : `Checked out · ${fmt(m.outTime ? new Date(m.outTime) : null)}`);
    } catch (e) {
      if (silent) autoBlockedUntilRef.current = Date.now() + 60_000; // don't re-fire auto punch for a minute
      try {
        const m = await getMyAttendance(); // revert the optimistic local state to the server's truth
        useAttendanceStore.getState().setAtt({ inTime: m.inTime ? new Date(m.inTime) : null, outTime: m.outTime ? new Date(m.outTime) : null, via: (m.via as PunchMethod | null) ?? null });
      } catch { /* offline — keep local state; next open reconciles via getMyAttendance */ }
      showToast(`${kind === 'in' ? 'Check-in' : 'Check-out'} NOT recorded — ${e instanceof ApiError ? e.message : 'network error'}`);
    }
  };

  // Recompute presence (office Wi-Fi match OR geofence) whenever GPS, Wi-Fi or office changes,
  // then auto-punch. The backend re-verifies both the location and the SSID on every punch.
  // Auto check-IN is instant; auto check-OUT needs a CONFIRMED outside reading sustained for the
  // grace period — a lost GPS fix is unknown, not "left" (it once closed a day 4 s after check-in).
  // `clock` keeps this re-evaluating every second so the grace timer fires even if GPS goes quiet.
  useEffect(() => {
    if (!office) return;
    const wifiOn = ssidMatches(ssid, office.wifiSsid);
    const p = refreshPresence({ wifiOn, coords, office: { lat: office.lat, lng: office.lng, radius: office.radius } });
    awaySinceRef.current = nextAwaySince(p, awaySinceRef.current, Date.now());
    if (!p.present && !awayLongEnough(awaySinceRef.current, Date.now())) return; // unknown / not away long enough
    if (Date.now() < autoBlockedUntilRef.current) return; // recent server rejection — wait before retrying
    const fired = runAutoPunch();
    if (fired) {
      const a = useAttendanceStore.getState().att;
      if (a.outTime) { showToast('Auto check-out · ' + fmt(a.outTime)); void apiPunch('out', 'auto', true); }
      else if (a.inTime) { showToast('Auto check-in · ' + fmt(a.inTime) + ' · ' + (p.viaNow || 'Auto')); void apiPunch('in', 'auto', true); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, ssid, office, clock, refreshPresence, runAutoPunch, showToast]);

  const inTime = att.inTime;
  const outTime = att.outTime;
  const present = presence?.present ?? false;
  const viaNow = presence?.viaNow ?? '';
  const distance = presence?.distance ?? null;
  const inside = presence?.inside ?? false;

  const agree = () => { useAttendanceStore.getState().setConsent(true); void saveConsent(true); };

  // Biometric face fallback (no ML) — gated by foundation canFacePunch.
  const faceScan = async () => {
    if (!canFacePunch(present, att, scanning)) { if (!present) showToast('Face punch needs office Wi-Fi or geofence'); return; }
    setScanning(true);
    try {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = has && (await LocalAuthentication.isEnrolledAsync());
      const res = enrolled ? await LocalAuthentication.authenticateAsync({ promptMessage: 'Verify to punch attendance' }) : { success: true };
      if (res.success) {
        const kind: 'in' | 'out' | null = !inTime ? 'in' : (!outTime ? 'out' : null);
        if (kind) await apiPunch(kind, 'face');
      } else {
        showToast('Face verification cancelled');
      }
    } catch {
      Alert.alert('Biometric unavailable', 'Could not start face/fingerprint verification on this device.');
    } finally {
      setScanning(false);
    }
  };

  const punchPresent = () => {
    if (!present) { showToast('Need office Wi-Fi or geofence'); return; }
    const kind: 'in' | 'out' | null = !inTime ? 'in' : (!outTime ? 'out' : null);
    if (kind) void apiPunch(kind, 'auto');
  };

  // ---- Consent gate ----
  if (!consent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
        <Header title="Attendance consent" onBack={() => router.back()} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><Clock size={28} color={colors.primary} /></View>
          <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700', marginBottom: 8 }}>How attendance works</Text>
          <Text style={{ color: colors.coolText, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>When you open KBiz 360 at the office, you are checked in automatically via office Wi-Fi or geofence. Face punch is a manual backup if auto-detection fails.</Text>
          {([
            ['Automatic first', 'On office Wi-Fi or inside the geofence, check-in / check-out happen on their own.'],
            ['Face = backup', 'If auto-detection fails, punch manually by face (still at the office) so no one is wrongly marked absent.'],
            ['What we record', 'Only check-in / check-out time, date, and method (Wi-Fi, Geofence or Face).'],
            ['Who can see it', 'You see your own record. Only your Super Admin sees the team dashboard. Times feed your Accounts software.'],
          ] as [string, string][]).map(([t, d]) => (
            <View key={t} className="flex-row gap-3 mb-3">
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}><Check size={12} color={colors.primary} strokeWidth={3} /></View>
              <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{t}</Text><Text style={{ color: colors.coolText, fontSize: 13, lineHeight: 18 }}>{d}</Text></View>
            </View>
          ))}
          <Pressable onPress={agree} style={{ marginTop: 16, height: 52, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>I understand & agree</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const dateStr = clock.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const punchedVia = att.via || '';
  const statusColor = inTime ? (outTime ? colors.coolText : colors.primary) : (present ? colors.primary : colors.danger);
  const statusText = inTime ? (outTime ? 'Done for today' : 'Checked in') : (present ? 'Detecting' : 'Not checked in');

  const presentCount = team.filter((t) => t.in).length;
  const absentCount = team.length - presentCount;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <Header title="Attendance" subtitle="Auto first · face is backup" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Auto-punch needs "Allow all the time" location. Android 11+ never shows that option in
            the in-app dialog — the user must flip it in Settings, so guide them there. */}
        {bgLocation === 'denied' || bgLocation === 'undetermined' ? (
          <Pressable
            onPress={() => { void Linking.openSettings(); }}
            className="flex-row items-center gap-2.5 p-3 mb-3"
            style={{ borderRadius: 14, backgroundColor: WARN + '14', borderWidth: 1, borderColor: WARN + '40' }}
          >
            <MapPinOff size={18} color={WARN} />
            <View className="flex-1">
              <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '700' }}>Auto check-in is off</Text>
              <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 1 }}>
                Set location to “Allow all the time” so the office geofence can punch you in even when the app is closed.
              </Text>
            </View>
            <Text style={{ color: WARN, fontSize: 12.5, fontWeight: '700' }}>Settings</Text>
          </Pressable>
        ) : null}
        {isSuper ? (
          <View className="flex-row p-1 mb-3" style={{ borderRadius: 999, backgroundColor: colors.coolMuted }}>
            {([['mine', 'My attendance'], ['team', 'Team · Admin']] as const).map(([k, l]) => (
              <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, paddingVertical: 9, borderRadius: 999, backgroundColor: tab === k ? colors.primary : 'transparent', alignItems: 'center' }}>
                <Text style={{ color: tab === k ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>{l}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {isSuper && tab === 'team' ? (
          <>
            {/* Day navigator — browse any past day's team attendance. */}
            <View className="flex-row items-center justify-between mb-3" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, borderRadius: 14, paddingHorizontal: 4, paddingVertical: 4 }}>
              <Pressable onPress={() => shiftTeamDay(-1)} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <ChevronLeft size={20} color={colors.ink} />
              </Pressable>
              <Pressable onPress={() => setTeamDate(todayKey())} disabled={teamDate === todayKey()} className="items-center">
                <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>{dateLabel(teamDate)}</Text>
                {teamDate !== todayKey() ? <Text style={{ color: colors.primary, fontSize: 10.5, fontWeight: '700' }}>tap for today</Text> : null}
              </Pressable>
              <Pressable onPress={() => shiftTeamDay(1)} disabled={teamDate === todayKey()} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: teamDate === todayKey() ? 0.25 : 1 }}>
                <ChevronRight size={20} color={colors.ink} />
              </Pressable>
            </View>
            <View className="flex-row gap-2 mb-3">
              <Stat3 n={presentCount} label="Present" color={colors.primary} bg={colors.primarySoft} />
              <Stat3 n={absentCount} label="Absent" color={colors.danger} bg={colors.danger + '12'} />
              <Stat3 n={team.length} label="Total" color={colors.ink} bg={colors.coolMuted} />
            </View>
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 }}>{dateLabel(teamDate).toUpperCase()} · TEAM</Text>
            <View style={{ gap: 8 }}>
              {team.map((t) => {
                const absent = !t.in;
                return (
                  <Pressable key={t.id} disabled={!isSuper} onPress={() => setReassign(t)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 p-3" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: absent ? colors.danger + '40' : colors.coolDivider, borderRadius: 14 }}>
                    <Avatar initials={t.initials} color={t.color} size={44} />
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }}>{t.name}</Text>
                        {t.position ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 11, flexShrink: 1 }}>· {t.position}</Text> : null}
                      </View>
                      {absent
                        ? <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 2 }}>{t.branch} · Absent</Text>
                        : <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12, marginTop: 2 }}>{t.branch} · In {t.in}{t.out ? ' · Out ' + t.out : ''} · {t.via}</Text>}
                      {/* Office the person reports at — super-admin taps the row to reassign. */}
                      <View className="flex-row items-center gap-1" style={{ marginTop: 2 }}>
                        <Building2 size={11} color={colors.primary} />
                        <Text numberOfLines={1} style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>
                          {t.office || 'No office set'}{isSuper ? ' · tap to change' : ''}
                        </Text>
                      </View>
                    </View>
                    <Badge on={!absent} />
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: colors.coolText, fontSize: 12, textAlign: 'center', marginTop: 12, paddingHorizontal: 12 }}>Visible to Super Admin only. Staff see only their own record.</Text>
          </>
        ) : exempt ? (
          <View className="items-center" style={{ paddingVertical: 56 }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><CheckCircle2 size={44} color={colors.primary} /></View>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 16 }}>Attendance not required</Text>
            <Text style={{ color: colors.coolText, fontSize: 13.5, marginTop: 5, textAlign: 'center', paddingHorizontal: 28 }}>Your account is exempt from attendance — you don&apos;t need to check in or out.</Text>
          </View>
        ) : (
          <>
            <View className="items-center mb-4">
              <Text style={{ color: colors.coolText, fontSize: 14, fontWeight: '600' }}>{dateStr}</Text>
              <Text style={{ color: colors.ink, fontSize: 36, fontWeight: '800', letterSpacing: -1.2 }}>{timeStr}</Text>
            </View>

            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6, paddingHorizontal: 4 }}>OFFICE</Text>
            {offices.length === 0 ? (
              <View className="flex-row items-center gap-2.5 p-3 mb-3" style={{ backgroundColor: WARN + '14', borderWidth: 1, borderColor: WARN + '40', borderRadius: 14 }}>
                <MapPinOff size={18} color={WARN} />
                <Text style={{ color: colors.coolText, fontSize: 12.5, flex: 1 }}>No office location is set for your branch yet. Ask your admin to set it in Admin → Office locations.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                {offices.map((o) => {
                  const sel = o.id === office?.id;
                  return (
                    <Pressable key={o.id} onPress={() => setOffice(o)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? colors.primary : colors.coolMuted }}>
                      <Text style={{ color: sel ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {office?.address ? (
              <View className="flex-row items-center gap-1.5" style={{ marginBottom: 12, paddingHorizontal: 2 }}>
                <MapPin size={13} color={colors.coolText} />
                <Text numberOfLines={2} style={{ color: colors.coolText, fontSize: 12, flex: 1 }}>{office.address}</Text>
              </View>
            ) : null}

            {/* Status card */}
            <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, marginBottom: 12 }}>
              <View className="flex-row items-center justify-between mb-3">
                <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>TODAY</Text>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: statusColor + '1A' }}><Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>{statusText}{punchedVia ? ' · ' + punchedVia : ''}</Text></View>
              </View>
              <View className="flex-row gap-2">
                <Stat label="Check-in" time={fmt(inTime)} color={colors.primary} Icon={ArrowDownLeft} />
                <Stat label="Check-out" time={fmt(outTime)} color={colors.danger} Icon={ArrowUpRight} />
              </View>
            </View>

            {/* Automatic */}
            <View className="flex-row items-center gap-1.5 mb-2 px-1"><Zap size={13} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>AUTOMATIC · PRIMARY</Text></View>
            <View style={{ gap: 8, marginBottom: 12 }}>
              <AutoCard
                icon={<Navigation size={18} color={inside ? colors.primary : colors.coolText} />}
                title="Office geofence"
                sub={!office ? 'No office set' : distance != null ? `${distance} m away · radius ${office.radius} m` : `Radius ${office.radius} m · ${geoState}`}
                on={inside}
                color={colors.primary}
              />
              <Text style={{ color: colors.coolText, fontSize: 12, textAlign: 'center' }}>You are checked in automatically when you are inside the office area, and checked out when you leave. Your location is verified on the server.</Text>
            </View>

            {/* Face fallback */}
            <View className="flex-row items-center gap-1.5 mb-2 px-1"><ScanFace size={13} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>MANUAL FALLBACK · IF AUTO FAILS</Text></View>
            <View style={{ padding: 12, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: present ? colors.primary + '55' : colors.coolDivider, marginBottom: 12 }}>
              <Text style={{ color: colors.coolText, fontSize: 12.5, marginBottom: 10 }}>If auto did not trigger, punch manually while at the office (Wi-Fi or geofence). Works for check-in and check-out so no one can punch from outside.</Text>
              {!present ? (
                <View className="flex-row items-center justify-center gap-1.5" style={{ paddingVertical: 13, borderRadius: 999, backgroundColor: colors.coolMuted }}><Lock size={16} color={colors.coolText3} /><Text style={{ color: colors.coolText3, fontSize: 13.5, fontWeight: '700' }}>Needs office Wi-Fi / geofence</Text></View>
              ) : inTime && outTime ? (
                <View className="flex-row items-center justify-center gap-1.5" style={{ paddingVertical: 13, borderRadius: 999, backgroundColor: colors.coolMuted }}><CheckCircle2 size={16} color={colors.coolText3} /><Text style={{ color: colors.coolText3, fontSize: 13.5, fontWeight: '700' }}>Done for today</Text></View>
              ) : (
                <>
                  <View className="flex-row gap-2 mb-2">
                    <Pressable onPress={punchPresent} className="flex-row items-center justify-center gap-1.5" style={{ flex: 1, paddingVertical: 13, borderRadius: 999, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.card }}>
                      <Navigation size={16} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>{!inTime ? 'Check in' : 'Check out'} · {viaNow || 'office'}</Text>
                    </Pressable>
                    <Pressable onPress={faceScan} disabled={scanning} className="flex-row items-center justify-center gap-1.5" style={{ flex: 1, paddingVertical: 13, borderRadius: 999, backgroundColor: scanning ? colors.primaryDark : colors.primary }}>
                      <ScanFace size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{scanning ? 'Verifying…' : (!inTime ? 'Face in' : 'Face out')}</Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: colors.coolText, fontSize: 11, textAlign: 'center' }}>Check {!inTime ? 'in' : 'out'} by Wi-Fi/geofence confirm, or by face — both within the office.</Text>
                </>
              )}
            </View>

            <Text style={{ color: colors.coolText, fontSize: 12, textAlign: 'center', marginBottom: 16, paddingHorizontal: 12 }}>Only time, date & method are stored. Payroll & rules run in your Accounts software.</Text>

            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 }}>MY HISTORY</Text>
            <View style={{ gap: 8 }}>
              {history.length === 0 ? (
                <Text style={{ color: colors.coolText, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>No attendance history yet.</Text>
              ) : null}
              {history.map((e) => {
                const absent = !e.inTime;
                return (
                  <View key={e.date} className="flex-row items-center gap-2.5 p-3" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: absent ? colors.danger + '40' : colors.coolDivider, borderRadius: 14 }}>
                    <View className="flex-1">
                      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{dateLabel(e.date)}</Text>
                      {absent ? <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 2 }}>Absent · no check-in</Text>
                              : <Text style={{ color: colors.coolText, fontSize: 12, marginTop: 2 }}>In {fmt(e.inTime ? new Date(e.inTime) : null)} · Out {e.outTime ? fmt(new Date(e.outTime)) : '—'}{e.via ? ' · ' + e.via : ''}</Text>}
                    </View>
                    <Badge on={!absent} />
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Super-admin: set a teammate's working branch + office */}
      <Modal visible={!!reassign} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setReassign(null)}>
        <Pressable onPress={() => setReassign(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.card, borderRadius: 20, padding: 18, maxHeight: '80%' }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 4 }}>
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Working branch & office</Text>
              <Pressable onPress={() => setReassign(null)} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={18} color={colors.coolText} /></Pressable>
            </View>
            <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12.5, marginBottom: 12 }}>
              {reassign?.name} · {reassign?.branch}
            </Text>
            <ScrollView style={{ flexGrow: 0 }}>
            {/* This person's recent days — present/absent at a glance for the admin. */}
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>RECENT ATTENDANCE · 14 DAYS</Text>
            <View style={{ gap: 4, marginBottom: 14 }}>
              {userHistory === null ? (
                <Text style={{ color: colors.coolText3, fontSize: 12.5, paddingVertical: 4 }}>Loading…</Text>
              ) : userHistory.length === 0 ? (
                <Text style={{ color: colors.coolText3, fontSize: 12.5, paddingVertical: 4 }}>No attendance records yet.</Text>
              ) : (
                userHistory.map((e) => (
                  <View key={e.date} className="flex-row items-center justify-between gap-2" style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.coolBg, borderWidth: 1, borderColor: e.inTime ? colors.coolDivider : colors.danger + '40' }}>
                    <View className="flex-1">
                      <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '600' }}>{dateLabel(e.date)}</Text>
                      {e.inTime
                        ? <Text style={{ color: colors.coolText, fontSize: 11.5 }}>In {fmt(new Date(e.inTime))} · Out {e.outTime ? fmt(new Date(e.outTime)) : '—'}{e.via ? ' · ' + e.via : ''}</Text>
                        : <Text style={{ color: colors.danger, fontSize: 11.5, fontWeight: '700' }}>Absent</Text>}
                    </View>
                    {/* Corrections: fix a missed punch; only Manual days can be reverted to absent. */}
                    {!e.inTime ? (
                      <Pressable onPress={() => setMemberDay(e.date, true)} hitSlop={6} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.primarySoft }}>
                        <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '700' }}>MARK PRESENT</Text>
                      </Pressable>
                    ) : e.via === 'Manual' ? (
                      <Pressable onPress={() => setMemberDay(e.date, false)} hitSlop={6} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.danger + '12' }}>
                        <Text style={{ color: colors.danger, fontSize: 10, fontWeight: '700' }}>MARK ABSENT</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))
              )}
            </View>
            {/* Where this person marks attendance. Picking a branch scopes the office list below. */}
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>WORKING BRANCH</Text>
            <View style={{ gap: 6, marginBottom: 14 }}>
              {adminOffices.map((b) => {
                const on = reassign?.branchId === b.branchId;
                return (
                  <Pressable key={b.branchId} onPress={() => reassign && !on && reassignBranchTo(reassign.id, b.branchId)} className="flex-row items-center gap-2" style={{ paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.primary : colors.coolDivider, backgroundColor: on ? colors.primarySoft : colors.card }}>
                    <MapPin size={16} color={on ? colors.primary : colors.coolText} />
                    <Text style={{ flex: 1, color: colors.ink, fontSize: 14, fontWeight: '600' }}>{b.code || b.name || 'Branch'}{b.city ? ` · ${b.city}` : ''}</Text>
                    {on ? <Check size={16} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
              {/* Clear the explicit working branch → person falls back to their CRM access branch. */}
              <Pressable onPress={() => reassign && reassignBranchTo(reassign.id, null)} disabled={!reassign?.workBranchId} className="items-center" style={{ paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: colors.coolDivider, borderStyle: 'dashed', marginTop: 2 }}>
                <Text style={{ color: colors.coolText, fontSize: 13, fontWeight: '600' }}>{reassign?.workBranchId ? 'Clear (use access branch)' : 'Following access branch'}</Text>
              </Pressable>
            </View>
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>OFFICE</Text>
            {reassignBranchOffices.length === 0 ? (
              <Text style={{ color: colors.coolText3, fontSize: 12.5 }}>No offices configured for this branch yet. Add one in Admin → Office locations.</Text>
            ) : (
              <View style={{ gap: 6 }}>
                {reassignBranchOffices.map((o) => {
                  const on = reassign?.officeId === o.id;
                  return (
                    <Pressable key={o.id} onPress={() => reassign && reassignTo(reassign.id, o.id)} className="flex-row items-center gap-2" style={{ paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.primary : colors.coolDivider, backgroundColor: on ? colors.primarySoft : colors.card }}>
                      <Building2 size={16} color={on ? colors.primary : colors.coolText} />
                      <Text style={{ flex: 1, color: colors.ink, fontSize: 14, fontWeight: '600' }}>{o.label || 'Office'}{o.isDefault ? ' · default' : ''}</Text>
                      {on ? <Check size={16} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}
                {/* Clear the explicit assignment → person falls back to the branch default office. */}
                <Pressable onPress={() => reassign && reassignTo(reassign.id, null)} className="items-center" style={{ paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: colors.coolDivider, borderStyle: 'dashed', marginTop: 2 }}>
                  <Text style={{ color: colors.coolText, fontSize: 13, fontWeight: '600' }}>{reassign?.officeId ? 'Clear assignment (use branch default)' : 'On branch default'}</Text>
                </Pressable>
              </View>
            )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
      <Pressable onPress={onBack} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
      <View>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.coolText, fontSize: 12 }}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}
function Stat({ label, time, color, Icon }: { label: string; time: string | null; color: string; Icon: typeof ArrowDownLeft }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: colors.coolMuted }}>
      <View className="flex-row items-center gap-1 mb-1"><Icon size={14} color={color} /><Text style={{ color, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text></View>
      <Text style={{ color: time ? colors.ink : colors.coolText3, fontSize: 20, fontWeight: '800', letterSpacing: -0.5 }}>{time || '—'}</Text>
    </View>
  );
}
function Stat3({ n, label, color, bg }: { n: number; label: string; color: string; bg: string }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 14, alignItems: 'center', backgroundColor: bg }}>
      <Text style={{ color, fontSize: 22, fontWeight: '800' }}>{n}</Text>
      <Text style={{ color, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
    </View>
  );
}
function Badge({ on }: { on: boolean }) {
  return <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: (on ? colors.primary : colors.danger) + '18' }}><Text style={{ color: on ? colors.primary : colors.danger, fontSize: 10, fontWeight: '700' }}>{on ? 'PRESENT' : 'ABSENT'}</Text></View>;
}
function AutoCard({ icon, title, sub, on, color, children }: { icon: ReactNode; title: string; sub: string; on: boolean; color: string; children?: ReactNode }) {
  return (
    <View style={{ padding: 12, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: on ? color + '55' : colors.coolDivider }}>
      <View className="flex-row items-center gap-2.5">
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: (on ? color : colors.coolText) + '18', alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{title}</Text><Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{sub}</Text></View>
        <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: (on ? colors.primary : colors.coolText) + '18' }}><Text style={{ color: on ? colors.primary : colors.coolText, fontSize: 10, fontWeight: '700' }}>{on ? 'ON' : 'OFF'}</Text></View>
      </View>
      {children}
    </View>
  );
}

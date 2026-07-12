import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { ChevronLeft, Clock, Check, Navigation, Zap, ScanFace, Lock, CheckCircle2, ArrowDownLeft, ArrowUpRight, MapPinOff, MapPin, Building2, X } from 'lucide-react-native';
import { Modal } from 'react-native';
import { Avatar } from '../src/components/ui';
import { colors, shadow, shadowSm } from '../src/theme';
import { useGeoFence } from '../src/hooks/useGeoFence';
import { useAttendanceStore } from '../src/store/attendanceStore';
import { useAccessStore } from '../src/store/accessStore';
import { useUiStore } from '../src/store/uiStore';
import { canFacePunch, nextAwaySince, awayLongEnough } from '../src/logic/attendance';
import { saveConsent } from '../src/services/storage';
import { checkIn, checkOut, getMyAttendance, getTeamAttendance, getAttendanceHistory, getOffices, getAdminOffices, assignUserOffice, assignUserWorkBranch, type AttendanceOffice, type AttendanceHistoryEntry, type AdminBranchOffices } from '../src/api/attendance';
import { getCurrentSsid } from '../src/services/wifi';
import { ssidMatches } from '../src/logic/wifi';
import { syncAttendanceGeofencing } from '../src/services/backgroundAttendance';
import { ApiError } from '../src/api/client';
import type { PunchMethod, TeamAttendanceEntry } from '../src/types';

const fmt = (d: Date | null) => (d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null);
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
  const [history, setHistory] = useState<AttendanceHistoryEntry[]>([]);
  const [adminOffices, setAdminOffices] = useState<AdminBranchOffices[]>([]); // for the super-admin reassign picker
  const [reassign, setReassign] = useState<TeamAttendanceEntry | null>(null);
  const [exempt, setExempt] = useState(false); // this account is exempt from attendance
  const [ssid, setSsid] = useState<string | null>(null); // Wi-Fi network the device is on (null when unreadable)
  const awaySinceRef = useRef<number | null>(null); // confirmed-outside timer for the auto check-out grace

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

  // Load the caller's office geofence(s), today's record, history, and the team view on open.
  useEffect(() => {
    getOffices().then((list) => { setOffices(list); setOffice((cur) => cur ?? list[0] ?? null); }).catch(() => undefined);
    void syncAttendanceGeofencing(); // ensure background geofencing is registered for the user's offices

    getMyAttendance()
      .then((m) => { setExempt(!!m.exempt); useAttendanceStore.getState().setAtt({ inTime: m.inTime ? new Date(m.inTime) : null, outTime: m.outTime ? new Date(m.outTime) : null, via: (m.via as PunchMethod | null) ?? null }); })
      .catch(() => undefined);
    getAttendanceHistory().then(setHistory).catch(() => undefined);
    getTeamAttendance().then(setTeam).catch(() => undefined);
    if (isSuper) getAdminOffices().then(setAdminOffices).catch(() => undefined); // offices for the reassign picker
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Super-admin: move a teammate to a different office (or back to the branch default).
  const reassignTo = (userId: string, officeId: string | null): void => {
    assignUserOffice(userId, officeId)
      .then(() => { showToast('Office updated'); setReassign(null); getTeamAttendance().then(setTeam).catch(() => undefined); })
      .catch(() => showToast('Could not update office'));
  };
  // Super-admin: set a teammate's WORKING branch (where they mark attendance). Keeps the modal open,
  // re-pointed at the refreshed entry, so the office list below re-scopes to the new branch.
  const reassignBranchTo = (userId: string, branchId: string | null): void => {
    assignUserWorkBranch(userId, branchId)
      .then(() => {
        showToast('Working branch updated');
        return getTeamAttendance().then((list) => {
          setTeam(list);
          setReassign((cur) => (cur ? list.find((t) => t.id === cur.id) ?? null : null));
        });
      })
      .catch(() => showToast('Could not update branch'));
  };
  const reassignBranchOffices = reassign ? (adminOffices.find((b) => b.branchId === reassign.branchId)?.offices ?? []) : [];

  // Persist a punch to the backend and adopt the server's record. `silent` = auto (no toast/error).
  const apiPunch = async (kind: 'in' | 'out', method: 'auto' | 'face', silent = false): Promise<void> => {
    try {
      const body = { coords: coords ? { lat: coords.lat, lng: coords.lng } : null, method, wifiSsid: ssid };
      const m = kind === 'in' ? await checkIn(body) : await checkOut(body);
      useAttendanceStore.getState().setAtt({ inTime: m.inTime ? new Date(m.inTime) : null, outTime: m.outTime ? new Date(m.outTime) : null, via: (m.via as PunchMethod | null) ?? null });
      getAttendanceHistory().then(setHistory).catch(() => undefined);
      if (!silent) showToast(kind === 'in' ? `Checked in · ${fmt(m.inTime ? new Date(m.inTime) : null)}` : `Checked out · ${fmt(m.outTime ? new Date(m.outTime) : null)}`);
    } catch (e) {
      if (!silent) showToast(e instanceof ApiError ? e.message : 'Could not record punch');
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <Header title="Attendance consent" onBack={() => router.back()} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.orange + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><Clock size={24} color={colors.orange} /></View>
          <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 20, fontWeight: '600', marginBottom: 8 }}>How attendance works</Text>
          <Text style={{ color: colors.warmMute, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>When you open KBiz 360 at the office, you are checked in automatically via office Wi-Fi or geofence. Face punch is a manual backup if auto-detection fails.</Text>
          {([
            ['Automatic first', 'On office Wi-Fi or inside the geofence, check-in / check-out happen on their own.'],
            ['Face = backup', 'If auto-detection fails, punch manually by face (still at the office) so no one is wrongly marked absent.'],
            ['What we record', 'Only check-in / check-out time, date, and method (Wi-Fi, Geofence or Face).'],
            ['Who can see it', 'You see your own record. Only your Super Admin sees the team dashboard. Times feed your Accounts software.'],
          ] as [string, string][]).map(([t, d]) => (
            <View key={t} className="flex-row gap-2.5 mb-3">
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.success + '1A', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}><Check size={11} color={colors.success} strokeWidth={3} /></View>
              <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '800' }}>{t}</Text><Text style={{ color: colors.warmMute, fontSize: 11.5, lineHeight: 16 }}>{d}</Text></View>
            </View>
          ))}
          <Pressable onPress={agree} style={{ marginTop: 16, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>I understand & agree</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const dateStr = clock.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const punchedVia = att.via || '';
  const statusColor = inTime ? (outTime ? colors.warmMute : colors.success) : (present ? colors.success : colors.coral);
  const statusText = inTime ? (outTime ? 'Done for today' : 'Checked in') : (present ? 'Detecting' : 'Not checked in');

  const presentCount = team.filter((t) => t.in).length;
  const absentCount = team.length - presentCount;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Attendance" subtitle="Auto first · face is backup" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {isSuper ? (
          <View className="flex-row p-1 mb-3" style={{ borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
            {([['mine', 'My attendance'], ['team', 'Team · Admin']] as const).map(([k, l]) => (
              <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, paddingVertical: 8, borderRadius: 999, backgroundColor: tab === k ? colors.ink : 'transparent', alignItems: 'center' }}>
                <Text style={{ color: tab === k ? '#fff' : colors.warmMute, fontSize: 12, fontWeight: '800' }}>{l}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {isSuper && tab === 'team' ? (
          <>
            <View className="flex-row gap-2 mb-3">
              <Stat3 n={presentCount} label="Present" color={colors.success} bg={colors.success + '12'} border={colors.success + '33'} />
              <Stat3 n={absentCount} label="Absent" color={colors.coral} bg={colors.coral + '12'} border={colors.coral + '33'} />
              <Stat3 n={team.length} label="Total" color={colors.ink} bg={colors.card} border={colors.cardEdge} />
            </View>
            <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6, paddingHorizontal: 4 }}>TODAY · TEAM</Text>
            <View style={{ gap: 6 }}>
              {team.map((t) => {
                const absent = !t.in;
                return (
                  <Pressable key={t.id} disabled={!isSuper} onPress={() => setReassign(t)} className="flex-row items-center gap-2.5 p-2.5" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: absent ? colors.coral + '40' : colors.cardEdge, borderRadius: 14, ...shadowSm }}>
                    <Avatar initials={t.initials} color={t.color} size={36} />
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{t.name}</Text>
                        {t.position ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10, flexShrink: 1 }}>· {t.position}</Text> : null}
                      </View>
                      {absent
                        ? <Text style={{ color: colors.coral, fontSize: 10.5, fontWeight: '800', marginTop: 2 }}>{t.branch} · Absent</Text>
                        : <Text numberOfLines={1} style={{ color: colors.warmMute, fontSize: 10.5, marginTop: 2 }}>{t.branch} · In {t.in}{t.out ? ' · Out ' + t.out : ''} · {t.via}</Text>}
                      {/* Office the person reports at — super-admin taps the row to reassign. */}
                      <View className="flex-row items-center gap-1" style={{ marginTop: 2 }}>
                        <Building2 size={10} color={colors.teal} />
                        <Text numberOfLines={1} style={{ color: colors.teal, fontSize: 10, fontWeight: '700' }}>
                          {t.office || 'No office set'}{isSuper ? ' · tap to change' : ''}
                        </Text>
                      </View>
                    </View>
                    <Badge on={!absent} />
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: colors.warmMute, fontSize: 11, textAlign: 'center', marginTop: 12, paddingHorizontal: 12 }}>Visible to Super Admin only. Staff see only their own record.</Text>
          </>
        ) : exempt ? (
          <View className="items-center" style={{ paddingVertical: 56 }}>
            <CheckCircle2 size={36} color={colors.success} />
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 12 }}>Attendance not required</Text>
            <Text style={{ color: colors.warmMute, fontSize: 12, marginTop: 4, textAlign: 'center', paddingHorizontal: 28 }}>Your account is exempt from attendance — you don&apos;t need to check in or out.</Text>
          </View>
        ) : (
          <>
            <View className="items-center mb-4">
              <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 14, fontWeight: '600' }}>{dateStr}</Text>
              <Text style={{ color: colors.ink, fontSize: 34, fontWeight: '800', letterSpacing: -1.2 }}>{timeStr}</Text>
            </View>

            <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6, paddingHorizontal: 4 }}>OFFICE</Text>
            {offices.length === 0 ? (
              <View className="flex-row items-center gap-2.5 p-3 mb-3" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.orange + '40', borderRadius: 14 }}>
                <MapPinOff size={18} color={colors.orange} />
                <Text style={{ color: colors.warmMute, fontSize: 11.5, flex: 1 }}>No office location is set for your branch yet. Ask your admin to set it in Admin → Office locations.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
                {offices.map((o) => {
                  const sel = o.id === office?.id;
                  return (
                    <Pressable key={o.id} onPress={() => setOffice(o)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11, borderWidth: 1, backgroundColor: sel ? colors.ink : '#fff', borderColor: sel ? colors.ink : colors.cardEdge }}>
                      <Text style={{ color: sel ? '#fff' : colors.ink, fontSize: 11, fontWeight: '800' }}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {office?.address ? (
              <View className="flex-row items-center gap-1.5" style={{ marginBottom: 12, paddingHorizontal: 2 }}>
                <MapPin size={12} color={colors.warmMute} />
                <Text numberOfLines={2} style={{ color: colors.warmMute, fontSize: 11, flex: 1 }}>{office.address}</Text>
              </View>
            ) : null}

            {/* Status card */}
            <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge, marginBottom: 12, ...shadow }}>
              <View className="flex-row items-center justify-between mb-3">
                <Text style={{ color: colors.warmMute, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>TODAY</Text>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: statusColor + '1A' }}><Text style={{ color: statusColor, fontSize: 10, fontWeight: '800' }}>{statusText}{punchedVia ? ' · ' + punchedVia : ''}</Text></View>
              </View>
              <View className="flex-row gap-2">
                <Stat label="Check-in" time={fmt(inTime)} color={colors.success} Icon={ArrowDownLeft} />
                <Stat label="Check-out" time={fmt(outTime)} color={colors.coral} Icon={ArrowUpRight} />
              </View>
            </View>

            {/* Automatic */}
            <View className="flex-row items-center gap-1.5 mb-1.5 px-1"><Zap size={12} color={colors.success} /><Text style={{ color: colors.success, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>AUTOMATIC · PRIMARY</Text></View>
            <View style={{ gap: 8, marginBottom: 12 }}>
              <AutoCard
                icon={<Navigation size={17} color={inside ? colors.success : colors.warmMute} />}
                title="Office geofence"
                sub={!office ? 'No office set' : distance != null ? `${distance} m away · radius ${office.radius} m` : `Radius ${office.radius} m · ${geoState}`}
                on={inside}
                color={colors.success}
              />
              <Text style={{ color: colors.warmMute, fontSize: 10.5, textAlign: 'center' }}>You are checked in automatically when you are inside the office area, and checked out when you leave. Your location is verified on the server.</Text>
            </View>

            {/* Face fallback */}
            <View className="flex-row items-center gap-1.5 mb-1.5 px-1"><ScanFace size={12} color={colors.purple} /><Text style={{ color: colors.purple, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>MANUAL FALLBACK · IF AUTO FAILS</Text></View>
            <View style={{ padding: 12, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: present ? colors.purple + '55' : colors.cardEdge, marginBottom: 12, ...shadowSm }}>
              <Text style={{ color: colors.warmMute, fontSize: 11, marginBottom: 10 }}>If auto did not trigger, punch manually while at the office (Wi-Fi or geofence). Works for check-in and check-out so no one can punch from outside.</Text>
              {!present ? (
                <View className="flex-row items-center justify-center gap-1.5" style={{ paddingVertical: 12, borderRadius: 16, backgroundColor: '#C8C5BB' }}><Lock size={15} color="#fff" /><Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Needs office Wi-Fi / geofence</Text></View>
              ) : inTime && outTime ? (
                <View className="flex-row items-center justify-center gap-1.5" style={{ paddingVertical: 12, borderRadius: 16, backgroundColor: '#C8C5BB' }}><CheckCircle2 size={15} color="#fff" /><Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Done for today</Text></View>
              ) : (
                <>
                  <View className="flex-row gap-2 mb-2">
                    <Pressable onPress={punchPresent} className="flex-row items-center justify-center gap-1.5" style={{ flex: 1, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.success, backgroundColor: '#fff' }}>
                      <Navigation size={15} color={colors.success} />
                      <Text style={{ color: colors.success, fontSize: 12, fontWeight: '800' }}>{!inTime ? 'Check in' : 'Check out'} · {viaNow || 'office'}</Text>
                    </Pressable>
                    <Pressable onPress={faceScan} disabled={scanning} className="flex-row items-center justify-center gap-1.5" style={{ flex: 1, paddingVertical: 12, borderRadius: 16, backgroundColor: scanning ? colors.purple : colors.ink }}>
                      <ScanFace size={15} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{scanning ? 'Verifying…' : (!inTime ? 'Face in' : 'Face out')}</Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: colors.warmMute, fontSize: 10, textAlign: 'center' }}>Check {!inTime ? 'in' : 'out'} by Wi-Fi/geofence confirm, or by face — both within the office.</Text>
                </>
              )}
            </View>

            <Text style={{ color: colors.warmMute, fontSize: 11, textAlign: 'center', marginBottom: 16, paddingHorizontal: 12 }}>Only time, date & method are stored. Payroll & rules run in your Accounts software.</Text>

            <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6, paddingHorizontal: 4 }}>MY HISTORY</Text>
            <View style={{ gap: 6 }}>
              {history.length === 0 ? (
                <Text style={{ color: colors.warmMute, fontSize: 11.5, textAlign: 'center', paddingVertical: 16 }}>No attendance history yet.</Text>
              ) : null}
              {history.map((e) => {
                const absent = !e.inTime;
                return (
                  <View key={e.date} className="flex-row items-center gap-2.5 p-3" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: absent ? colors.coral + '40' : colors.cardEdge, borderRadius: 14, ...shadowSm }}>
                    <View className="flex-1">
                      <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{dateLabel(e.date)}</Text>
                      {absent ? <Text style={{ color: colors.coral, fontSize: 10.5, fontWeight: '800', marginTop: 2 }}>Absent · no check-in</Text>
                              : <Text style={{ color: colors.warmMute, fontSize: 10.5, marginTop: 2 }}>In {fmt(e.inTime ? new Date(e.inTime) : null)} · Out {e.outTime ? fmt(new Date(e.outTime)) : '—'}{e.via ? ' · ' + e.via : ''}</Text>}
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
          <Pressable onPress={() => {}} style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, maxHeight: '80%' }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 4 }}>
              <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '700' }}>Working branch & office</Text>
              <Pressable onPress={() => setReassign(null)} hitSlop={8}><X size={18} color={colors.textMuted} /></Pressable>
            </View>
            <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: 12 }}>
              {reassign?.name} · {reassign?.branch}
            </Text>
            <ScrollView style={{ flexGrow: 0 }}>
            {/* Where this person marks attendance. Picking a branch scopes the office list below. */}
            <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 }}>WORKING BRANCH</Text>
            <View style={{ gap: 6, marginBottom: 14 }}>
              {adminOffices.map((b) => {
                const on = reassign?.branchId === b.branchId;
                return (
                  <Pressable key={b.branchId} onPress={() => reassign && !on && reassignBranchTo(reassign.id, b.branchId)} className="flex-row items-center gap-2" style={{ paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.ink : colors.cardEdge, backgroundColor: on ? colors.ink + '0D' : '#fff' }}>
                    <MapPin size={15} color={on ? colors.ink : colors.warmMute} />
                    <Text style={{ flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700' }}>{b.code || b.name || 'Branch'}{b.city ? ` · ${b.city}` : ''}</Text>
                    {on ? <Check size={15} color={colors.ink} /> : null}
                  </Pressable>
                );
              })}
              {/* Clear the explicit working branch → person falls back to their CRM access branch. */}
              <Pressable onPress={() => reassign && reassignBranchTo(reassign.id, null)} disabled={!reassign?.workBranchId} className="items-center" style={{ paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.cardEdge, borderStyle: 'dashed', marginTop: 2 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>{reassign?.workBranchId ? 'Clear (use access branch)' : 'Following access branch'}</Text>
              </Pressable>
            </View>
            <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 }}>OFFICE</Text>
            {reassignBranchOffices.length === 0 ? (
              <Text style={{ color: colors.textMuted2, fontSize: 12 }}>No offices configured for this branch yet. Add one in Admin → Office locations.</Text>
            ) : (
              <View style={{ gap: 6 }}>
                {reassignBranchOffices.map((o) => {
                  const on = reassign?.officeId === o.id;
                  return (
                    <Pressable key={o.id} onPress={() => reassign && reassignTo(reassign.id, o.id)} className="flex-row items-center gap-2" style={{ paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.ink : colors.cardEdge, backgroundColor: on ? colors.ink + '0D' : '#fff' }}>
                      <Building2 size={15} color={on ? colors.ink : colors.warmMute} />
                      <Text style={{ flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700' }}>{o.label || 'Office'}{o.isDefault ? ' · default' : ''}</Text>
                      {on ? <Check size={15} color={colors.ink} /> : null}
                    </Pressable>
                  );
                })}
                {/* Clear the explicit assignment → person falls back to the branch default office. */}
                <Pressable onPress={() => reassign && reassignTo(reassign.id, null)} className="items-center" style={{ paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.cardEdge, borderStyle: 'dashed', marginTop: 2 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>{reassign?.officeId ? 'Clear assignment (use branch default)' : 'On branch default'}</Text>
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
    <View className="flex-row items-center gap-2 px-2 py-2" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: colors.card }}>
      <Pressable onPress={onBack} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
      <View>
        <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.warmMute, fontSize: 10.5 }}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}
function Stat({ label, time, color, Icon }: { label: string; time: string | null; color: string; Icon: typeof ArrowDownLeft }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: colors.canvas }}>
      <View className="flex-row items-center gap-1 mb-1"><Icon size={13} color={color} /><Text style={{ color, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text></View>
      <Text style={{ color: time ? colors.ink : '#bdb3a0', fontSize: 19, fontWeight: '800', letterSpacing: -0.5 }}>{time || '—'}</Text>
    </View>
  );
}
function Stat3({ n, label, color, bg, border }: { n: number; label: string; color: string; bg: string; border: string }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 16, alignItems: 'center', backgroundColor: bg, borderWidth: 1, borderColor: border }}>
      <Text style={{ color, fontSize: 22, fontWeight: '800' }}>{n}</Text>
      <Text style={{ color, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
    </View>
  );
}
function Badge({ on }: { on: boolean }) {
  return <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: (on ? colors.success : colors.coral) + '1A' }}><Text style={{ color: on ? colors.success : colors.coral, fontSize: 9, fontWeight: '800' }}>{on ? 'PRESENT' : 'ABSENT'}</Text></View>;
}
function AutoCard({ icon, title, sub, on, color, children }: { icon: ReactNode; title: string; sub: string; on: boolean; color: string; children?: ReactNode }) {
  return (
    <View style={{ padding: 12, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: on ? color + '55' : colors.cardEdge, ...shadowSm }}>
      <View className="flex-row items-center gap-2.5">
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: (on ? color : colors.warmMute) + '1A', alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '800' }}>{title}</Text><Text numberOfLines={1} style={{ color: colors.warmMute, fontSize: 10.5 }}>{sub}</Text></View>
        <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: (on ? colors.success : colors.warmMute) + '1A' }}><Text style={{ color: on ? colors.success : colors.warmMute, fontSize: 9, fontWeight: '800' }}>{on ? 'ON' : 'OFF'}</Text></View>
      </View>
      {children}
    </View>
  );
}

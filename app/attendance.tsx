import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { ChevronLeft, Clock, Check, Wifi, WifiOff, Navigation, Zap, ScanFace, Lock, CheckCircle2, ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { Avatar } from '../src/components/ui';
import { colors, shadow, shadowSm } from '../src/theme';
import { branches } from '../src/data/businesses';
import { teamAttendance } from '../src/data/team';
import { useGeoFence } from '../src/hooks/useGeoFence';
import { useAttendanceStore } from '../src/store/attendanceStore';
import { useAccessStore } from '../src/store/accessStore';
import { useUiStore } from '../src/store/uiStore';
import { canFacePunch } from '../src/logic/attendance';
import { saveConsent } from '../src/services/storage';

const fmt = (d: Date | null) => (d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null);
const HISTORY = [
  { date: 'Yesterday', in: '9:02 AM', out: '6:34 PM', via: 'Wi-Fi' },
  { date: 'Mon 26 May', in: '9:10 AM', out: '6:20 PM', via: 'Geofence' },
  { date: 'Sun 25 May', in: null as string | null, out: null as string | null, via: undefined as string | undefined },
  { date: 'Sat 24 May', in: '9:30 AM', out: '2:05 PM', via: 'Face' },
];

// Attendance — faithful port of source AttendanceScreen, wired to the tested attendanceStore
// (computePresence/autoPunch/canFacePunch/facePunch). Wi-Fi is a simulated toggle (source-faithful);
// geofence uses expo-location via useGeoFence; face fallback is biometric (expo-local-authentication),
// no ML. Consent-gated on first use.
export default function Attendance() {
  const router = useRouter();
  const offices = branches.filter((b) => typeof b.lat === 'number');
  const [office, setOffice] = useState(offices[0]);
  const [tab, setTab] = useState<'mine' | 'team'>('mine');
  const [clock, setClock] = useState(new Date());
  const [wifiOn, setWifiOn] = useState(false);
  const [scanning, setScanning] = useState(false);

  const role = useAccessStore((s) => s.user?.role);
  const isSuper = role === 'SUPER_ADMIN';
  const consent = useAttendanceStore((s) => s.consent);
  const att = useAttendanceStore((s) => s.att);
  const presence = useAttendanceStore((s) => s.presence);
  const refreshPresence = useAttendanceStore((s) => s.refreshPresence);
  const runAutoPunch = useAttendanceStore((s) => s.runAutoPunch);
  const punchByFace = useAttendanceStore((s) => s.punchByFace);
  const showToast = useUiStore((s) => s.showToast);

  const { coords, geoState, simulate } = useGeoFence(office);

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  // Recompute presence whenever signals change, then auto-punch (source AUTO useEffect).
  useEffect(() => {
    const p = refreshPresence({ wifiOn, coords, office: { lat: office.lat as number, lng: office.lng as number, radius: office.radius } });
    const fired = runAutoPunch();
    if (fired) {
      const a = useAttendanceStore.getState().att;
      if (a.outTime) showToast('Auto check-out · ' + fmt(a.outTime));
      else if (a.inTime) showToast('Auto check-in · ' + fmt(a.inTime) + ' · ' + (p.viaNow || 'Auto'));
    }
  }, [wifiOn, coords, office, refreshPresence, runAutoPunch, showToast]);

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
        const punched = punchByFace();
        const a = useAttendanceStore.getState().att;
        if (punched) showToast((a.outTime ? 'Face check-out · ' + fmt(a.outTime) : 'Face check-in · ' + fmt(a.inTime)));
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
    const fired = runAutoPunch();
    const a = useAttendanceStore.getState().att;
    if (fired) showToast((a.outTime ? 'Checked out · ' + fmt(a.outTime) : 'Checked in · ' + fmt(a.inTime)) + ' · ' + (viaNow || 'Auto'));
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

  const presentCount = teamAttendance.filter((t) => t.in).length;
  const absentCount = teamAttendance.length - presentCount;

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
              <Stat3 n={teamAttendance.length} label="Total" color={colors.ink} bg={colors.card} border={colors.cardEdge} />
            </View>
            <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6, paddingHorizontal: 4 }}>TODAY · TEAM</Text>
            <View style={{ gap: 6 }}>
              {teamAttendance.map((t) => {
                const absent = !t.in;
                return (
                  <View key={t.id} className="flex-row items-center gap-2.5 p-2.5" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: absent ? colors.coral + '40' : colors.cardEdge, borderRadius: 14, ...shadowSm }}>
                    <Avatar initials={t.initials} color={t.color} size={36} />
                    <View className="flex-1">
                      <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{t.name}</Text>
                      {absent
                        ? <Text style={{ color: colors.coral, fontSize: 10.5, fontWeight: '800', marginTop: 2 }}>{t.branch} · Absent</Text>
                        : <Text numberOfLines={1} style={{ color: colors.warmMute, fontSize: 10.5, marginTop: 2 }}>{t.branch} · In {t.in}{t.out ? ' · Out ' + t.out : ''} · {t.via}</Text>}
                    </View>
                    <Badge on={!absent} />
                  </View>
                );
              })}
            </View>
            <Text style={{ color: colors.warmMute, fontSize: 11, textAlign: 'center', marginTop: 12, paddingHorizontal: 12 }}>Visible to Super Admin only. Staff see only their own record.</Text>
          </>
        ) : (
          <>
            <View className="items-center mb-4">
              <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 14, fontWeight: '600' }}>{dateStr}</Text>
              <Text style={{ color: colors.ink, fontSize: 34, fontWeight: '800', letterSpacing: -1.2 }}>{timeStr}</Text>
            </View>

            <Text style={{ color: colors.warmMute, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6, paddingHorizontal: 4 }}>OFFICE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
              {offices.map((o) => {
                const sel = o.id === office.id;
                return (
                  <Pressable key={o.id} onPress={() => setOffice(o)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11, borderWidth: 1, backgroundColor: sel ? o.color : '#fff', borderColor: sel ? o.color : colors.cardEdge }}>
                    <Text style={{ color: sel ? '#fff' : colors.ink, fontSize: 11, fontWeight: '800' }}>{o.flag} {o.code} · {o.city}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

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
              <AutoCard icon={wifiOn ? <Wifi size={17} color={colors.blue} /> : <WifiOff size={17} color={colors.warmMute} />} title="Office Wi-Fi / router" sub={office.wifi} on={wifiOn} color={colors.blue}>
                <Pressable onPress={() => setWifiOn((v) => !v)} style={{ marginTop: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.blue, backgroundColor: wifiOn ? colors.blue : '#fff', alignItems: 'center' }}>
                  <Text style={{ color: wifiOn ? '#fff' : colors.blue, fontSize: 11, fontWeight: '800' }}>{wifiOn ? 'Disconnect (simulate leaving)' : 'Simulate connect to office Wi-Fi'}</Text>
                </Pressable>
              </AutoCard>
              <AutoCard icon={<Navigation size={17} color={inside ? colors.success : colors.warmMute} />} title="Office geofence" sub={distance != null ? `${distance} m away · radius ${office.radius} m` : `Radius ${office.radius} m · ${geoState}`} on={inside} color={colors.success}>
                <View className="flex-row gap-2" style={{ marginTop: 10 }}>
                  <Pressable onPress={() => simulate(true)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.success, alignItems: 'center' }}><Text style={{ color: colors.success, fontSize: 11, fontWeight: '800' }}>Simulate · at office</Text></Pressable>
                  <Pressable onPress={() => simulate(false)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.coral, alignItems: 'center' }}><Text style={{ color: colors.coral, fontSize: 11, fontWeight: '800' }}>Simulate · away</Text></Pressable>
                </View>
              </AutoCard>
              <Text style={{ color: colors.warmMute, fontSize: 10.5, textAlign: 'center' }}>You are checked in automatically the moment either turns ON, and checked out when both go OFF.</Text>
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
                      {inside ? <Navigation size={15} color={colors.success} /> : <Wifi size={15} color={colors.success} />}
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
              {HISTORY.map((e, i) => {
                const absent = !e.in;
                return (
                  <View key={i} className="flex-row items-center gap-2.5 p-3" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: absent ? colors.coral + '40' : colors.cardEdge, borderRadius: 14, ...shadowSm }}>
                    <View className="flex-1">
                      <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{e.date}</Text>
                      {absent ? <Text style={{ color: colors.coral, fontSize: 10.5, fontWeight: '800', marginTop: 2 }}>Absent · no check-in</Text>
                              : <Text style={{ color: colors.warmMute, fontSize: 10.5, marginTop: 2 }}>In {e.in} · Out {e.out || '—'}{e.via ? ' · ' + e.via : ''}</Text>}
                    </View>
                    <Badge on={!absent} />
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
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

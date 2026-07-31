import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, AppState, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ChevronLeft, ChevronRight, Clock, Check, Camera, CheckCircle2, ArrowDownLeft, ArrowUpRight, MapPin, Building2, X } from 'lucide-react-native';
import { Modal } from 'react-native';
import { Avatar } from '../src/components/ui';
import { colors } from '../src/theme';
import { useGeoFence } from '../src/hooks/useGeoFence';
import { useEventCallback } from '../src/hooks/useEventCallback';
import { useAttendanceStore } from '../src/store/attendanceStore';
import { useAccessStore } from '../src/store/accessStore';
import { useUiStore } from '../src/store/uiStore';
import { distanceMeters } from '../src/logic/geo';
import { saveConsent } from '../src/services/storage';
import { checkIn, checkOut, getMyAttendance, getTeamAttendance, getAttendanceHistory, getUserAttendanceHistory, adminSetAttendanceDay, getOffices, getAdminOffices, assignUserOffice, assignUserWorkBranch, type AttendanceOffice, type AttendanceHistoryEntry, type AdminBranchOffices } from '../src/api/attendance';
import { uploadFile } from '../src/api/media';
import { disarmAttendanceGeofencing } from '../src/services/backgroundAttendance';
import { clearPendingExit } from '../src/services/pendingExit';
import { ApiError } from '../src/api/client';
import type { PunchMethod, TeamAttendanceEntry } from '../src/types';
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

// Attendance — owner rules 07-31: the Check in / Check out button is enabled ONLY while a live
// GPS fix places the device inside the office geofence (default 100 m). Tapping it opens the
// FRONT CAMERA, captures a face photo, uploads it, and records the punch (server re-verifies the
// distance and requires the photo). No Wi-Fi condition, no auto-punch, no background geofencing.
// Consent-gated on first use.
//
// RENDER ARCHITECTURE: every section below is a React.memo child fed primitives + stable
// callbacks (useEventCallback), so a state tick only repaints the section whose data changed;
// the minute clock only re-renders <LiveClock/>. Do not pass fresh objects/arrays/closures to
// these children.
export default function Attendance() {
  const router = useRouter();
  const [tab, setTab] = useState<'mine' | 'team'>('mine');
  const [offices, setOffices] = useState<AttendanceOffice[]>([]);
  const [punching, setPunching] = useState(false); // camera → upload → punch in flight
  // NOTE: no per-second state here. The ticking clock lives in <LiveClock /> (its own leaf
  // component) so the seconds display doesn't re-render this whole screen — that re-render is
  // what made the page lag and stutter while scrolling.
  const [team, setTeam] = useState<TeamAttendanceEntry[]>([]);
  const [teamDate, setTeamDate] = useState(todayKey()); // day shown on the admin team tab
  const [branchFilter, setBranchFilter] = useState<string>('all'); // branchId shown on the team tab ('all' = every branch, grouped)
  const [history, setHistory] = useState<AttendanceHistoryEntry[]>([]);
  const [userHistory, setUserHistory] = useState<AttendanceHistoryEntry[] | null>(null); // selected teammate's recent days (admin modal)
  const [adminOffices, setAdminOffices] = useState<AdminBranchOffices[]>([]); // for the super-admin reassign picker
  const [reassign, setReassign] = useState<TeamAttendanceEntry | null>(null);
  const [photoView, setPhotoView] = useState<string | null>(null); // full-screen face-photo viewer
  // Exempt is TRI-STATE: null = not known yet — don't flash the punch UI before the server says
  // whether this account is tracked (super admins are always untracked server-side).
  const [exempt, setExempt] = useState<boolean | null>(null);
  // Hidden (director) background attendance: tracked silently — history is shown, punch UI is not.
  const [hidden, setHidden] = useState(false);

  const role = useAccessStore((s) => s.user?.role);
  const isSuper = role === 'SUPER_ADMIN';
  // Who gets the Team tab: super admin + company manager (DIRECTOR) see every branch; a branch
  // manager sees only their own — the server scopes the list, this just shows the tab.
  const canSeeTeam = isSuper || role === 'DIRECTOR' || role === 'BRANCH_MANAGER';
  const consent = useAttendanceStore((s) => s.consent);
  const att = useAttendanceStore((s) => s.att);
  const showToast = useUiStore((s) => s.showToast);

  // Live GPS watch while the screen is open (manual punchers only) — it drives the button gate.
  // The hook only needs A location to start watching; range is judged against ALL offices below.
  const { coords, geoState } = useGeoFence(exempt === false && !hidden ? (offices[0] ?? null) : null);

  // Nearest office to the current fix + whether we're inside its radius (default 100 m).
  const nearest = useMemo(() => {
    if (!coords || offices.length === 0) return null;
    let best: { office: AttendanceOffice; distance: number } | null = null;
    for (const o of offices) {
      const d = distanceMeters(coords, o);
      if (!best || d < best.distance) best = { office: o, distance: d };
    }
    return best ? { ...best, within: best.distance <= best.office.radius } : null;
  }, [coords, offices]);
  // No configured office → the server accepts the punch unverified; don't brick attendance.
  const canPunch = offices.length === 0 || !!nearest?.within;

  // A pending load failure re-fires immediately on foreground — no waiting out the backoff.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && loadErrorRef.current) loadCore(); });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load today's record, history, and the admin data on open.
  //
  // RETRY, DON'T SWALLOW: these fetches used to fail SILENTLY (.catch(() => undefined)) — one
  // flaky moment and the screen rendered half-empty (no office chips, no history), which also made
  // the content shorter than the viewport, i.e. "the page can't scroll", plus a misleading "No
  // office location is set for your branch" message. Failures now flag loadError (honest banner),
  // retry with exponential backoff while the screen is open, and re-fire on app foreground.
  const [loadError, setLoadError] = useState(false);
  const loadErrorRef = useRef(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(3000);
  const loadCore = useEventCallback((): void => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    const tasks: Promise<unknown>[] = [
      getMyAttendance().then((m) => {
        setExempt(!!m.exempt);
        setHidden(!!m.hidden);
        // Manual punchers get no background geofencing — clear anything an older build left armed.
        // Hidden (director) accounts keep theirs (armed by hiddenAttendance's reconcile).
        if (!m.hidden) { void disarmAttendanceGeofencing(); void clearPendingExit(); }
        useAttendanceStore.getState().setAtt({ inTime: m.inTime ? new Date(m.inTime) : null, outTime: m.outTime ? new Date(m.outTime) : null, via: (m.via as PunchMethod | null) ?? null });
      }),
      getAttendanceHistory().then(setHistory),
      getOffices().then(setOffices), // office geofences — drive the 100 m button gate
      ...(isSuper ? [getAdminOffices().then(setAdminOffices)] : []), // offices for the reassign picker
    ];
    void Promise.allSettled(tasks).then((results) => {
      // While the server hasn't said whether this account is tracked, behave as tracked so the UI
      // stays usable (manual punch works; the server is the gate).
      if (results[0].status === 'rejected') setExempt((cur) => cur ?? false);
      const failed = results.some((r) => r.status === 'rejected');
      setLoadError(failed); loadErrorRef.current = failed;
      if (failed) {
        retryRef.current = setTimeout(loadCore, retryDelayRef.current);
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 60_000);
      } else {
        retryDelayRef.current = 3000;
      }
    });
  });
  useEffect(() => {
    loadCore();
    return () => { if (retryRef.current) clearTimeout(retryRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Team view follows the selected day (today by default; admin can browse past days).
  const loadTeam = useEventCallback((): Promise<void> =>
    getTeamAttendance(teamDate === todayKey() ? undefined : teamDate).then(setTeam).catch(() => undefined));
  useEffect(() => { void loadTeam(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamDate]);
  const shiftTeamDay = useCallback((n: number): void => {
    setTeamDate((cur) => {
      const d = new Date(cur + 'T00:00:00');
      d.setDate(d.getDate() + n);
      const next = keyOf(d);
      return next > todayKey() ? cur : next;
    });
  }, []);
  const goTodayTeam = useCallback((): void => setTeamDate(todayKey()), []);

  // Selected teammate's recent attendance for the admin modal (null = loading).
  useEffect(() => {
    if (!reassign || !isSuper) { setUserHistory(null); return; }
    setUserHistory(null);
    getUserAttendanceHistory(reassign.id, 14).then(setUserHistory).catch(() => setUserHistory([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reassign?.id]);

  // Super-admin: move a teammate to a different office (or back to the branch default).
  const reassignTo = useEventCallback((userId: string, officeId: string | null): void => {
    assignUserOffice(userId, officeId)
      .then(() => { showToast('Office updated'); setReassign(null); void loadTeam(); })
      .catch(() => showToast('Could not update office'));
  });
  // Super-admin: set a teammate's WORKING branch (where they mark attendance). Keeps the modal open,
  // re-pointed at the refreshed entry, so the office list below re-scopes to the new branch.
  const reassignBranchTo = useEventCallback((userId: string, branchId: string | null): void => {
    assignUserWorkBranch(userId, branchId)
      .then(() => {
        showToast('Working branch updated');
        return getTeamAttendance(teamDate === todayKey() ? undefined : teamDate).then((list) => {
          setTeam(list);
          setReassign((cur) => (cur ? list.find((t) => t.id === cur.id) ?? null : null));
        });
      })
      .catch(() => showToast('Could not update branch'));
  });

  // Super-admin: correct one day for the selected teammate (present 10:00–19:00 / absent).
  // Stored server-side as 'Manual' with the admin's id, so corrections stay distinguishable.
  const setMemberDay = useEventCallback((date: string, present: boolean): void => {
    if (!reassign) return;
    adminSetAttendanceDay({ userId: reassign.id, date, present })
      .then(() => {
        showToast(present ? 'Marked present (Manual)' : 'Marked absent');
        getUserAttendanceHistory(reassign.id, 14).then(setUserHistory).catch(() => undefined);
        if (date === teamDate) void loadTeam(); // the day being shown on the team tab changed
      })
      .catch((e) => showToast(e instanceof ApiError ? e.message : 'Could not update the day'));
  });

  // Persist a punch to the backend and adopt the server's record. Failures are NEVER silent: the
  // server is the record of truth, so on rejection we re-adopt its state (the optimistic local
  // punch would otherwise show "checked in" all day while the server has nothing — the person
  // then reads as absent tomorrow) and tell the user.
  const apiPunch = useEventCallback(async (kind: 'in' | 'out', facePhotoUrl: string): Promise<void> => {
    try {
      const body = { coords: coords ?? null, method: 'face' as const, facePhotoUrl };
      const m = kind === 'in' ? await checkIn(body) : await checkOut(body);
      useAttendanceStore.getState().setAtt({ inTime: m.inTime ? new Date(m.inTime) : null, outTime: m.outTime ? new Date(m.outTime) : null, via: (m.via as PunchMethod | null) ?? null });
      getAttendanceHistory().then(setHistory).catch(() => undefined);
      showToast(kind === 'in' ? `Checked in · ${fmt(m.inTime ? new Date(m.inTime) : null)}` : `Checked out · ${fmt(m.outTime ? new Date(m.outTime) : null)}`);
    } catch (e) {
      try {
        const m = await getMyAttendance(); // revert the optimistic local state to the server's truth
        useAttendanceStore.getState().setAtt({ inTime: m.inTime ? new Date(m.inTime) : null, outTime: m.outTime ? new Date(m.outTime) : null, via: (m.via as PunchMethod | null) ?? null });
      } catch { /* offline — keep local state; next open reconciles via getMyAttendance */ }
      showToast(`${kind === 'in' ? 'Check-in' : 'Check-out'} NOT recorded — ${e instanceof ApiError ? e.message : 'network error'}`);
    }
  });

  const inTime = att.inTime;
  const outTime = att.outTime;
  const punchedVia = att.via || '';

  const agree = useCallback((): void => { useAttendanceStore.getState().setConsent(true); void saveConsent(true); }, []);
  const onBack = useCallback((): void => router.back(), [router]);
  const closeReassign = useCallback((): void => setReassign(null), []);

  // Punch flow (owner rules): gate on the 100 m geofence, then FRONT CAMERA face capture →
  // upload → punch. The server re-verifies the distance and refuses a punch without the photo.
  const punchNow = useEventCallback(async (): Promise<void> => {
    if (punching) return;
    const kind: 'in' | 'out' | null = !inTime ? 'in' : (!outTime ? 'out' : null);
    if (!kind) return;
    if (!canPunch) { showToast(nearest ? `You are ${nearest.distance} m from ${nearest.office.label} — get within ${nearest.office.radius} m` : 'Waiting for your location…'); return; }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { showToast('Camera permission is needed to mark attendance'); return; }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, cameraType: ImagePicker.CameraType.front, quality: 0.5, allowsEditing: false });
    const photo = shot.canceled ? null : shot.assets?.[0] ?? null;
    if (!photo) return; // user backed out of the camera — no punch
    setPunching(true);
    try {
      const up = await uploadFile({ uri: photo.uri, name: `attendance-${kind}.jpg`, mime: photo.mimeType ?? 'image/jpeg' });
      await apiPunch(kind, up.url);
    } catch (e) {
      showToast(`Could not upload the face photo — ${e instanceof Error ? e.message : 'try again'}`);
    } finally {
      setPunching(false);
    }
  });

  // Derived display values — memoized primitives so the memo children below bail out whenever
  // the underlying values are unchanged (att is re-adopted as a fresh object after server calls).
  const inText = useMemo(() => fmt(inTime), [inTime]);
  const outText = useMemo(() => fmt(outTime), [outTime]);
  const statusColor = useMemo(() => (inTime ? (outTime ? colors.coolText : colors.primary) : colors.danger), [inTime, outTime]);
  const statusText = useMemo(() => (inTime ? (outTime ? 'Done for today' : 'Checked in') : 'Not checked in'), [inTime, outTime]);
  // One line describing the location gate ("N m from OFFICE · within 100 m" / permission nudges).
  const locationSub = useMemo(() => {
    if (offices.length === 0) return loadError ? 'Couldn’t reach the server — retrying automatically…' : 'No office location set for your branch yet — punches are recorded unverified.';
    if (geoState === 'denied') return 'Location permission is needed — enable it in Settings to mark attendance.';
    if (geoState === 'unavailable') return 'Location is unavailable on this device.';
    if (!nearest) return 'Getting your location…';
    return `${nearest.distance} m from ${nearest.office.label} · ${nearest.within ? 'in range' : `must be within ${nearest.office.radius} m`}`;
  }, [offices.length, geoState, nearest, loadError]);
  const teamFooterNote = isSuper || role === 'DIRECTOR' ? 'Visible to admins only. Staff see only their own record.' : 'Your branches only. Staff see only their own record.';

  // ---- Consent gate ----
  if (!consent) {
    return <ConsentView onAgree={agree} onBack={onBack} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <Header title="Attendance" subtitle="At the office · face photo" onBack={onBack} />
      {/* NO flexGrow on contentContainerStyle: flexGrow:1 pins the content container to exactly
          the viewport height — children (history/team rows) still DRAW past the bottom edge, but
          the scrollable range computes to zero, so the page looks full yet cannot scroll at all.
          That was the "attendance can't scroll" bug. flexGrow belongs only on screens that must
          stretch SHORT content (e.g. to center a spinner); this page's content is long. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {canSeeTeam ? <TabSwitch tab={tab} onChange={setTab} /> : null}

        {canSeeTeam && tab === 'team' ? (
          <TeamView
            team={team}
            teamDate={teamDate}
            branchFilter={branchFilter}
            isSuper={isSuper}
            footerNote={teamFooterNote}
            onShiftDay={shiftTeamDay}
            onGoToday={goTodayTeam}
            onSelectBranch={setBranchFilter}
            onSelectMember={setReassign}
            onViewPhoto={setPhotoView}
          />
        ) : exempt === null ? (
          // Don't flash the punch UI before the server says whether this account is tracked —
          // exempt accounts used to render the full punch screen for a beat, then swap to
          // ExemptView (a visible blink on every open).
          <View className="items-center" style={{ paddingVertical: 56 }}><ActivityIndicator color={colors.primary} /></View>
        ) : exempt ? (
          <ExemptView />
        ) : hidden ? (
          // Director (hidden) mode: attendance records itself from the office geofence — show the
          // day + history read-only, no punch UI, no location gating.
          <>
            <LiveClock />
            <StatusCard statusText={statusText} statusColor={statusColor} punchedVia={punchedVia} inText={inText} outText={outText} />
            <Text style={{ color: colors.coolText, fontSize: 12.5, textAlign: 'center', marginBottom: 16, paddingHorizontal: 16 }}>
              Attendance is automatic for your account — you are checked in when you arrive at the office and checked out when you leave.
            </Text>
            <HistorySection history={history} />
          </>
        ) : (
          <>
            <LiveClock />
            <StatusCard statusText={statusText} statusColor={statusColor} punchedVia={punchedVia} inText={inText} outText={outText} />
            <PunchCard hasIn={!!inTime} hasOut={!!outTime} canPunch={canPunch} inRange={!!nearest?.within || offices.length === 0} punching={punching} locationSub={locationSub} onPunch={punchNow} />
            <HistorySection history={history} />
          </>
        )}
      </ScrollView>

      <ReassignModal
        reassign={reassign}
        userHistory={userHistory}
        adminOffices={adminOffices}
        onClose={closeReassign}
        onPickBranch={reassignBranchTo}
        onPickOffice={reassignTo}
        onSetDay={setMemberDay}
        onViewPhoto={setPhotoView}
      />

      {/* Full-screen punch-photo viewer */}
      <Modal visible={!!photoView} transparent animationType="fade" onRequestClose={() => setPhotoView(null)}>
        <Pressable onPress={() => setPhotoView(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          {photoView ? <Image source={{ uri: photoView }} style={{ width: '94%', height: '75%' }} resizeMode="contain" /> : null}
          <Pressable onPress={() => setPhotoView(null)} hitSlop={10} style={{ position: 'absolute', top: 54, right: 22 }}><X size={26} color="#fff" /></Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// The big date + time clock — MINUTE precision. The old version ticked setState every SECOND:
// even though the re-render was contained to this leaf, that's still 60 React renders + 60
// native text layouts a minute for as long as the page is open, competing with scrolling and
// presence work on the JS thread. Seconds add nothing to attendance (punch times are minutes),
// so now: one render per minute, scheduled exactly at the next minute boundary, and resynced
// when the app returns to the foreground (background timers get throttled and would drift).
const LiveClock = memo(function LiveClock() {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = (): void => {
      const now = new Date();
      setClock(now); // same-minute sets still repaint only this leaf; boundary sets flip the text
      t = setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 20);
    };
    tick();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { clearTimeout(t); tick(); } });
    return () => { clearTimeout(t); sub.remove(); };
  }, []);
  return (
    <View className="items-center mb-4">
      <Text style={{ color: colors.coolText, fontSize: 14, fontWeight: '600' }}>{clock.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
      <Text style={{ color: colors.ink, fontSize: 36, fontWeight: '800', letterSpacing: -1.2 }}>{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
    </View>
  );
});

const Header = memo(function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
      <Pressable onPress={onBack} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
      <View>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.coolText, fontSize: 12 }}>{subtitle}</Text> : null}
      </View>
    </View>
  );
});

// First-use consent explainer — static content, renders once per mount.
const ConsentView = memo(function ConsentView({ onAgree, onBack }: { onAgree: () => void; onBack: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <Header title="Attendance consent" onBack={onBack} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><Clock size={28} color={colors.primary} /></View>
        <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700', marginBottom: 8 }}>How attendance works</Text>
        <Text style={{ color: colors.coolText, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>Tap Check in when you arrive at the office and Check out when you leave. Both work only inside the office area and capture a photo of your face.</Text>
        {([
          ['At the office only', 'The button unlocks when your phone is within the office area (about 100 m of your branch).'],
          ['Face photo', 'Each punch opens the camera and captures your face — it is stored with that day’s record.'],
          ['What we record', 'Check-in / check-out time, date, your distance from the office and the face photo.'],
          ['Who can see it', 'You see your own record. Only your Super Admin sees the team dashboard. Times feed your Accounts software.'],
        ] as [string, string][]).map(([t, d]) => (
          <View key={t} className="flex-row gap-3 mb-3">
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}><Check size={12} color={colors.primary} strokeWidth={3} /></View>
            <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{t}</Text><Text style={{ color: colors.coolText, fontSize: 13, lineHeight: 18 }}>{d}</Text></View>
          </View>
        ))}
        <Pressable onPress={onAgree} style={{ marginTop: 16, height: 52, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>I understand & agree</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
});

const TabSwitch = memo(function TabSwitch({ tab, onChange }: { tab: 'mine' | 'team'; onChange: (t: 'mine' | 'team') => void }) {
  return (
    <View className="flex-row p-1 mb-3" style={{ borderRadius: 999, backgroundColor: colors.coolMuted }}>
      {([['mine', 'My attendance'], ['team', 'Team · Admin']] as const).map(([k, l]) => (
        <Pressable key={k} onPress={() => onChange(k)} style={{ flex: 1, paddingVertical: 9, borderRadius: 999, backgroundColor: tab === k ? colors.primary : 'transparent', alignItems: 'center' }}>
          <Text style={{ color: tab === k ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
});

// Status card — today's punch summary. Fed formatted primitives, so server re-adopts of the
// same times don't repaint it.
const StatusCard = memo(function StatusCard({ statusText, statusColor, punchedVia, inText, outText }: { statusText: string; statusColor: string; punchedVia: string; inText: string | null; outText: string | null }) {
  return (
    <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, marginBottom: 12 }}>
      <View className="flex-row items-center justify-between mb-3">
        <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>TODAY</Text>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: statusColor + '1A' }}><Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>{statusText}{punchedVia ? ' · ' + punchedVia : ''}</Text></View>
      </View>
      <View className="flex-row gap-2">
        <Stat label="Check-in" time={inText} color={colors.primary} Icon={ArrowDownLeft} />
        <Stat label="Check-out" time={outText} color={colors.danger} Icon={ArrowUpRight} />
      </View>
    </View>
  );
});

// Punch card — the button is ENABLED only inside the office geofence (owner rules, 07-31);
// tapping it opens the front camera for the face photo, then records the punch.
// Repaints only when punch/location state changes.
const PunchCard = memo(function PunchCard({ hasIn, hasOut, canPunch, inRange, punching, locationSub, onPunch }: { hasIn: boolean; hasOut: boolean; canPunch: boolean; inRange: boolean; punching: boolean; locationSub: string; onPunch: () => void }) {
  return (
    <>
      <View className="flex-row items-center gap-1.5 mb-2 px-1"><Clock size={13} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>MARK ATTENDANCE</Text></View>
      <View style={{ padding: 12, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: inRange ? colors.primary + '55' : colors.coolDivider, marginBottom: 12 }}>
        {/* Location gate status — distance to the nearest office, or what's blocking the fix. */}
        <View className="flex-row items-center gap-1.5" style={{ marginBottom: 10 }}>
          <MapPin size={14} color={inRange ? colors.primary : colors.coolText} />
          <Text style={{ color: colors.coolText, fontSize: 12.5, flex: 1 }}>{locationSub}</Text>
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: (inRange ? colors.primary : colors.danger) + '18' }}>
            <Text style={{ color: inRange ? colors.primary : colors.danger, fontSize: 10, fontWeight: '700' }}>{inRange ? 'IN RANGE' : 'OUT OF RANGE'}</Text>
          </View>
        </View>
        {hasIn && hasOut ? (
          <View className="flex-row items-center justify-center gap-1.5" style={{ paddingVertical: 13, borderRadius: 999, backgroundColor: colors.coolMuted }}><CheckCircle2 size={16} color={colors.coolText3} /><Text style={{ color: colors.coolText3, fontSize: 13.5, fontWeight: '700' }}>Done for today</Text></View>
        ) : (
          <>
            <Pressable onPress={onPunch} disabled={!canPunch || punching} className="flex-row items-center justify-center gap-1.5" style={{ paddingVertical: 13, borderRadius: 999, backgroundColor: canPunch && !punching ? colors.primary : colors.coolMuted }}>
              <Camera size={16} color={canPunch && !punching ? '#fff' : colors.coolText3} />
              <Text style={{ color: canPunch && !punching ? '#fff' : colors.coolText3, fontSize: 13.5, fontWeight: '700' }}>
                {punching ? 'Recording…' : !hasIn ? 'Check in' : 'Check out'}
              </Text>
            </Pressable>
            <Text style={{ color: colors.coolText, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
              {canPunch ? 'Tapping opens the camera to capture your face.' : 'The button unlocks when you are inside the office area.'}
            </Text>
          </>
        )}
      </View>
    </>
  );
});

// Storage note + my recent days. Repaints only when the history list itself changes.
const HistorySection = memo(function HistorySection({ history }: { history: AttendanceHistoryEntry[] }) {
  return (
    <>
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
  );
});

const ExemptView = memo(function ExemptView() {
  return (
    <View className="items-center" style={{ paddingVertical: 56 }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><CheckCircle2 size={44} color={colors.primary} /></View>
      <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 16 }}>Attendance not required</Text>
      <Text style={{ color: colors.coolText, fontSize: 13.5, marginTop: 5, textAlign: 'center', paddingHorizontal: 28 }}>Your account is exempt from attendance — you don&apos;t need to check in or out.</Text>
    </View>
  );
});

// Admin team dashboard. Mounted only on the Team tab; derived groupings are memoized against
// the team list + filter, so presence/GPS ticks on the parent never re-run them.
const TeamView = memo(function TeamView({ team, teamDate, branchFilter, isSuper, footerNote, onShiftDay, onGoToday, onSelectBranch, onSelectMember, onViewPhoto }: {
  team: TeamAttendanceEntry[];
  teamDate: string;
  branchFilter: string;
  isSuper: boolean;
  footerNote: string;
  onShiftDay: (n: number) => void;
  onGoToday: () => void;
  onSelectBranch: (id: string) => void;
  onSelectMember: (t: TeamAttendanceEntry) => void;
  onViewPhoto: (url: string) => void;
}) {
  // Branch-wise team view: chips come from the rows themselves, so they always match what the
  // viewer is allowed to see (the server already scopes the list to their branches).
  const teamBranches = useMemo(() => [...new Map(team.map((t) => [t.branchId || '—', t.branch || '—'])).entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label)), [team]);
  const shown = useMemo(() => (branchFilter === 'all' ? team : team.filter((t) => (t.branchId || '—') === branchFilter)), [team, branchFilter]);
  const presentCount = useMemo(() => shown.filter((t) => t.in).length, [shown]);
  const absentCount = shown.length - presentCount;
  // "All" groups into one section per branch; a picked branch renders as a single section.
  const teamSections = useMemo(() => (branchFilter === 'all' ? teamBranches : teamBranches.filter((b) => b.id === branchFilter))
    .map((b) => ({ ...b, rows: shown.filter((t) => (t.branchId || '—') === b.id) }))
    .filter((s) => s.rows.length > 0), [teamBranches, shown, branchFilter]);

  return (
    <>
      {/* Day navigator — browse any past day's team attendance. */}
      <View className="flex-row items-center justify-between mb-3" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, borderRadius: 14, paddingHorizontal: 4, paddingVertical: 4 }}>
        <Pressable onPress={() => onShiftDay(-1)} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={20} color={colors.ink} />
        </Pressable>
        <Pressable onPress={onGoToday} disabled={teamDate === todayKey()} className="items-center">
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>{dateLabel(teamDate)}</Text>
          {teamDate !== todayKey() ? <Text style={{ color: colors.primary, fontSize: 10.5, fontWeight: '700' }}>tap for today</Text> : null}
        </Pressable>
        <Pressable onPress={() => onShiftDay(1)} disabled={teamDate === todayKey()} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: teamDate === todayKey() ? 0.25 : 1 }}>
          <ChevronRight size={20} color={colors.ink} />
        </Pressable>
      </View>
      {/* Branch filter — one view per branch. Hidden when there is only one branch to show. */}
      {teamBranches.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center', paddingBottom: 12, paddingHorizontal: 2 }}>
          {([{ id: 'all', label: 'All branches' }, ...teamBranches]).map((b) => {
            const on = branchFilter === b.id;
            const n = b.id === 'all' ? team.length : team.filter((t) => (t.branchId || '—') === b.id).length;
            return (
              <Pressable key={b.id} onPress={() => onSelectBranch(b.id)} style={{ height: 34, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: on ? colors.primary : colors.coolMuted }}>
                <Text style={{ color: on ? '#fff' : colors.coolText, fontSize: 12.5, fontWeight: '700' }}>{b.label} · {n}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View className="flex-row gap-2 mb-3">
        <Stat3 n={presentCount} label="Present" color={colors.primary} bg={colors.primarySoft} />
        <Stat3 n={absentCount} label="Absent" color={colors.danger} bg={colors.danger + '12'} />
        <Stat3 n={shown.length} label="Total" color={colors.ink} bg={colors.coolMuted} />
      </View>
      {teamSections.map((sec) => (
        <View key={sec.id} style={{ marginBottom: 12 }}>
          <View className="flex-row items-center justify-between" style={{ marginBottom: 8, paddingHorizontal: 4 }}>
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{sec.label.toUpperCase()} · {dateLabel(teamDate).toUpperCase()}</Text>
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700' }}>{sec.rows.filter((t) => t.in).length}/{sec.rows.length} present</Text>
          </View>
          <View style={{ gap: 8 }}>
            {sec.rows.map((t) => {
              const absent = !t.in;
              return (
                <Pressable key={t.id} disabled={!isSuper} onPress={() => onSelectMember(t)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 p-3" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: absent ? colors.danger + '40' : colors.coolDivider, borderRadius: 14 }}>
                  <Avatar initials={t.initials} color={t.color} size={44} />
                  <View className="flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }}>{t.name}</Text>
                      {t.position ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 11, flexShrink: 1 }}>· {t.position}</Text> : null}
                    </View>
                    {/* Branch is the section header now, so the row line stays about the punch. */}
                    {absent
                      ? <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 2 }}>Absent</Text>
                      : <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12, marginTop: 2 }}>In {t.in}{t.out ? ' · Out ' + t.out : ''} · {t.via}</Text>}
                    {/* Office the person reports at — super-admin taps the row to reassign. */}
                    <View className="flex-row items-center gap-1" style={{ marginTop: 2 }}>
                      <Building2 size={11} color={colors.primary} />
                      <Text numberOfLines={1} style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>
                        {t.office || 'No office set'}{isSuper ? ' · tap to change' : ''}
                      </Text>
                    </View>
                  </View>
                  {/* Face photos captured at punch time — tap to view full-screen. */}
                  {t.inPhoto || t.outPhoto ? (
                    <View className="flex-row gap-1.5" style={{ marginRight: 4 }}>
                      {t.inPhoto ? <PunchThumb uri={t.inPhoto} label="IN" onPress={onViewPhoto} /> : null}
                      {t.outPhoto ? <PunchThumb uri={t.outPhoto} label="OUT" onPress={onViewPhoto} /> : null}
                    </View>
                  ) : null}
                  <Badge on={!absent} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {teamSections.length === 0 ? (
        <View className="items-center" style={{ paddingVertical: 28 }}>
          <Text style={{ color: colors.coolText, fontSize: 13 }}>No one to show for this branch.</Text>
        </View>
      ) : null}
      <Text style={{ color: colors.coolText, fontSize: 12, textAlign: 'center', marginTop: 12, paddingHorizontal: 12 }}>{footerNote}</Text>
    </>
  );
});

// Super-admin: set a teammate's working branch + office. Always mounted (Modal visibility flag);
// memo keeps it inert while closed — parent presence/GPS ticks don't re-diff it.
const ReassignModal = memo(function ReassignModal({ reassign, userHistory, adminOffices, onClose, onPickBranch, onPickOffice, onSetDay, onViewPhoto }: {
  reassign: TeamAttendanceEntry | null;
  userHistory: AttendanceHistoryEntry[] | null;
  adminOffices: AdminBranchOffices[];
  onClose: () => void;
  onPickBranch: (userId: string, branchId: string | null) => void;
  onPickOffice: (userId: string, officeId: string | null) => void;
  onSetDay: (date: string, present: boolean) => void;
  onViewPhoto: (url: string) => void;
}) {
  const reassignBranchOffices = useMemo(
    () => (reassign ? (adminOffices.find((b) => b.branchId === reassign.branchId)?.offices ?? []) : []),
    [reassign, adminOffices],
  );
  return (
    <Modal visible={!!reassign} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.card, borderRadius: 20, padding: 18, maxHeight: '80%' }}>
          <View className="flex-row items-center justify-between" style={{ marginBottom: 4 }}>
            <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Working branch & office</Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={18} color={colors.coolText} /></Pressable>
          </View>
          <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12.5, marginBottom: 12 }}>
            {reassign?.name} · {reassign?.branch}
          </Text>
          <ScrollView style={{ flexGrow: 0 }}>
          {/* Today's face photos — proof of who actually punched. Tap to view full-screen. */}
          {reassign?.inPhoto || reassign?.outPhoto ? (
            <>
              <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>TODAY · FACE PHOTOS</Text>
              <View className="flex-row gap-3" style={{ marginBottom: 14 }}>
                {reassign?.inPhoto ? (
                  <Pressable onPress={() => onViewPhoto(reassign.inPhoto as string)} style={{ alignItems: 'center' }}>
                    <Image source={{ uri: reassign.inPhoto }} style={{ width: 92, height: 92, borderRadius: 14, backgroundColor: colors.coolMuted }} />
                    <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '600', marginTop: 3 }}>In · {reassign.in ?? '—'}</Text>
                  </Pressable>
                ) : null}
                {reassign?.outPhoto ? (
                  <Pressable onPress={() => onViewPhoto(reassign.outPhoto as string)} style={{ alignItems: 'center' }}>
                    <Image source={{ uri: reassign.outPhoto }} style={{ width: 92, height: 92, borderRadius: 14, backgroundColor: colors.coolMuted }} />
                    <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '600', marginTop: 3 }}>Out · {reassign.out ?? '—'}</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}
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
                  {/* Punch face photos for that day — tap to view. */}
                  {e.inPhoto ? <PunchThumb uri={e.inPhoto} label="IN" size={30} onPress={onViewPhoto} /> : null}
                  {e.outPhoto ? <PunchThumb uri={e.outPhoto} label="OUT" size={30} onPress={onViewPhoto} /> : null}
                  {/* Corrections: fix a missed punch; only Manual days can be reverted to absent. */}
                  {!e.inTime ? (
                    <Pressable onPress={() => onSetDay(e.date, true)} hitSlop={6} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.primarySoft }}>
                      <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '700' }}>MARK PRESENT</Text>
                    </Pressable>
                  ) : e.via === 'Manual' ? (
                    <Pressable onPress={() => onSetDay(e.date, false)} hitSlop={6} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.danger + '12' }}>
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
                <Pressable key={b.branchId} onPress={() => reassign && !on && onPickBranch(reassign.id, b.branchId)} className="flex-row items-center gap-2" style={{ paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.primary : colors.coolDivider, backgroundColor: on ? colors.primarySoft : colors.card }}>
                  <MapPin size={16} color={on ? colors.primary : colors.coolText} />
                  <Text style={{ flex: 1, color: colors.ink, fontSize: 14, fontWeight: '600' }}>{b.code || b.name || 'Branch'}{b.city ? ` · ${b.city}` : ''}</Text>
                  {on ? <Check size={16} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
            {/* Clear the explicit working branch → person falls back to their CRM access branch. */}
            <Pressable onPress={() => reassign && onPickBranch(reassign.id, null)} disabled={!reassign?.workBranchId} className="items-center" style={{ paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: colors.coolDivider, borderStyle: 'dashed', marginTop: 2 }}>
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
                  <Pressable key={o.id} onPress={() => reassign && onPickOffice(reassign.id, o.id)} className="flex-row items-center gap-2" style={{ paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.primary : colors.coolDivider, backgroundColor: on ? colors.primarySoft : colors.card }}>
                    <Building2 size={16} color={on ? colors.primary : colors.coolText} />
                    <Text style={{ flex: 1, color: colors.ink, fontSize: 14, fontWeight: '600' }}>{o.label || 'Office'}{o.isDefault ? ' · default' : ''}</Text>
                    {on ? <Check size={16} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
              {/* Clear the explicit assignment → person falls back to the branch default office. */}
              <Pressable onPress={() => reassign && onPickOffice(reassign.id, null)} className="items-center" style={{ paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: colors.coolDivider, borderStyle: 'dashed', marginTop: 2 }}>
                <Text style={{ color: colors.coolText, fontSize: 13, fontWeight: '600' }}>{reassign?.officeId ? 'Clear assignment (use branch default)' : 'On branch default'}</Text>
              </Pressable>
            </View>
          )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const Stat = memo(function Stat({ label, time, color, Icon }: { label: string; time: string | null; color: string; Icon: typeof ArrowDownLeft }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: colors.coolMuted }}>
      <View className="flex-row items-center gap-1 mb-1"><Icon size={14} color={color} /><Text style={{ color, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text></View>
      <Text style={{ color: time ? colors.ink : colors.coolText3, fontSize: 20, fontWeight: '800', letterSpacing: -0.5 }}>{time || '—'}</Text>
    </View>
  );
});
const Stat3 = memo(function Stat3({ n, label, color, bg }: { n: number; label: string; color: string; bg: string }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 14, alignItems: 'center', backgroundColor: bg }}>
      <Text style={{ color, fontSize: 22, fontWeight: '800' }}>{n}</Text>
      <Text style={{ color, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
    </View>
  );
});
// Small punch-photo thumbnail with an IN/OUT tag — tap opens the full-screen viewer.
const PunchThumb = memo(function PunchThumb({ uri, label, onPress, size = 38 }: { uri: string; label: string; onPress: (url: string) => void; size?: number }) {
  return (
    <Pressable onPress={() => onPress(uri)} hitSlop={4} style={{ alignItems: 'center' }}>
      <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 10, backgroundColor: colors.coolMuted }} />
      <Text style={{ color: colors.coolText, fontSize: 8.5, fontWeight: '700', marginTop: 1 }}>{label}</Text>
    </Pressable>
  );
});

const Badge = memo(function Badge({ on }: { on: boolean }) {
  return <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: (on ? colors.primary : colors.danger) + '18' }}><Text style={{ color: on ? colors.primary : colors.danger, fontSize: 10, fontWeight: '700' }}>{on ? 'PRESENT' : 'ABSENT'}</Text></View>;
});

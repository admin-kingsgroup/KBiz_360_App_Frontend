import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, Alert, Linking, AppState, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { ChevronLeft, ChevronRight, Clock, Check, Navigation, Zap, ScanFace, Lock, CheckCircle2, ArrowDownLeft, ArrowUpRight, MapPinOff, MapPin, Building2, X, Wifi } from 'lucide-react-native';
import { Modal } from 'react-native';
import { Avatar } from '../src/components/ui';
import { colors } from '../src/theme';
import { useGeoFence } from '../src/hooks/useGeoFence';
import { useEventCallback } from '../src/hooks/useEventCallback';
import { useAttendanceStore } from '../src/store/attendanceStore';
import { useAccessStore } from '../src/store/accessStore';
import { useUiStore } from '../src/store/uiStore';
import { canFacePunch } from '../src/logic/attendance';
import { saveConsent } from '../src/services/storage';
import { checkIn, checkOut, getMyAttendance, getTeamAttendance, getAttendanceHistory, getUserAttendanceHistory, adminSetAttendanceDay, getOffices, getAdminOffices, assignUserOffice, assignUserWorkBranch, type AttendanceOffice, type AttendanceHistoryEntry, type AdminBranchOffices } from '../src/api/attendance';
import { getCurrentSsid } from '../src/services/wifi';
import { ssidMatches, cleanSsid } from '../src/logic/wifi';
import { syncAttendanceGeofencing, disarmAttendanceGeofencing, getBackgroundLocationState, type BackgroundLocationState } from '../src/services/backgroundAttendance';
import { notePendingExit, peekPendingExit, clearPendingExit } from '../src/services/pendingExit';
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
//
// RENDER ARCHITECTURE: every section below is a React.memo child fed primitives + stable
// callbacks (useEventCallback), so a state tick only repaints the section whose data changed —
// a GPS fix repaints the geofence card, an SSID change the Wi-Fi card, the 1s clock only
// <LiveClock/>. The 15s presence heartbeat is a plain interval (no state), so it re-renders
// NOTHING by itself. Do not pass fresh objects/arrays/closures to these children.
export default function Attendance() {
  const router = useRouter();
  const [offices, setOffices] = useState<AttendanceOffice[]>([]);
  const [office, setOffice] = useState<AttendanceOffice | null>(null);
  const [tab, setTab] = useState<'mine' | 'team'>('mine');
  // NOTE: no per-second state here. The ticking clock lives in <LiveClock /> (its own leaf
  // component) so the seconds display doesn't re-render this whole screen — that re-render is
  // what made the page lag and stutter while scrolling.
  const [scanning, setScanning] = useState(false);
  const [team, setTeam] = useState<TeamAttendanceEntry[]>([]);
  const [teamDate, setTeamDate] = useState(todayKey()); // day shown on the admin team tab
  const [branchFilter, setBranchFilter] = useState<string>('all'); // branchId shown on the team tab ('all' = every branch, grouped)
  const [history, setHistory] = useState<AttendanceHistoryEntry[]>([]);
  const [userHistory, setUserHistory] = useState<AttendanceHistoryEntry[] | null>(null); // selected teammate's recent days (admin modal)
  const [adminOffices, setAdminOffices] = useState<AdminBranchOffices[]>([]); // for the super-admin reassign picker
  const [reassign, setReassign] = useState<TeamAttendanceEntry | null>(null);
  // Exempt is TRI-STATE: null = not known yet. The auto-punch engine may only run once the server
  // has said exempt === false — an exempt account (super admins are always untracked server-side)
  // that auto-punches gets rejected, reverts to "not checked in", and fires again a minute later:
  // an endless toast pair ("Auto check-in…" / "Check-in NOT recorded…") that read as the page
  // "blinking" forever. Presence/GPS/Wi-Fi work is skipped entirely for exempt accounts.
  const [exempt, setExempt] = useState<boolean | null>(null);
  const exemptRef = useRef<boolean | null>(null);
  const [ssid, setSsid] = useState<string | null>(null); // Wi-Fi network the device is on (null when unreadable)
  const autoBlockedUntilRef = useRef(0); // back-off after the server rejects an auto punch (no retry storm)
  const autoFailsRef = useRef(0); // consecutive silent-punch failures — escalates the back-off

  const role = useAccessStore((s) => s.user?.role);
  const isSuper = role === 'SUPER_ADMIN';
  // Who gets the Team tab: super admin + company manager (DIRECTOR) see every branch; a branch
  // manager sees only their own — the server scopes the list, this just shows the tab.
  const canSeeTeam = isSuper || role === 'DIRECTOR' || role === 'BRANCH_MANAGER';
  const consent = useAttendanceStore((s) => s.consent);
  const att = useAttendanceStore((s) => s.att);
  const presence = useAttendanceStore((s) => s.presence);
  const refreshPresence = useAttendanceStore((s) => s.refreshPresence);
  const runAutoPunch = useAttendanceStore((s) => s.runAutoPunch);
  const showToast = useUiStore((s) => s.showToast);

  // GPS watch only for accounts the server actually tracks (exempt === false).
  const { coords, geoState } = useGeoFence(exempt === false ? office : null);

  // Poll the connected Wi-Fi SSID (Android needs location perms/services on to read it; the
  // consent flow already asks). Drives the Wi-Fi half of presence — verified again server-side.
  // setSsid with an unchanged string is a same-value set, so the poll itself re-renders nothing;
  // only an actual network change does (and that must reach presence logic + the Wi-Fi card).
  //
  // FLAP GUARD: NetInfo on Samsung intermittently reads null for one poll while still on Wi-Fi.
  // Taking that null at face value flipped the Wi-Fi card OFF→ON, the status pill red→green and
  // the fallback buttons locked→unlocked every few polls — the "page keeps blinking" bug. A null
  // now needs TWO consecutive reads before we drop the SSID; a real network is adopted instantly.
  const ssidMissRef = useRef(0);
  useEffect(() => {
    if (exempt !== false) return; // presence inputs are only needed for tracked accounts
    let alive = true;
    const read = (): void => {
      void getCurrentSsid().then((s) => {
        if (!alive) return;
        if (s) { ssidMissRef.current = 0; setSsid(s); return; }
        ssidMissRef.current += 1;
        if (ssidMissRef.current >= 2) setSsid(null);
      });
    };
    read();
    const t = setInterval(read, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [exempt]);

  // Background-location state drives the "Allow all the time" banner; re-checked when the app
  // returns from Settings (AppState active) so the banner clears the moment the user grants it.
  const [bgLocation, setBgLocation] = useState<BackgroundLocationState>('granted');
  useEffect(() => {
    const check = (): void => { void getBackgroundLocationState().then(setBgLocation); };
    check();
    // Background geofencing only re-arms for tracked accounts (exempt punches are doomed server-side).
    // A pending load failure also re-fires immediately on foreground — no waiting out the backoff.
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { check(); if (exemptRef.current === false) void syncAttendanceGeofencing(); if (loadErrorRef.current) loadCore(); } });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the caller's office geofence(s), today's record, history, and the team view on open.
  // Background geofencing is armed/disarmed only AFTER the server says whether this account is
  // tracked — an exempt account arming geofences just generates rejected punches forever.
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
      getOffices().then((list) => { setOffices(list); setOffice((cur) => cur ?? list[0] ?? null); }),
      getMyAttendance().then((m) => {
        const isExempt = !!m.exempt;
        setExempt(isExempt); exemptRef.current = isExempt;
        if (isExempt) void disarmAttendanceGeofencing();
        else void syncAttendanceGeofencing();
        autoBlockedUntilRef.current = 0; // server answered — auto-punch may run (tracked accounts)
        useAttendanceStore.getState().setAtt({ inTime: m.inTime ? new Date(m.inTime) : null, outTime: m.outTime ? new Date(m.outTime) : null, via: (m.via as PunchMethod | null) ?? null });
      }),
      getAttendanceHistory().then(setHistory),
      ...(isSuper ? [getAdminOffices().then(setAdminOffices)] : []), // offices for the reassign picker
    ];
    void Promise.allSettled(tasks).then((results) => {
      // Exempt gate fallback while the server hasn't answered yet: behave as tracked so the UI
      // stays usable (manual punch works; the server is the gate), but do NOT auto-punch on a
      // guess — if this account is actually exempt, every auto punch is doomed to a reject +
      // revert + toast pair (the old "blinking" loop). Auto unblocks on the first server answer.
      if (results[1].status === 'rejected' && exemptRef.current === null) {
        setExempt(false); exemptRef.current = false;
        autoBlockedUntilRef.current = Number.MAX_SAFE_INTEGER;
      }
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

  // Persist a punch to the backend and adopt the server's record. `silent` = auto (no success
  // toast). Failures are NEVER silent: the server is the record of truth, so on rejection we
  // re-adopt its state (the optimistic local punch would otherwise show "checked in" all day
  // while the server has nothing — the person then reads as absent tomorrow) and tell the user.
  const apiPunch = useEventCallback(async (kind: 'in' | 'out', method: 'auto' | 'face', silent = false, source?: 'geofence'): Promise<void> => {
    try {
      // source:'geofence' marks a distance-driven AUTO punch so the server applies its exit drift
      // guard to it; manual/face punches never send it (user-initiated punches are never blocked).
      // A geofence check-out also carries the pending-exit marker (exitAt): if the departure was
      // first detected while the app was backgrounded (refused/undelivered punch), the server
      // back-dates checkOutAt to that instant instead of stamping "now".
      const pendingExitAt = kind === 'out' && source === 'geofence' ? await peekPendingExit() : null;
      const body = { coords: coords ? { lat: coords.lat, lng: coords.lng } : null, method, wifiSsid: ssid, ...(source ? { source } : {}), ...(pendingExitAt ? { exitAt: pendingExitAt } : {}) };
      const m = kind === 'in' ? await checkIn(body) : await checkOut(body);
      // Punch accepted → the pending exit is resolved either way: 'out' closed the day at the
      // back-dated time; 'in' proves presence at the office (the marker was drift).
      void clearPendingExit();
      autoFailsRef.current = 0; // server reachable + accepting — clear the failure escalation
      if (autoBlockedUntilRef.current === Number.MAX_SAFE_INTEGER) autoBlockedUntilRef.current = 0; // mount fetch had failed; server is back
      useAttendanceStore.getState().setAtt({ inTime: m.inTime ? new Date(m.inTime) : null, outTime: m.outTime ? new Date(m.outTime) : null, via: (m.via as PunchMethod | null) ?? null });
      getAttendanceHistory().then(setHistory).catch(() => undefined);
      if (!silent) showToast(kind === 'in' ? `Checked in · ${fmt(m.inTime ? new Date(m.inTime) : null)}` : `Checked out · ${fmt(m.outTime ? new Date(m.outTime) : null)}`);
    } catch (e) {
      // A server REJECTION (ApiError) won't heal in a minute — back off 15 min so a persistently
      // rejected auto-punch can't toast-spam the screen. A single network blip keeps the 60s retry,
      // but CONSECUTIVE network failures escalate to 15 min too: on a flaky office uplink the POST
      // can fail while the recovery GET succeeds (reverting the punch), and a flat 60s backoff
      // replayed that check-in → revert → toast pair every minute for as long as the screen was open.
      if (silent) {
        autoFailsRef.current += 1;
        autoBlockedUntilRef.current = Date.now() + (e instanceof ApiError || autoFailsRef.current >= 2 ? 15 * 60_000 : 60_000);
      }
      // Marker hygiene mirrors the headless task: a server REJECTION refutes the pending exit
      // (drift guard / already out); a network failure keeps its instant for the retry punch.
      if (kind === 'out' && source === 'geofence') {
        if (e instanceof ApiError) void clearPendingExit();
        else void notePendingExit();
      }
      try {
        const m = await getMyAttendance(); // revert the optimistic local state to the server's truth
        useAttendanceStore.getState().setAtt({ inTime: m.inTime ? new Date(m.inTime) : null, outTime: m.outTime ? new Date(m.outTime) : null, via: (m.via as PunchMethod | null) ?? null });
      } catch { /* offline — keep local state; next open reconciles via getMyAttendance */ }
      showToast(`${kind === 'in' ? 'Check-in' : 'Check-out'} NOT recorded — ${e instanceof ApiError ? e.message : 'network error'}`);
    }
  });

  // Recompute presence (office Wi-Fi + geofence) whenever GPS, Wi-Fi or office changes, then
  // auto-punch. The backend re-verifies both the location and the SSID on every punch.
  // Check-IN: while PRESENT (both signals hold — positive evidence), instant.
  // Check-OUT: IMMEDIATE the moment a real fix is beyond the office fence (owner call, 07-28:
  // "out 100 m → checked out, no delay") — no grace period, no spatial buffer. It is DISTANCE-ONLY:
  // a Wi-Fi drop alone never checks anyone out (removed earlier the same day), and a lost fix is
  // UNKNOWN, not an exit. The server re-verifies the coords via its drift guard (source:'geofence').
  const evaluatePresence = useEventCallback((): void => {
    if (exempt !== false || !office) return; // only tracked accounts run presence + auto-punch
    const wifiOn = ssidMatches(ssid, office.wifiSsid);
    const wifiConfigured = !!cleanSsid(office.wifiSsid);
    const p = refreshPresence({ wifiOn, wifiConfigured, coords, office: { lat: office.lat, lng: office.lng, radius: office.radius } });
    // Provably at the office → any pending-exit marker was drift that never resolved; refute it
    // so a later real check-out can't back-date to a bogus mid-day instant.
    if (p.present) void clearPendingExit();
    // Not present AND not provably outside the fence (no fix / fix still inside): unknown — do
    // nothing. This is the Wi-Fi-drop / GPS-silence case that must never close the day.
    if (!p.present && (p.distance == null || p.distance <= office.radius)) return;
    if (Date.now() < autoBlockedUntilRef.current) return; // throttled — one auto-punch per minute, see below
    const fired = runAutoPunch();
    if (fired) {
      // Throttle EVERY auto-punch (not just server rejections) to at most once a minute. A punch's
      // own success can flip presence-derived state, so an unthrottled evaluate could ping-pong.
      autoBlockedUntilRef.current = Date.now() + 60_000;
      const a = useAttendanceStore.getState().att;
      if (a.outTime) { showToast('Auto check-out · ' + fmt(a.outTime)); void apiPunch('out', 'auto', true, 'geofence'); }
      else if (a.inTime) { showToast('Auto check-in · ' + fmt(a.inTime) + ' · ' + (p.viaNow || 'Auto')); void apiPunch('in', 'auto', true); }
    }
  });
  // Presence heartbeat: re-evaluates auto-punch even when no GPS/Wi-Fi event arrives (e.g. the
  // away-grace timer maturing). 15s against a 5-minute grace is ample. The heartbeat is a plain
  // interval calling a stable callback — it holds NO state, so a quiet tick re-renders nothing
  // (the old `beat` counter re-rendered the entire screen every 15s; before that, a 1-second
  // clock tick re-rendered it 60×/min). Store writes inside refreshPresence only publish when a
  // presence field actually changed, so quiet ticks stay render-free end to end.
  useEffect(() => {
    evaluatePresence();
    const t = setInterval(evaluatePresence, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, ssid, office, exempt]);

  const inTime = att.inTime;
  const outTime = att.outTime;
  const present = presence?.present ?? false;
  const viaNow = presence?.viaNow ?? '';
  const distance = presence?.distance ?? null;
  const inside = presence?.inside ?? false;
  const wifiOnNow = presence?.wifiOn ?? false;
  const wifiConfigured = presence?.wifiConfigured ?? false;
  const punchedVia = att.via || '';

  const agree = useCallback((): void => { useAttendanceStore.getState().setConsent(true); void saveConsent(true); }, []);
  const onBack = useCallback((): void => router.back(), [router]);
  const openSettings = useCallback((): void => { void Linking.openSettings(); }, []);
  const selectOffice = useCallback((o: AttendanceOffice): void => setOffice(o), []);
  const closeReassign = useCallback((): void => setReassign(null), []);

  // Biometric face fallback (no ML) — gated by foundation canFacePunch.
  const faceScan = useEventCallback(async (): Promise<void> => {
    if (!canFacePunch(present, att, scanning)) { if (!present) showToast('Face punch needs office Wi-Fi + geofence'); return; }
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
  });

  const punchPresent = useEventCallback((): void => {
    if (!present) { showToast('Need office Wi-Fi + geofence'); return; }
    const kind: 'in' | 'out' | null = !inTime ? 'in' : (!outTime ? 'out' : null);
    if (kind) void apiPunch(kind, 'auto');
  });

  // Derived display values — memoized primitives so the memo children below bail out whenever
  // the underlying values are unchanged (att is re-adopted as a fresh object after server calls).
  const inText = useMemo(() => fmt(inTime), [inTime]);
  const outText = useMemo(() => fmt(outTime), [outTime]);
  const statusColor = useMemo(() => (inTime ? (outTime ? colors.coolText : colors.primary) : (present ? colors.primary : colors.danger)), [inTime, outTime, present]);
  const statusText = useMemo(() => (inTime ? (outTime ? 'Done for today' : 'Checked in') : (present ? 'Detecting' : 'Not checked in')), [inTime, outTime, present]);
  const wifiSub = useMemo(
    () => (!office ? 'No office set' : !wifiConfigured ? 'No office Wi-Fi configured — geofence only' : wifiOnNow ? `Connected · ${cleanSsid(ssid) ?? office.wifiSsid}` : ssid ? `On “${cleanSsid(ssid)}” — not the office Wi-Fi` : 'Not connected to Wi-Fi'),
    [office, wifiConfigured, wifiOnNow, ssid],
  );
  const geoSub = useMemo(
    () => (!office ? 'No office set' : distance != null ? `${distance} m away · radius ${office.radius} m` : `Radius ${office.radius} m · ${geoState}`),
    [office, distance, geoState],
  );
  const teamFooterNote = isSuper || role === 'DIRECTOR' ? 'Visible to admins only. Staff see only their own record.' : 'Your branches only. Staff see only their own record.';

  // ---- Consent gate ----
  if (!consent) {
    return <ConsentView onAgree={agree} onBack={onBack} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
      <Header title="Attendance" subtitle="Auto first · face is backup" onBack={onBack} />
      {/* NO flexGrow on contentContainerStyle: flexGrow:1 pins the content container to exactly
          the viewport height — children (history/team rows) still DRAW past the bottom edge, but
          the scrollable range computes to zero, so the page looks full yet cannot scroll at all.
          That was the "attendance can't scroll" bug. flexGrow belongs only on screens that must
          stretch SHORT content (e.g. to center a spinner); this page's content is long. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Auto-punch needs "Allow all the time" location. Android 11+ never shows that option in
            the in-app dialog — the user must flip it in Settings, so guide them there. */}
        {bgLocation === 'denied' || bgLocation === 'undetermined' ? <BgLocationBanner onOpenSettings={openSettings} /> : null}
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
          />
        ) : exempt === null ? (
          // Don't flash the punch UI before the server says whether this account is tracked —
          // exempt accounts used to render the full punch screen for a beat, then swap to
          // ExemptView (a visible blink on every open).
          <View className="items-center" style={{ paddingVertical: 56 }}><ActivityIndicator color={colors.primary} /></View>
        ) : exempt ? (
          <ExemptView />
        ) : (
          <>
            <LiveClock />
            <OfficeSection offices={offices} officeId={office?.id ?? null} address={office?.address ?? null} loadFailed={loadError} onSelect={selectOffice} />
            <StatusCard statusText={statusText} statusColor={statusColor} punchedVia={punchedVia} inText={inText} outText={outText} />
            <AutoSection wifiOnNow={wifiOnNow} inside={inside} wifiConfigured={wifiConfigured} wifiSub={wifiSub} geoSub={geoSub} />
            <FallbackCard present={present} hasIn={!!inTime} hasOut={!!outTime} viaNow={viaNow} scanning={scanning} onPunch={punchPresent} onFace={faceScan} />
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
      />
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
        <Text style={{ color: colors.coolText, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>When you open KBiz 360 at the office, you are checked in automatically when you are on the office Wi-Fi and inside the office area. Face punch is a manual backup if auto-detection fails.</Text>
        {([
          ['Automatic first', 'On the office Wi-Fi and inside the geofence together, check-in / check-out happen on their own.'],
          ['Face = backup', 'If auto-detection fails, punch manually by face (still at the office) so no one is wrongly marked absent.'],
          ['What we record', 'Only check-in / check-out time, date, and method (Wi-Fi, Geofence or Face).'],
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

// "Allow all the time" nudge — static apart from the stable settings callback.
const BgLocationBanner = memo(function BgLocationBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <Pressable
      onPress={onOpenSettings}
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

// Office label + picker chips + address. Re-renders only when the office list/selection changes.
// loadFailed distinguishes "the server said there are no offices" from "we couldn't ask the
// server" — showing the ask-your-admin message for a network failure sent admins chasing a
// non-existent configuration problem.
const OfficeSection = memo(function OfficeSection({ offices, officeId, address, loadFailed, onSelect }: { offices: AttendanceOffice[]; officeId: string | null; address: string | null; loadFailed: boolean; onSelect: (o: AttendanceOffice) => void }) {
  return (
    <>
      <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6, paddingHorizontal: 4 }}>OFFICE</Text>
      {offices.length === 0 ? (
        <View className="flex-row items-center gap-2.5 p-3 mb-3" style={{ backgroundColor: WARN + '14', borderWidth: 1, borderColor: WARN + '40', borderRadius: 14 }}>
          <MapPinOff size={18} color={WARN} />
          <Text style={{ color: colors.coolText, fontSize: 12.5, flex: 1 }}>
            {loadFailed
              ? 'Couldn’t reach the server to load your office — retrying automatically…'
              : 'No office location is set for your branch yet. Ask your admin to set it in Admin → Office locations.'}
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
          {offices.map((o) => {
            const sel = o.id === officeId;
            return (
              <Pressable key={o.id} onPress={() => onSelect(o)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? colors.primary : colors.coolMuted }}>
                <Text style={{ color: sel ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>{o.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {address ? (
        <View className="flex-row items-center gap-1.5" style={{ marginBottom: 12, paddingHorizontal: 2 }}>
          <MapPin size={13} color={colors.coolText} />
          <Text numberOfLines={2} style={{ color: colors.coolText, fontSize: 12, flex: 1 }}>{address}</Text>
        </View>
      ) : null}
    </>
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

// Automatic (Wi-Fi + geofence) cards. A GPS fix or SSID change repaints ONLY this section.
const AutoSection = memo(function AutoSection({ wifiOnNow, inside, wifiConfigured, wifiSub, geoSub }: { wifiOnNow: boolean; inside: boolean; wifiConfigured: boolean; wifiSub: string; geoSub: string }) {
  return (
    <>
      <View className="flex-row items-center gap-1.5 mb-2 px-1"><Zap size={13} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>AUTOMATIC · PRIMARY</Text></View>
      <View style={{ gap: 8, marginBottom: 12 }}>
        <AutoCard
          icon={<Wifi size={18} color={wifiOnNow ? colors.primary : colors.coolText} />}
          title="Office Wi-Fi"
          sub={wifiSub}
          on={wifiOnNow}
          color={colors.primary}
        />
        <AutoCard
          icon={<Navigation size={18} color={inside ? colors.primary : colors.coolText} />}
          title="Office geofence"
          sub={geoSub}
          on={inside}
          color={colors.primary}
        />
        <Text style={{ color: colors.coolText, fontSize: 12, textAlign: 'center' }}>
          {wifiConfigured
            ? 'Check-in needs the office Wi-Fi AND the office area together. The moment either drops, you are checked out. Both are verified on the server.'
            : 'You are checked in automatically when you are inside the office area, and checked out when you leave. Your location is verified on the server.'}
        </Text>
      </View>
    </>
  );
});

// Manual face/confirm fallback. Repaints only when presence/punch state or scanning changes.
const FallbackCard = memo(function FallbackCard({ present, hasIn, hasOut, viaNow, scanning, onPunch, onFace }: { present: boolean; hasIn: boolean; hasOut: boolean; viaNow: string; scanning: boolean; onPunch: () => void; onFace: () => void }) {
  return (
    <>
      <View className="flex-row items-center gap-1.5 mb-2 px-1"><ScanFace size={13} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>MANUAL FALLBACK · IF AUTO FAILS</Text></View>
      <View style={{ padding: 12, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: present ? colors.primary + '55' : colors.coolDivider, marginBottom: 12 }}>
        <Text style={{ color: colors.coolText, fontSize: 12.5, marginBottom: 10 }}>If auto did not trigger, punch manually while at the office (Wi-Fi + geofence). Works for check-in and check-out so no one can punch from outside.</Text>
        {!present ? (
          <View className="flex-row items-center justify-center gap-1.5" style={{ paddingVertical: 13, borderRadius: 999, backgroundColor: colors.coolMuted }}><Lock size={16} color={colors.coolText3} /><Text style={{ color: colors.coolText3, fontSize: 13.5, fontWeight: '700' }}>Needs office Wi-Fi + geofence</Text></View>
        ) : hasIn && hasOut ? (
          <View className="flex-row items-center justify-center gap-1.5" style={{ paddingVertical: 13, borderRadius: 999, backgroundColor: colors.coolMuted }}><CheckCircle2 size={16} color={colors.coolText3} /><Text style={{ color: colors.coolText3, fontSize: 13.5, fontWeight: '700' }}>Done for today</Text></View>
        ) : (
          <>
            <View className="flex-row gap-2 mb-2">
              <Pressable onPress={onPunch} className="flex-row items-center justify-center gap-1.5" style={{ flex: 1, paddingVertical: 13, borderRadius: 999, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.card }}>
                <Navigation size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>{!hasIn ? 'Check in' : 'Check out'} · {viaNow || 'office'}</Text>
              </Pressable>
              <Pressable onPress={onFace} disabled={scanning} className="flex-row items-center justify-center gap-1.5" style={{ flex: 1, paddingVertical: 13, borderRadius: 999, backgroundColor: scanning ? colors.primaryDark : colors.primary }}>
                <ScanFace size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{scanning ? 'Verifying…' : (!hasIn ? 'Face in' : 'Face out')}</Text>
              </Pressable>
            </View>
            <Text style={{ color: colors.coolText, fontSize: 11, textAlign: 'center' }}>Check {!hasIn ? 'in' : 'out'} by Wi-Fi/geofence confirm, or by face — both within the office.</Text>
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
const TeamView = memo(function TeamView({ team, teamDate, branchFilter, isSuper, footerNote, onShiftDay, onGoToday, onSelectBranch, onSelectMember }: {
  team: TeamAttendanceEntry[];
  teamDate: string;
  branchFilter: string;
  isSuper: boolean;
  footerNote: string;
  onShiftDay: (n: number) => void;
  onGoToday: () => void;
  onSelectBranch: (id: string) => void;
  onSelectMember: (t: TeamAttendanceEntry) => void;
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
const ReassignModal = memo(function ReassignModal({ reassign, userHistory, adminOffices, onClose, onPickBranch, onPickOffice, onSetDay }: {
  reassign: TeamAttendanceEntry | null;
  userHistory: AttendanceHistoryEntry[] | null;
  adminOffices: AdminBranchOffices[];
  onClose: () => void;
  onPickBranch: (userId: string, branchId: string | null) => void;
  onPickOffice: (userId: string, officeId: string | null) => void;
  onSetDay: (date: string, present: boolean) => void;
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
const Badge = memo(function Badge({ on }: { on: boolean }) {
  return <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: (on ? colors.primary : colors.danger) + '18' }}><Text style={{ color: on ? colors.primary : colors.danger, fontSize: 10, fontWeight: '700' }}>{on ? 'PRESENT' : 'ABSENT'}</Text></View>;
});
const AutoCard = memo(function AutoCard({ icon, title, sub, on, color, children }: { icon: ReactNode; title: string; sub: string; on: boolean; color: string; children?: ReactNode }) {
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
});

import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import type * as LocationModuleT from 'expo-location';
import type * as TaskManagerModuleT from 'expo-task-manager';
import { loadSession, updateStoredTokens } from './storage/session';
import { setTokens } from '../api/tokens';
import { confirmGeofenceExit, confirmGeofenceEntry, type ArmedRegion } from '../logic/attendance';

// Background auto check-in via OS geofencing. When the signed-in user enters/leaves an office region,
// the OS wakes the app (even if killed) and we punch in/out. Lazy-required + Expo-Go-guarded exactly
// like the notifications service: TaskManager/background location aren't available in Expo Go, and a
// static import there crashes the app at boot. Needs a dev/standalone build + "Always" location.
//
// Reboot survival + punch healing: Android CLEARS registered geofences on reboot and only re-arms
// them when the app next opens — so a periodic background-fetch task (startOnBoot, ~15 min) re-arms
// the office regions headlessly AND reconciles missed punches in BOTH directions (fix inside a
// region + no check-in today → punch in; day open + accurate fix beyond every fence → punch out).
// iOS re-launches apps for region events natively, so this mainly matters on Android.
export const GEOFENCE_TASK = 'kb360-attendance-geofence';
export const GEOFENCE_REFRESH_TASK = 'kb360-attendance-geofence-refresh';

type LocationModule = typeof LocationModuleT;
type TaskManagerModule = typeof TaskManagerModuleT;
let _loc: LocationModule | null = null;
let _task: TaskManagerModule | null = null;
function loc(): LocationModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!_loc) _loc = require('expo-location') as LocationModule;
  return _loc;
}
function task(): TaskManagerModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!_task) _task = require('expo-task-manager') as TaskManagerModule;
  return _task;
}

const apiBase = (): string => (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:4000';

// Cold-start-safe punch: the OS may relaunch the app for a geofence event with no React tree and no
// in-memory token, so we read the persisted session directly and refresh once on 401. Best-effort —
// the foreground app reconciles today's record on next open.
async function postPunch(kind: 'check-in' | 'check-out', coords: { lat: number; lng: number } | null): Promise<void> {
  const session = await loadSession();
  if (!session) return;
  const url = `${apiBase()}/api/attendance/${kind}`;
  // The strict rule needs the device's Wi-Fi network too: check-in requires the office SSID, and
  // check-out drift rejection uses it as the still-at-the-office anchor. Best-effort headlessly.
  let wifiSsid: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCurrentSsid } = require('./wifi') as typeof import('./wifi');
    wifiSsid = await getCurrentSsid();
  } catch { /* SSID unreadable headlessly — server treats it as not on office Wi-Fi */ }
  // source:'geofence' lets the server apply its still-inside drift rejection to these check-outs.
  const body = JSON.stringify({ method: 'auto', coords, source: 'geofence', wifiSsid });
  const send = (token: string): Promise<Response> =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body });
  let res = await send(session.access);
  if (res.status === 401) {
    const r = await fetch(`${apiBase()}/api/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refresh }),
    });
    if (r.ok) {
      const t = (await r.json()) as { accessToken: string; refreshToken: string };
      await updateStoredTokens(t.accessToken, t.refreshToken);
      // Keep the LIVE in-memory holder in step too. The backend revokes the old refresh token on
      // rotation, so if the app process is still alive (backgrounded), leaving the in-memory tokens
      // stale means its next foreground request refreshes with a now-revoked token → forced logout.
      setTokens(t.accessToken, t.refreshToken);
      res = await send(t.accessToken);
    }
  }
  void res;
}

// Today's record, fetched headlessly (same cold-start-safe auth as postPunch). null = couldn't
// read (offline / no session) — callers must treat that as "unknown", not "no punches".
async function fetchTodayHeadless(): Promise<{ inTime: string | null; outTime: string | null } | null> {
  try {
    const session = await loadSession();
    if (!session) return null;
    const res = await fetch(`${apiBase()}/api/attendance/me`, { headers: { Authorization: `Bearer ${session.access}` } });
    if (!res.ok) return null;
    return (await res.json()) as { inTime: string | null; outTime: string | null };
  } catch { return null; }
}

// Armed regions cached for the headless Exit verification (AsyncStorage — survives app kills).
const REGIONS_KEY = 'kb360-geofence-regions';
async function readCachedRegions(): Promise<ArmedRegion[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AS = (require('@react-native-async-storage/async-storage') as typeof import('@react-native-async-storage/async-storage')).default;
    return JSON.parse((await AS.getItem(REGIONS_KEY)) ?? '[]') as ArmedRegion[];
  } catch {
    return [];
  }
}
async function writeCachedRegions(regions: ArmedRegion[]): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AS = (require('@react-native-async-storage/async-storage') as typeof import('@react-native-async-storage/async-storage')).default;
    await AS.setItem(REGIONS_KEY, JSON.stringify(regions));
  } catch { /* best-effort */ }
}

let registered = false;
// Register the headless geofence task. MUST run at module load (cold start) so the OS can deliver
// Enter/Exit events when the app is killed. No-op in Expo Go.
function ensureTaskRegistered(): void {
  if (registered || isRunningInExpoGo()) return;
  const Location = loc();
  task().defineTask(GEOFENCE_TASK, async ({ data, error }: TaskManagerModuleT.TaskManagerTaskBody<{ eventType: LocationModuleT.LocationGeofencingEventType; region?: LocationModuleT.LocationRegion }>) => {
    if (error || !data) return;
    const { eventType, region } = data;
    // Prefer a fresh fix; fall back to the region centre (the OS already confirmed we're inside it).
    let coords: { lat: number; lng: number } | null = region ? { lat: region.latitude, lng: region.longitude } : null;
    let fix: { coords: { lat: number; lng: number }; accuracy: number | null } | null = null;
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      fix = { coords, accuracy: pos.coords.accuracy ?? null };
    } catch { /* keep region centre */ }
    try {
      if (eventType === Location.GeofencingEventType.Enter) {
        // Background Enter may only OPEN a fresh day — never re-open a closed one. A returning
        // GPS fix after a (possibly false) exit used to re-check-in silently, which let the next
        // noise blip stamp a new, later check-out: rolling bogus punch times while the person sat
        // at their desk. If today already has any check-in (open or closed), leave it alone; if
        // the record can't be read, do nothing — the foreground reconciles on next open.
        const today = await fetchTodayHeadless();
        if (!today || today.inTime) return;
        await postPunch('check-in', coords);
      } else if (eventType === Location.GeofencingEventType.Exit) {
        // The OS fires Exit on indoor GPS drift. Re-verify with the fresh fix against the armed
        // regions — only a confirmed, accurate, outside-the-buffer fix may close the day. The
        // server re-checks too (source:'geofence'), so a false negative here is still caught.
        if (confirmGeofenceExit(fix, await readCachedRegions())) await postPunch('check-out', coords);
      }
    } catch { /* best-effort */ }
  });
  registered = true;
}

// Fetch office regions and (re)arm OS geofencing. Never REQUESTS permissions — callers decide
// whether to prompt (foreground sync) or only proceed if already granted (headless refresh).
async function armOfficeRegions(): Promise<void> {
  const Location = loc();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getOffices } = require('../api/attendance') as typeof import('../api/attendance');
  const offices = await getOffices();
  const regions: LocationModuleT.LocationRegion[] = offices
    .filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lng))
    .map((o) => ({
      identifier: o.id, // unique per office (a branch can have several)
      latitude: o.lat,
      longitude: o.lng,
      radius: Math.max(o.radius ?? 100, 100), // OS region monitoring is unreliable below ~100 m
      notifyOnEnter: true,
      notifyOnExit: true,
    }));
  const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  if (!regions.length) { if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK); await writeCachedRegions([]); return; }
  await Location.startGeofencingAsync(GEOFENCE_TASK, regions); // replaces any existing region set
  // Cache the armed regions so the headless Exit handler can re-verify a fix against them.
  await writeCachedRegions(regions.map((r) => ({ lat: r.latitude, lng: r.longitude, radius: r.radius ?? 100 })));
}

// Periodic headless refresh (survives reboots on Android via startOnBoot). Only runs when the
// user is signed in and "Always" location is ALREADY granted — a background task must never prompt.
// Beyond re-arming regions, it RECONCILES missed punches: the OS Enter/Exit events fire exactly
// once at the fence boundary, so a punch that was lost (Doze/OEM battery saver swallowed the
// event, reboot cleared the fences, network hiccup) or rejected (strict Wi-Fi rule on check-in;
// accuracy bar on check-out) would otherwise stand until the app is opened. Here: no check-in
// today + fix inside a region → punch in; day open + verified fix outside → punch out.
let refreshRegistered = false;
function ensureRefreshTaskRegistered(): void {
  if (refreshRegistered || isRunningInExpoGo()) return;
  try {
    task().defineTask(GEOFENCE_REFRESH_TASK, async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const BackgroundFetch = require('expo-background-fetch') as typeof import('expo-background-fetch');
      try {
        const session = await loadSession();
        if (!session) return BackgroundFetch.BackgroundFetchResult.NoData;
        const bg = await loc().getBackgroundPermissionsAsync();
        if (bg.status !== 'granted') return BackgroundFetch.BackgroundFetchResult.NoData;
        await armOfficeRegions();
        // Punch reconcile — the OS Enter/Exit events fire exactly ONCE at the boundary, so a lost
        // or rejected punch would otherwise stand until the app is opened. Both directions:
        //   no check-in today + fix INSIDE a region → check in (never re-opens a closed day);
        //   day still open + accurate fix beyond every fence → check out (confirmGeofenceExit;
        //   the server re-verifies via its drift guard).
        // An unreadable record means do nothing; a fix is taken only when a punch could result.
        const today = await fetchTodayHeadless();
        const needIn = !!today && !today.inTime;
        const dayOpen = !!today && !!today.inTime && !today.outTime;
        if (needIn || dayOpen) {
          let fix: { coords: { lat: number; lng: number }; accuracy: number | null } | null = null;
          try {
            const pos = await loc().getCurrentPositionAsync({ accuracy: loc().Accuracy.High });
            fix = { coords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, accuracy: pos.coords.accuracy ?? null };
          } catch { /* no fix → no punch */ }
          const regions = await readCachedRegions();
          if (needIn && fix && confirmGeofenceEntry(fix, regions)) await postPunch('check-in', fix.coords);
          else if (dayOpen && fix && confirmGeofenceExit(fix, regions)) await postPunch('check-out', fix.coords);
        }
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch {
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
    refreshRegistered = true; // defineTask overwrites, but there's no need to redefine every sync
  } catch { /* task manager unavailable */ }
}

async function scheduleRefreshTask(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BackgroundFetch = require('expo-background-fetch') as typeof import('expo-background-fetch');
  await BackgroundFetch.registerTaskAsync(GEOFENCE_REFRESH_TASK, {
    minimumInterval: 15 * 60, // Android WorkManager floor; this is the arrival-heal cadence, so a missed Enter still checks in within ~15 min
    stopOnTerminate: false, // keep running after the app is swiped away (Android)
    startOnBoot: true, // re-arm geofences after a phone restart without opening the app
  }).catch(() => undefined);
}

// The app can't show the OS "Allow all the time" dialog on Android 11+ — the system forces a
// Settings visit — so the UI needs to know the state to guide the user there.
export type BackgroundLocationState = 'granted' | 'denied' | 'undetermined' | 'unavailable';
export async function getBackgroundLocationState(): Promise<BackgroundLocationState> {
  if (isRunningInExpoGo()) return 'unavailable';
  try {
    const bg = await loc().getBackgroundPermissionsAsync();
    if (bg.status === 'granted') return 'granted';
    return bg.canAskAgain === false ? 'denied' : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

// Exempt (untracked) accounts: the server rejects every punch, so armed geofences are pure
// battery drain + server noise (each OS Enter/Exit fires a doomed punch). Stop the regions and
// the hourly healing task entirely.
export async function disarmAttendanceGeofencing(): Promise<void> {
  if (isRunningInExpoGo()) return;
  try {
    const Location = loc();
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
    await writeCachedRegions([]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BackgroundFetch = require('expo-background-fetch') as typeof import('expo-background-fetch');
    await BackgroundFetch.unregisterTaskAsync(GEOFENCE_REFRESH_TASK).catch(() => undefined);
  } catch { /* best-effort */ }
}

// Start (or refresh) OS geofencing for the signed-in user's offices. Requires "Always" location.
// Safe to call repeatedly (sign-in, app foreground, after an admin edits office coordinates).
//
// NEVER requests permissions — checks only. This path runs from AppState 'active' handlers, and a
// permission REQUEST launches the (transparent, auto-granting) system permission activity, which
// pauses/resumes MainActivity and fires AppState 'active' again → a self-sustaining request loop
// (measured at ~24 iterations/second on Samsung/Android 16: 202 permission-activity launches in
// 8.5s, each re-rendering the app and leaking GPS registrations until the process hit 1.3GB and
// froze). Prompting lives ONLY in the explicit permission/consent screens. The 60s re-entry guard
// is belt-and-braces: even if a future edit re-introduces an activity round-trip here, the
// AppState echo lands inside the guard window and the loop cannot close.
let lastSync = 0;
export async function syncAttendanceGeofencing(): Promise<void> {
  if (isRunningInExpoGo()) return;
  if (Date.now() - lastSync < 60_000) return;
  lastSync = Date.now();
  try {
    ensureTaskRegistered();
    ensureRefreshTaskRegistered();
    const Location = loc();
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return;
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return; // "Always" not granted — background auto-punch can't run
    await armOfficeRegions();
    await scheduleRefreshTask(); // reboot/eviction healing once everything is armed
  } catch { /* geofencing unavailable (Expo Go / perms / no native module) — silently skip */ }
}

export async function stopAttendanceGeofencing(): Promise<void> {
  if (isRunningInExpoGo()) return;
  try {
    const Location = loc();
    const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
    if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK);
  } catch { /* no-op */ }
}

// Register the tasks as a side-effect of importing this module (index.js imports it before React
// mounts so the OS finds them on a cold background launch — including the post-reboot fetch).
ensureTaskRegistered();
ensureRefreshTaskRegistered();

import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import type * as LocationModuleT from 'expo-location';
import type * as TaskManagerModuleT from 'expo-task-manager';
import { loadSession, updateStoredTokens } from './storage/session';

// Background auto check-in via OS geofencing. When the signed-in user enters/leaves an office region,
// the OS wakes the app (even if killed) and we punch in/out. Lazy-required + Expo-Go-guarded exactly
// like the notifications service: TaskManager/background location aren't available in Expo Go, and a
// static import there crashes the app at boot. Needs a dev/standalone build + "Always" location.
//
// Reboot survival: Android CLEARS registered geofences on reboot and only re-arms them when the app
// next opens — so a periodic background-fetch task (startOnBoot) re-registers the office regions
// headlessly, keeping auto-punch alive even if the phone restarted overnight and the app was never
// reopened. iOS re-launches apps for region events natively, so this mainly matters on Android.
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
  const body = JSON.stringify({ method: 'auto', coords });
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
      res = await send(t.accessToken);
    }
  }
  void res;
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
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch { /* keep region centre */ }
    try {
      if (eventType === Location.GeofencingEventType.Enter) await postPunch('check-in', coords);
      else if (eventType === Location.GeofencingEventType.Exit) await postPunch('check-out', coords);
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
      radius: Math.max(o.radius ?? 150, 100), // OS region monitoring is unreliable below ~100 m
      notifyOnEnter: true,
      notifyOnExit: true,
    }));
  const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  if (!regions.length) { if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK); return; }
  await Location.startGeofencingAsync(GEOFENCE_TASK, regions); // replaces any existing region set
}

// Periodic headless refresh (survives reboots on Android via startOnBoot). Only re-arms when the
// user is signed in and "Always" location is ALREADY granted — a background task must never prompt.
function ensureRefreshTaskRegistered(): void {
  if (isRunningInExpoGo()) return;
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
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch {
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
  } catch { /* task manager unavailable */ }
}

async function scheduleRefreshTask(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BackgroundFetch = require('expo-background-fetch') as typeof import('expo-background-fetch');
  await BackgroundFetch.registerTaskAsync(GEOFENCE_REFRESH_TASK, {
    minimumInterval: 60 * 60, // hourly is plenty — this only heals reboots/OS evictions
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

// Start (or refresh) OS geofencing for the signed-in user's offices. Requires "Always" location.
// Safe to call repeatedly (sign-in, app foreground, after an admin edits office coordinates).
export async function syncAttendanceGeofencing(): Promise<void> {
  if (isRunningInExpoGo()) return;
  try {
    ensureTaskRegistered();
    ensureRefreshTaskRegistered();
    const Location = loc();
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return; // user declined "Always" — background auto-punch can't run
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

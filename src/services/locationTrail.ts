import { AppState } from 'react-native';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import type * as LocationModuleT from 'expo-location';
import type * as TaskManagerModuleT from 'expo-task-manager';
import { loadSession, updateStoredTokens } from './storage/session';
import { setTokens } from '../api/tokens';
import { hasTrailConsent } from './trailConsent';
import {
  shouldTrackTrail, pingFromFix, thinPings, appendToBuffer, shouldUploadNow, removeUploaded,
  TRAIL_BATCH_MAX, type TrailDayState, type TrailPing, type RawFix,
} from '../logic/locationTrail';

// Work-hours location trail (owner ask, 2026-10-05). From CHECK-IN to CHECK-OUT the phone streams
// accurate GPS fixes to the backend so HR/admin can see where on-duty staff are; nothing is
// collected outside an open attendance day.
//
// HOW IT RUNS. Background location ("Allow all the time") is mandatory to enter the app (owner
// decision 2026-10-05, logic/permissionGate), so the permission is always in hand here. The stream
// itself is a FOREGROUND SERVICE (expo-location startLocationUpdatesAsync with a `foregroundService`
// option): Android throttles plain background location to a few fixes an hour, while a foreground
// service keeps GPS-grade fixes flowing behind a permanent notification. iOS shows the blue
// status-bar indicator. Consequences, by design:
//   • the foreground service can only START with the app on screen (manual check-in, or opening
//     the app while the day is open). An AUTOMATIC check-in happens headlessly, so the trail then
//     starts in a reduced background mode and is upgraded the next time the app is opened
//     (startLocationTrail);
//   • if the OS kills it (force-stop, reboot, aggressive battery saver) it resumes the next time
//     the app is opened during the open day.
//
// CONSENT. The entry gate shows the background-location disclosure and records this account's
// "I agree" (services/trailConsent) before the app opens. The trail double-checks that record and
// never collects for an account that has not accepted it.
//
// THE SERVER DECIDES WHEN IT ENDS. Every upload answers `tracking`; `false` (day closed by a
// check-out on another device, by an admin, or the business day rolled over) stops the task
// headlessly. Lazy-required + Expo-Go-guarded exactly like backgroundAttendance.
export const LOCATION_TRAIL_TASK = 'kb360-location-trail';

const BUFFER_KEY = 'kb360-trail-buffer'; // TrailPing[] waiting for upload
const LAST_KEPT_KEY = 'kb360-trail-last-kept'; // last fix that survived thinning (may already be uploaded)
const LAST_UPLOAD_KEY = 'kb360-trail-last-upload'; // epoch ms of the last successful upload
const MODE_KEY = 'kb360-trail-mode'; // 'fgs' = running as a foreground service; 'bg' = started headlessly without one

type LocationModule = typeof LocationModuleT;
type TaskManagerModule = typeof TaskManagerModuleT;
type Storage = typeof import('@react-native-async-storage/async-storage').default;
let _loc: LocationModule | null = null;
let _task: TaskManagerModule | null = null;
let _as: Storage | null = null;
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
function store(): Storage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!_as) _as = (require('@react-native-async-storage/async-storage') as typeof import('@react-native-async-storage/async-storage')).default;
  return _as;
}

const apiBase = (): string => (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:4000';

// ── queue (AsyncStorage — survives the app being killed between fixes and upload) ──
// Every read-modify-write goes through one promise chain: the OS task and a foreground flush can
// overlap in the same JS runtime, and an interleaved write would silently lose fixes.
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}
async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await store().getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
const readBuffer = (): Promise<TrailPing[]> => readJson<TrailPing[]>(BUFFER_KEY, []);
const writeBuffer = (b: TrailPing[]): Promise<void> => store().setItem(BUFFER_KEY, JSON.stringify(b)).catch(() => undefined);
async function clearQueue(): Promise<void> {
  await store().multiRemove([BUFFER_KEY, LAST_KEPT_KEY, LAST_UPLOAD_KEY]).catch(() => undefined);
}

// ── upload ──
// Cold-start-safe POST: the OS may wake the app for a fix with no React tree and no in-memory
// token, so read the persisted session and refresh once on 401 (same recipe as the geofence punch).
// null = no session (signed out). Throws on network failure / timeout.
async function postHeadless(path: string, body: unknown): Promise<Response | null> {
  const session = await loadSession();
  if (!session) return null;
  const send = async (token: string): Promise<Response> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      return await fetch(`${apiBase()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }
  };
  let res = await send(session.access);
  if (res.status === 401) {
    const r = await fetch(`${apiBase()}/api/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refresh }),
    });
    if (r.ok) {
      const t = (await r.json()) as { accessToken: string; refreshToken: string };
      await updateStoredTokens(t.accessToken, t.refreshToken);
      setTokens(t.accessToken, t.refreshToken); // keep the live in-memory pair in step (rotation revokes the old one)
      res = await send(t.accessToken);
    }
  }
  return res;
}

let flushing = false;
// Send queued fixes. `force` ignores the batching thresholds and drains the whole queue (used when
// the trail stops, so the last stretch before a check-out is not left behind).
export async function flushTrailBuffer(force = false): Promise<void> {
  if (flushing || isRunningInExpoGo()) return;
  flushing = true;
  try {
    for (let round = 0; round < 10; round++) {
      const buffer = await readBuffer();
      if (!buffer.length) return;
      const lastUpload = Number(await store().getItem(LAST_UPLOAD_KEY).catch(() => null)) || 0;
      if (!force && !shouldUploadNow(buffer.length, lastUpload, Date.now())) return;
      const batch = buffer.slice(0, TRAIL_BATCH_MAX);
      const res = await postHeadless('/api/location/pings', { pings: batch });
      if (!res) { await stopUpdates(); await locked(clearQueue); return; } // signed out — nothing may be sent
      if (res.ok) {
        const out = (await res.json().catch(() => ({}))) as { tracking?: boolean };
        await locked(async () => writeBuffer(removeUploaded(await readBuffer(), batch)));
        await store().setItem(LAST_UPLOAD_KEY, String(Date.now())).catch(() => undefined);
        if (out.tracking === false) {
          // The day is closed on the server. Stop collecting; what is still queued was taken on
          // duty, so keep draining it (the server keeps only fixes up to the check-out).
          await stopUpdates();
          force = true;
          // The server may have just checked the person out from the trail — make the open
          // screens show it now instead of on the next app open.
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            void (require('./backgroundAttendance') as typeof import('./backgroundAttendance')).refreshAttendanceStore();
          } catch { /* cosmetic */ }
        }
        if (!force) return; // routine upload: one batch per wake-up
        continue;
      }
      // A 4xx other than auth / rate-limit means the server refused THIS batch for good — drop it
      // so one bad point cannot wedge the queue forever. Anything else is transient: keep and retry.
      if (res.status >= 400 && res.status < 500 && ![401, 403, 408, 429].includes(res.status)) {
        await locked(async () => writeBuffer(removeUploaded(await readBuffer(), batch)));
        continue;
      }
      return;
    }
  } catch { /* offline / timeout — the queue waits for the next fix or foreground */ }
  finally { flushing = false; }
}

// ── the OS task ──
let registered = false;
// MUST run at module load (index.js imports this file before React mounts) so the OS can deliver
// fixes to a relaunched, headless app. No-op in Expo Go.
function ensureTaskRegistered(): void {
  if (registered || isRunningInExpoGo()) return;
  try {
    task().defineTask(LOCATION_TRAIL_TASK, async ({ data, error }: TaskManagerModuleT.TaskManagerTaskBody<{ locations?: RawFix[] }>) => {
      if (error || !data?.locations?.length) return;
      try {
        const incoming = data.locations.map((l) => pingFromFix(l, 'bg')).filter((p): p is TrailPing => p !== null);
        await locked(async () => {
          const lastKept = await readJson<TrailPing | null>(LAST_KEPT_KEY, null);
          const kept = thinPings(lastKept, incoming);
          if (!kept.length) return;
          await writeBuffer(appendToBuffer(await readBuffer(), kept));
          await store().setItem(LAST_KEPT_KEY, JSON.stringify(kept[kept.length - 1])).catch(() => undefined);
        });
        await flushTrailBuffer();
      } catch { /* best-effort — the next fix retries */ }
    });
    registered = true;
  } catch { /* task manager unavailable */ }
}

async function isRunning(): Promise<boolean> {
  try { return await loc().hasStartedLocationUpdatesAsync(LOCATION_TRAIL_TASK); } catch { return false; }
}
async function stopUpdates(): Promise<void> {
  try { if (await isRunning()) await loc().stopLocationUpdatesAsync(LOCATION_TRAIL_TASK); } catch { /* no-op */ }
}

export type TrailStart = 'started' | 'already' | 'no-permission' | 'unavailable' | 'failed';

// Start streaming. NEVER requests a permission — the entry gate already holds it; if location was
// revoked we simply do not start (and the gate closes the app).
//
// Two modes, because Android only lets a foreground service start while the app is on screen:
//   'fgs' — app in the foreground (manual check-in, or the app is opened during an open day):
//           foreground service + permanent notification, GPS-grade fixes every few seconds.
//   'bg'  — started HEADLESSLY by an automatic check-in (the OS woke the app for the office
//           boundary; no screen). Plain background updates under "Allow all the time": the OS
//           delivers them only a few times an hour, which is enough for a coarse trail but not
//           for the server's trail-driven check-out — the OS exit event covers that. The next
//           time the app is opened it is UPGRADED to 'fgs' (stop + restart) below.
export async function startLocationTrail(): Promise<TrailStart> {
  if (isRunningInExpoGo()) return 'unavailable';
  try {
    ensureTaskRegistered();
    const Location = loc();
    if ((await Location.getForegroundPermissionsAsync()).status !== 'granted') return 'no-permission';
    const onScreen = AppState.currentState === 'active';
    const running = await isRunning();
    const mode = await store().getItem(MODE_KEY).catch(() => null);
    if (running && (mode !== 'bg' || !onScreen)) return 'already';
    if (running) await stopUpdates(); // headless start earlier, app now on screen → upgrade
    const base = {
      // "I want accurate location" — GPS-grade fixes (a few metres outdoors). The battery cost is
      // bounded by the working day; thinPings keeps the stored trail small.
      accuracy: Location.Accuracy.Highest,
      timeInterval: 15_000, // Android: at most one fix every 15 s
      distanceInterval: 0, // …even when standing still, so the heartbeat can prove the trail is alive
      deferredUpdatesInterval: 60_000, // in the background, wake JS at most once a minute with the batch
      deferredUpdatesDistance: 0,
      pausesUpdatesAutomatically: false, // iOS must not silently pause a person sitting at a desk
      activityType: Location.ActivityType.Other,
      showsBackgroundLocationIndicator: true, // iOS: the blue status-bar pill — tracking is never hidden
    };
    if (onScreen) {
      try {
        await Location.startLocationUpdatesAsync(LOCATION_TRAIL_TASK, {
          ...base,
          foregroundService: {
            // Android: the permanent notification that IS the foreground service. It stays for
            // exactly as long as location is being collected and disappears at check-out.
            notificationTitle: 'KBiz 360 · On duty',
            notificationBody: 'Sharing your work location with your company until you check out.',
            notificationColor: '#128C7E',
            killServiceOnDestroy: false, // keep streaming when the app is swiped away
          },
        });
        await store().setItem(MODE_KEY, 'fgs').catch(() => undefined);
        return 'started';
      } catch { /* fall through to the headless mode */ }
    }
    if ((await Location.getBackgroundPermissionsAsync()).status !== 'granted') return 'no-permission';
    await Location.startLocationUpdatesAsync(LOCATION_TRAIL_TASK, base);
    await store().setItem(MODE_KEY, 'bg').catch(() => undefined);
    return 'started';
  } catch {
    return 'failed';
  }
}

// Stop streaming and send whatever is still queued (the server keeps the fixes taken on duty).
export async function stopLocationTrail(): Promise<void> {
  if (isRunningInExpoGo()) return;
  await stopUpdates();
  await flushTrailBuffer(true);
}

// Bring the OS task in line with today's attendance record: day open → running (once consent is
// in hand); anything else → stopped and drained. Idempotent — call it wherever the record is read.
// Calls are QUEUED, not dropped: the app-open reconcile and the Attendance screen both sync within
// the same second, and a check-out's stop must never be lost behind an in-flight start.
let syncChain: Promise<void> = Promise.resolve();
export function syncLocationTrail(me: TrailDayState): Promise<void> {
  if (isRunningInExpoGo()) return Promise.resolve();
  const run = async (): Promise<void> => {
    try {
      if (!shouldTrackTrail(me)) { await stopLocationTrail(); return; }
      const session = await loadSession();
      if (!session) return;
      if (!(await hasTrailConsent(session.myUserId))) { await stopUpdates(); return; }
      await startLocationTrail();
      void flushTrailBuffer(); // app is open — good moment to send anything that queued offline
    } catch { /* best-effort — the next sync retries */ }
  };
  syncChain = syncChain.then(run, run);
  return syncChain;
}

// Sign-out: stop collecting and discard the queue (it belongs to the account that just left).
export async function resetLocationTrail(): Promise<void> {
  if (isRunningInExpoGo()) return;
  await stopUpdates();
  await locked(clearQueue);
}

// Register the task as a side-effect of importing this module (see index.js).
ensureTaskRegistered();

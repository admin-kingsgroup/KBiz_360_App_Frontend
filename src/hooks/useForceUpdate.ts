import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { getAppVersionPolicy, type AppVersionPolicy } from '../api/appVersion';
import { isUpdateRequired } from '../logic/appVersion';

// Force update. Asks the backend for the oldest version allowed to run on every app open and on
// every return to the foreground (throttled), so a minimum raised while the app sits in the
// background still catches it. Fails OPEN: offline or a server error never locks anyone out.
// Once an update is required it stays required for this run — a later failed check cannot unlock.
const CHECK_EVERY_MS = 5 * 60_000;

// The installed version. runtimeVersion follows appVersion (app.json), so an OTA update always
// carries the same version as the installed build.
export const currentAppVersion: string | null = Constants.expoConfig?.version ?? null;

export function useForceUpdate(): AppVersionPolicy | null {
  const [required, setRequired] = useState<AppVersionPolicy | null>(null);
  const lastCheck = useRef(0);
  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
    const platform = Platform.OS;
    let alive = true;
    const check = async (): Promise<void> => {
      const now = Date.now();
      if (now - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = now;
      try {
        const policy = await getAppVersionPolicy(platform);
        if (alive && isUpdateRequired(currentAppVersion, policy.minVersion)) setRequired(policy);
      } catch {
        // Offline or a server hiccup — let the user in; the next foreground tries again.
      }
    };
    void check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void check(); });
    return () => { alive = false; sub.remove(); };
  }, []);
  return required;
}

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

// Foreground OTA check. expo-updates' default only looks for an update at COLD launch and applies
// it at the NEXT cold launch — but Android resumes the same process for days, so a published update
// could sit unseen until a reboot. This hook checks on mount and on every background→foreground
// transition (throttled), downloads in the background, and reports when a fetched update is ready;
// `apply` swaps to it in place via Updates.reloadAsync().
const CHECK_EVERY_MS = 5 * 60_000;

export function useOtaUpdate(): { updateReady: boolean; applyUpdate: () => void } {
  const [updateReady, setUpdateReady] = useState(false);
  const lastCheck = useRef(0);
  useEffect(() => {
    let alive = true;
    const check = async (): Promise<void> => {
      // Dev client and Expo Go run without the updates module — isEnabled is false there.
      if (__DEV__ || !Updates.isEnabled) return;
      const now = Date.now();
      if (now - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = now;
      try {
        const res = await Updates.checkForUpdateAsync();
        if (!alive || !res.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (alive && fetched.isNew) setUpdateReady(true);
      } catch {
        // Offline or a server hiccup — the next foreground tries again.
      }
    };
    void check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void check(); });
    return () => { alive = false; sub.remove(); };
  }, []);
  return { updateReady, applyUpdate: () => { void Updates.reloadAsync(); } };
}

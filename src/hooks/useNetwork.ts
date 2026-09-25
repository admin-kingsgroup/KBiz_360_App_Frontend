import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

// Tracks connectivity. offline = device has NO network connection at all. Client-only; the app's
// data is local/mock today, so offline is informational (and ready for a future sync layer).
//
// Deliberately IGNORES netinfo's isInternetReachable: the attendance SSID reads use
// NetInfo.fetch('wifi') (interface-scoped), and netinfo feeds every such fetch into its global
// reachability singleton with isInternetReachable computed AGAINST THAT INTERFACE — false
// whenever the active network is cellular, even with perfect mobile internet. That poisoned flag
// PERSISTS until the next connectivity change, so the "You're offline" banner sat on screen for
// anyone on mobile data. isConnected alone is interface-agnostic and immune.
//
// OFFLINE IS DEBOUNCED (8s), online is instant — network handovers (Wi-Fi ↔ mobile data) drop
// isConnected for a beat, and the banner mount/unmount is a full-app native relayout. A REAL
// outage still shows within 8s.
const OFFLINE_DEBOUNCE_MS = 8000;

export function useNetwork() {
  const [offline, setOffline] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      const reachable = s.isConnected !== false; // null (unknown yet) counts as online
      if (reachable) {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        setOffline(false); // same-value sets are free — React bails out
      } else if (!timer.current) {
        timer.current = setTimeout(() => { timer.current = null; setOffline(true); }, OFFLINE_DEBOUNCE_MS);
      }
    });
    return () => { unsub(); if (timer.current) clearTimeout(timer.current); };
  }, []);
  return { offline };
}

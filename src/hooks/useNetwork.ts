import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

// Tracks connectivity. offline = device reports no usable internet. Client-only; the app's data
// is local/mock today, so offline is informational (and ready for a future sync layer).
export function useNetwork() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      const reachable = s.isConnected && (s.isInternetReachable ?? true);
      setOffline(!reachable);
    });
    return () => unsub();
  }, []);
  return { offline };
}

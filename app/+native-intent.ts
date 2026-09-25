import { getShareExtensionKey } from 'expo-share-intent';

// iOS share extension relaunches the app with `kbiz360://dataUrl=kbiz360ShareKey?nonce=…`.
// That URL is a hand-off token, not a route — without this hook expo-router tries to match
// it and flashes "Unmatched Route" before GateController pushes /share. Swallow it here;
// ShareIntentProvider still receives the payload and the gate effect in _layout routes it.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) return '/';
    return path;
  } catch {
    return '/';
  }
}

import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Lightweight crash reporting to our own backend (POST /api/client-errors) — no third-party
// service. Two paths:
//  • ErrorBoundary catches render errors → report immediately (app survives).
//  • Fatal JS errors kill the app before a network call can finish → stash the report in
//    AsyncStorage and flush it on the NEXT launch (flushStoredCrash from the root layout).
const apiBase = (): string => (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:4000';
const PENDING_KEY = 'kb360_pending_crash';

interface CrashReport {
  message: string;
  stack?: string;
  component?: string;
  fatal?: boolean;
}

const payload = (r: CrashReport): Record<string, unknown> => ({
  ...r,
  platform: Platform.OS,
  appVersion: Constants.expoConfig?.version ?? 'unknown',
});

export function reportError(error: unknown, component?: string, fatal = false): void {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const stack = error instanceof Error ? (error.stack ?? '').slice(0, 4000) : undefined;
  void fetch(`${apiBase()}/api/client-errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload({ message: message.slice(0, 500), stack, component: component?.slice(0, 300), fatal })),
  }).catch(() => undefined); // reporting must never throw
}

// Wrap the global fatal handler: persist the crash, then let RN's handler run (red screen in
// dev, process death in prod). Call once from the root layout.
let wrapped = false;
export function installGlobalCrashHandler(): void {
  if (wrapped) return;
  wrapped = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const EU = (globalThis as any).ErrorUtils;
  if (!EU?.getGlobalHandler) return;
  const prior = EU.getGlobalHandler();
  EU.setGlobalHandler(async (error: unknown, isFatal?: boolean) => {
    try {
      if (isFatal) {
        const AS = (await import('@react-native-async-storage/async-storage')).default;
        const message = error instanceof Error ? error.message : String(error ?? 'Unknown fatal error');
        const stack = error instanceof Error ? (error.stack ?? '').slice(0, 4000) : undefined;
        await AS.setItem(PENDING_KEY, JSON.stringify({ message: message.slice(0, 500), stack, fatal: true }));
      } else {
        reportError(error, undefined, false);
      }
    } catch { /* never block the handler */ }
    prior?.(error, isFatal);
  });
}

// Send any crash stashed by a previous fatal exit. Call once at app boot.
export async function flushStoredCrash(): Promise<void> {
  try {
    const AS = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AS.getItem(PENDING_KEY);
    if (!raw) return;
    await AS.removeItem(PENDING_KEY);
    const r = JSON.parse(raw) as CrashReport;
    await fetch(`${apiBase()}/api/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(r)),
    });
  } catch { /* best-effort */ }
}

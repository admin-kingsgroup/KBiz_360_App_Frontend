import { useSyncExternalStore } from 'react';
import type { LocationPurpose } from '../logic/locationDisclosure';

// Tiny external store that lets ANY code path await the user's answer on the location disclosure
// modal. The modal itself (components/LocationDisclosureHost) is mounted ONCE in the root layout and
// renders whatever is pending here; callers never render UI themselves. Play requires the user's
// affirmative tap BEFORE the OS dialog, so the promise resolves only from the modal's two buttons
// (or a hardware back = "Not now") — never on a timer.

interface Pending { purpose: LocationPurpose; resolve: (agreed: boolean) => void }

let pending: Pending | null = null;
let hostMounted = false;
const listeners = new Set<() => void>();
const emit = (): void => { listeners.forEach((l) => l()); };

export function askLocationDisclosure(purpose: LocationPurpose): Promise<boolean> {
  if (!hostMounted) {
    // No modal to show (host not mounted yet / tests). Treat as declined rather than silently
    // prompting: an OS dialog without the disclosure is exactly the policy violation.
    if (__DEV__) console.warn('[locationDisclosure] host not mounted — request treated as declined');
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    // A second ask while one is open supersedes it; the first resolves as declined.
    if (pending) pending.resolve(false);
    pending = { purpose, resolve };
    emit();
  });
}

export function answerLocationDisclosure(agreed: boolean): void {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(agreed);
}

export function setLocationDisclosureHostMounted(mounted: boolean): void {
  hostMounted = mounted;
  if (!mounted && pending) answerLocationDisclosure(false);
}

const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = (): LocationPurpose | null => pending?.purpose ?? null;

// Purpose of the disclosure currently awaiting an answer, or null when nothing is pending.
export function usePendingLocationDisclosure(): LocationPurpose | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

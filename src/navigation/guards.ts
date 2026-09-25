import { useAuthStore } from '../store/authStore';
import { useAttendanceStore } from '../store/attendanceStore';

export type GateTarget = 'login' | 'permissions' | 'app';

// Pure decision function — easy to unit test, no router/UI dependency.
// Mirrors the source flow: signed-out -> login; signed-in but perms ungranted -> permissions; else app.
export function resolveGate(input: {
  isAuthenticated: boolean;
  allPermsGranted: boolean;
}): GateTarget {
  if (!input.isAuthenticated) return 'login';
  if (!input.allPermsGranted) return 'permissions';
  return 'app';
}

export function allPermsGranted(p: { location: boolean; notifications: boolean; network: boolean }): boolean {
  return p.location && p.notifications && p.network;
}

// Hook wrapper that reads the live stores. "View as" is intentionally NOT consulted here —
// it is access-overlay store state, never a routing input (preserves source behavior).
export function useGate(): GateTarget {
  const isAuthenticated = useAuthStore((s) => s.status === 'signedIn');
  const perms = useAttendanceStore((s) => s.perms);
  return resolveGate({ isAuthenticated, allPermsGranted: allPermsGranted(perms) });
}

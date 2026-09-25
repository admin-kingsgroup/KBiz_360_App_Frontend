import { useAuthStore } from '../store/authStore';
import { useAccessStore } from '../store/accessStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { resolveGate, allPermsGranted } from '../navigation/guards';
import { adminUsers } from '../data/users';

const gateNow = () =>
  resolveGate({
    isAuthenticated: useAuthStore.getState().status === 'signedIn',
    allPermsGranted: allPermsGranted(useAttendanceStore.getState().perms),
  });

describe('Phase 3 — auth + permission flow state transitions', () => {
  beforeEach(() => {
    useAuthStore.getState().signOut();
    useAttendanceStore.getState().hydrate({ perms: { location: false, notifications: false, network: false }, consent: false });
  });

  it('signed out → gate routes to login', () => {
    expect(gateNow()).toBe('login');
  });

  it('signed in (Afshin) + perms pending → gate routes to permissions; authStore + accessStore updated', () => {
    const afshin = adminUsers.find((u) => u.id === 'a1')!;
    useAccessStore.getState().setUser(afshin);
    useAuthStore.getState().signIn(afshin);
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(useAccessStore.getState().access()!.isSuper).toBe(true);
    expect(gateNow()).toBe('permissions');
  });

  it('all perms granted → gate routes to app', () => {
    useAuthStore.getState().signIn(adminUsers[0]);
    const set = useAttendanceStore.getState().setPerm;
    set('location', true); set('network', true); set('notifications', true);
    expect(gateNow()).toBe('app');
  });

  it('previously-granted perms (hydrated) bypass gate on a fresh sign-in', () => {
    // simulate restart: perms restored from storage, then user signs in
    useAttendanceStore.getState().hydrate({ perms: { location: true, notifications: true, network: true } });
    useAuthStore.getState().signIn(adminUsers[0]);
    expect(gateNow()).toBe('app'); // permission gate skipped
  });
});

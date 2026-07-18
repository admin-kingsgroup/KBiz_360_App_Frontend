import { locationPermSatisfied } from '../logic/permissionGate';

// "Allow all the time" gate policy: only a real background grant (or an environment where the
// permission cannot exist, e.g. Expo Go) satisfies the gate. "While using the app" must NOT pass —
// that is exactly the state that silently breaks background attendance.
describe('locationPermSatisfied', () => {
  it('passes on a real background grant', () => {
    expect(locationPermSatisfied('granted')).toBe(true);
  });

  it('passes when unenforceable (Expo Go / no native module)', () => {
    expect(locationPermSatisfied('unavailable')).toBe(true);
  });

  it('blocks foreground-only ("While using the app")', () => {
    expect(locationPermSatisfied('foreground-only')).toBe(false);
  });

  it('blocks a full deny', () => {
    expect(locationPermSatisfied('denied')).toBe(false);
  });
});

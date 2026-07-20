import { locationPermSatisfied } from '../logic/permissionGate';

// Location gate policy: any real location grant satisfies the gate — "Allow all the time" OR
// "While using the app". Background is optional (it only adds auto-punch while the app is closed).
// Only a FULL deny (location off) blocks entry. 'unavailable' (Expo Go / no native module) passes.
describe('locationPermSatisfied', () => {
  it('passes on a real background grant ("Allow all the time")', () => {
    expect(locationPermSatisfied('granted')).toBe(true);
  });

  it('passes on foreground-only ("While using the app")', () => {
    expect(locationPermSatisfied('foreground-only')).toBe(true);
  });

  it('passes when unenforceable (Expo Go / no native module)', () => {
    expect(locationPermSatisfied('unavailable')).toBe(true);
  });

  it('blocks a full deny (location off)', () => {
    expect(locationPermSatisfied('denied')).toBe(false);
  });
});

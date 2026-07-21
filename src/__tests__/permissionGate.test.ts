import { locationPermSatisfied } from '../logic/permissionGate';

// Location gate policy: background location ("Allow all the time") is STRICTLY required — the app
// will not open without it (background geofence attendance is the core guarantee). Foreground-only
// ("While using the app") and a full deny both block entry. 'unavailable' (Expo Go / no native
// module) passes because it cannot be enforced there.
describe('locationPermSatisfied', () => {
  it('passes on a real background grant ("Allow all the time")', () => {
    expect(locationPermSatisfied('granted')).toBe(true);
  });

  it('blocks foreground-only ("While using the app") — background is strictly required', () => {
    expect(locationPermSatisfied('foreground-only')).toBe(false);
  });

  it('passes when unenforceable (Expo Go / no native module)', () => {
    expect(locationPermSatisfied('unavailable')).toBe(true);
  });

  it('blocks a full deny (location off)', () => {
    expect(locationPermSatisfied('denied')).toBe(false);
  });
});

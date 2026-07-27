import { locationPermSatisfied } from '../logic/permissionGate';

// Location gate policy: entering the app requires only FOREGROUND location ("While using the app").
// Background location ("Allow all the time") is an attendance enhancement, not an entry gate, so
// 'foreground-only' passes. Only a full deny ('denied', location off) blocks entry. 'unavailable'
// (Expo Go / no native module) passes because it cannot be enforced there.
describe('locationPermSatisfied', () => {
  it('passes on a full background grant ("Allow all the time")', () => {
    expect(locationPermSatisfied('granted')).toBe(true);
  });

  it('passes on foreground-only ("While using the app") — background is an enhancement, not required to enter', () => {
    expect(locationPermSatisfied('foreground-only')).toBe(true);
  });

  it('passes when unenforceable (Expo Go / no native module)', () => {
    expect(locationPermSatisfied('unavailable')).toBe(true);
  });

  it('blocks a full deny (location off)', () => {
    expect(locationPermSatisfied('denied')).toBe(false);
  });
});

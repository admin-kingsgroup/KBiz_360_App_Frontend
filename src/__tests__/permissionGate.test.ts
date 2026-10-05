import { locationPermSatisfied, locationGateSatisfied } from '../logic/permissionGate';

// Location gate policy (owner decision, 2026-10-05): the app opens only with background location
// ("Allow all the time" / "Always") AND the background-location disclosure accepted by this
// account. 'unavailable' (Expo Go / no native module) passes because it cannot be enforced there.
describe('locationPermSatisfied (OS grant)', () => {
  it('passes on a full background grant ("Allow all the time")', () => {
    expect(locationPermSatisfied('granted')).toBe(true);
  });
  it('BLOCKS foreground-only ("While using the app") — background location is mandatory', () => {
    expect(locationPermSatisfied('foreground-only')).toBe(false);
  });
  it('passes when unenforceable (Expo Go / no native module)', () => {
    expect(locationPermSatisfied('unavailable')).toBe(true);
  });
  it('blocks a full deny (location off)', () => {
    expect(locationPermSatisfied('denied')).toBe(false);
  });
});

describe('locationGateSatisfied (OS grant + disclosure accepted)', () => {
  it('opens only with BOTH the background grant and the accepted disclosure', () => {
    expect(locationGateSatisfied('granted', true)).toBe(true);
  });
  it('a grant without the disclosure does not open the app (legacy / set by hand in Settings)', () => {
    expect(locationGateSatisfied('granted', false)).toBe(false);
  });
  it('the disclosure without the grant does not open the app', () => {
    expect(locationGateSatisfied('foreground-only', true)).toBe(false);
    expect(locationGateSatisfied('denied', true)).toBe(false);
  });
  it('unenforceable environments pass regardless', () => {
    expect(locationGateSatisfied('unavailable', false)).toBe(true);
  });
});

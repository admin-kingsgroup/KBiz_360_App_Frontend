import { LOCATION_DISCLOSURE, locationFlowStep, requestResultFrom, toGateStatus } from '../logic/locationDisclosure';

// Google Play "Prominent Disclosure and Consent" — the 1.1.0 update was rejected because the OS
// location dialog appeared without an in-app disclosure in front of it. These tests pin the flow
// decision and the copy requirements the policy checks for.
describe('locationFlowStep', () => {
  it('needs nothing when already granted — no disclosure, no dialog', () => {
    expect(locationFlowStep(true, true)).toBe('granted');
    expect(locationFlowStep(true, false)).toBe('granted');
  });

  it('shows the disclosure before a first / re-askable prompt', () => {
    expect(locationFlowStep(false, true)).toBe('disclose');
    expect(locationFlowStep(false, undefined)).toBe('disclose');
  });

  it('routes to Settings when the OS will not prompt again (hard deny)', () => {
    expect(locationFlowStep(false, false)).toBe('blocked');
  });
});

describe('requestResultFrom', () => {
  it('maps the OS answer', () => {
    expect(requestResultFrom('granted', true)).toBe('granted');
    expect(requestResultFrom('denied', true)).toBe('denied');
    expect(requestResultFrom('denied', false)).toBe('blocked');
    expect(requestResultFrom('undetermined', undefined)).toBe('denied');
  });
});

describe('toGateStatus', () => {
  it('a grant satisfies the entry gate as foreground-only (the only permission Android declares)', () => {
    expect(toGateStatus('granted')).toBe('foreground-only');
  });
  it('unavailable stays unavailable (Expo Go passes the gate)', () => {
    expect(toGateStatus('unavailable')).toBe('unavailable');
  });
  it('every other outcome blocks the gate', () => {
    expect(toGateStatus('denied')).toBe('denied');
    expect(toGateStatus('blocked')).toBe('denied');
    expect(toGateStatus('declined')).toBe('denied');
  });
});

describe('disclosure copy (policy checklist)', () => {
  const purposes = Object.keys(LOCATION_DISCLOSURE) as (keyof typeof LOCATION_DISCLOSURE)[];

  it('names the data type and the app on every purpose', () => {
    for (const p of purposes) {
      const c = LOCATION_DISCLOSURE[p];
      expect(c.body.toLowerCase()).toContain('location');
      expect(c.body).toContain('KBiz 360');
      expect(c.points.length).toBeGreaterThan(0);
    }
  });

  it('the foreground-only purposes never claim background collection', () => {
    for (const p of purposes.filter((x) => x !== 'trail')) {
      const all = [LOCATION_DISCLOSURE[p].body, ...LOCATION_DISCLOSURE[p].points].join(' ').toLowerCase();
      expect(all).not.toMatch(/all the time|even when the app is closed/);
    }
  });

  // The work-hours trail DOES collect in the background (foreground service, check-in → check-out).
  // Its disclosure must say so in the words the policy looks for, bound it to the working day,
  // say who sees it, and not promise an OS dialog that never comes.
  it('trail (entry gate) copy discloses background collection, its bounds and its audience', () => {
    const c = LOCATION_DISCLOSURE.trail;
    const all = [c.body, ...c.points].join(' ');
    expect(c.body).toMatch(/in the background/);
    expect(c.body).toMatch(/even when the app is closed or not in use/);
    expect(all).toMatch(/check in/i);
    expect(all).toMatch(/check out/i);
    expect(all).toMatch(/notification/i);
    expect(all).toMatch(/HR/);
    // It is the entry gate's disclosure: it must tell the person which OS option to pick and
    // that the app does not open without it.
    expect(c.footer).toMatch(/Allow all the time/);
    expect(c.footer).toMatch(/cannot be opened without it/);
  });

  it('attendance copy no longer denies background tracking outright (the trail exists) but points to its own disclosure', () => {
    const all = [LOCATION_DISCLOSURE.attendance.body, ...LOCATION_DISCLOSURE.attendance.points].join(' ');
    expect(all).not.toMatch(/nothing is tracked in the background/);
    expect(all).toMatch(/explained separately/);
  });

  it('attendance copy states the purpose and who it is shared with', () => {
    const all = [LOCATION_DISCLOSURE.attendance.body, ...LOCATION_DISCLOSURE.attendance.points].join(' ');
    expect(all).toMatch(/check in|check-in/i);
    expect(all).toMatch(/HR/);
    expect(all).toMatch(/only while the app is open/);
  });
});

import { firstNameOf, greetingFor, spinAngleAt, splashModeFor, SPLASH_TIMING } from '../logic/splash';
import { useSplashStore } from '../store/splashStore';

describe('splashModeFor', () => {
  it('greets a restored session and sends everyone else to the login hand-off', () => {
    expect(splashModeFor(true)).toBe('returning');
    expect(splashModeFor(false)).toBe('welcome');
  });
});

describe('greetingFor', () => {
  it('splits the day at 5, 12 and 17', () => {
    expect(greetingFor(5)).toBe('Good morning');
    expect(greetingFor(11)).toBe('Good morning');
    expect(greetingFor(12)).toBe('Good afternoon');
    expect(greetingFor(16)).toBe('Good afternoon');
    expect(greetingFor(17)).toBe('Good evening');
    expect(greetingFor(23)).toBe('Good evening');
  });

  it('treats the small hours as evening, not morning', () => {
    expect(greetingFor(0)).toBe('Good evening');
    expect(greetingFor(4)).toBe('Good evening');
  });
});

describe('firstNameOf', () => {
  it('takes the first word of a display name', () => {
    expect(firstNameOf('Anubhav Maurya')).toBe('Anubhav');
    expect(firstNameOf('  Aamir   Khan ')).toBe('Aamir');
    expect(firstNameOf('Priya')).toBe('Priya');
  });

  it('returns an empty string rather than "undefined" when there is no name', () => {
    expect(firstNameOf('')).toBe('');
    expect(firstNameOf('   ')).toBe('');
    expect(firstNameOf(null)).toBe('');
    expect(firstNameOf(undefined)).toBe('');
  });
});

describe('spinAngleAt', () => {
  it('maps elapsed time onto one turn per period', () => {
    expect(spinAngleAt(0, 14000)).toBe(0);
    expect(spinAngleAt(3500, 14000)).toBe(90);
    expect(spinAngleAt(7000, 14000)).toBe(180);
  });

  it('wraps after a full turn', () => {
    expect(spinAngleAt(14000, 14000)).toBe(0);
    expect(spinAngleAt(17500, 14000)).toBe(90);
  });

  it('stays in [0, 360) for negative or bad input', () => {
    expect(spinAngleAt(-3500, 14000)).toBe(270);
    expect(spinAngleAt(Number.NaN, 14000)).toBe(0);
    expect(spinAngleAt(1000, 0)).toBe(0);
  });
});

describe('SPLASH_TIMING', () => {
  it('keeps a returning launch short and always ends before the failsafe', () => {
    const t = SPLASH_TIMING;
    const returning = t.intro - t.introOverlap + t.returning + t.exit;
    const welcome = t.intro - t.introOverlap + t.welcome + t.exit;
    expect(returning).toBeLessThanOrEqual(2400);
    expect(welcome).toBeLessThan(t.failsafe);
    expect(t.introOverlap).toBeLessThan(t.intro);
  });
});

describe('useSplashStore', () => {
  it('holds the login card back until the splash hands off, then stays released', () => {
    expect(useSplashStore.getState().handedOff).toBe(false);
    useSplashStore.getState().handOff();
    expect(useSplashStore.getState().handedOff).toBe(true);
    useSplashStore.getState().handOff(); // idempotent — a second call (failsafe, unmount) is harmless
    expect(useSplashStore.getState().handedOff).toBe(true);
  });
});

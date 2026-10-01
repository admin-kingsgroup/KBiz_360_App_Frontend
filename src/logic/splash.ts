// Launch splash: the decisions behind the animated splash (src/components/splash/AnimatedSplash),
// kept pure so they are tested (src/__tests__/splash.test.ts) without rendering a frame.
//
// One intro for everyone (the pinwheel fans open), then one of two endings:
//   - 'returning' — a restored session: the mark settles with a greeting below it (never the
//     user's name or picture inside the logo), then the splash zooms away into the app.
//   - 'welcome'   — no session: the wordmark writes itself in, then the whole hero glides up onto
//     the login screen's own hero and dissolves into it.

export type SplashMode = 'welcome' | 'returning';

/** Which ending plays, decided once the persisted session has been restored. */
export function splashModeFor(signedIn: boolean): SplashMode {
  return signedIn ? 'returning' : 'welcome';
}

// Timeline (ms). The intro overlaps the ending by INTRO_OVERLAP so the two read as one motion.
export const SPLASH_TIMING = {
  intro: 950,
  introOverlap: 150,
  welcome: 1500,
  returning: 1050,
  exit: 380,
  /** Reduced motion: no movement, the finished frame holds this long, then fades. */
  reducedHold: 650,
  /** Never trap anyone behind the splash: once the session is restored it is gone by this. */
  failsafe: 6000,
} as const;

/** Time of day greeting for the returning ending (device-local hour, 0–23). */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** First word of a display name ("Anubhav Maurya" → "Anubhav"); '' when there is no name. */
export function firstNameOf(name: string | null | undefined): string {
  return String(name ?? '').trim().split(/\s+/)[0] ?? '';
}

/**
 * Where a mark that turns once every `periodMs` points after `elapsedMs`, in degrees [0, 360).
 * The login screen spins its logo continuously; the welcome ending lands its own logo on the same
 * angle so the hand-off is one logo, not two crossfading at different rotations.
 */
export function spinAngleAt(elapsedMs: number, periodMs: number): number {
  if (!(periodMs > 0) || !Number.isFinite(elapsedMs)) return 0;
  const deg = ((elapsedMs % periodMs) / periodMs) * 360;
  return deg < 0 ? deg + 360 : deg;
}

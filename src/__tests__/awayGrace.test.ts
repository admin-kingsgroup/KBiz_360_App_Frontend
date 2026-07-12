import { nextAwaySince, awayLongEnough, AWAY_GRACE_MS, computePresence } from '../logic/attendance';
import type { OfficePresence } from '../types';

const OFFICE = { lat: 19.146724, lng: 72.82933, radius: 150 };
const p = (over: Partial<OfficePresence>): OfficePresence => ({ distance: null, inside: false, present: false, viaNow: '', ...over });

describe('nextAwaySince', () => {
  const NOW = 1_000_000;

  it('clears while present', () => {
    expect(nextAwaySince(p({ present: true, inside: true, distance: 50 }), NOW - 60_000, NOW)).toBeNull();
  });

  it('does NOT start on a lost GPS fix (unknown ≠ away) — the Sughra bug', () => {
    // No Wi-Fi, no coords: presence computes absent, but away-time must not accumulate.
    const lostFix = computePresence({ wifiOn: false, coords: null, office: OFFICE });
    expect(lostFix.present).toBe(false);
    expect(nextAwaySince(lostFix, null, NOW)).toBeNull();
    // ...and an already-running timer resets rather than firing a punch-out.
    expect(nextAwaySince(lostFix, NOW - AWAY_GRACE_MS, NOW)).toBeNull();
  });

  it('starts on a confirmed outside reading and keeps the original start', () => {
    const outside = p({ present: false, inside: false, distance: 400 });
    expect(nextAwaySince(outside, null, NOW)).toBe(NOW);
    expect(nextAwaySince(outside, NOW - 90_000, NOW)).toBe(NOW - 90_000);
  });

  it('resets when the person comes back inside', () => {
    const back = computePresence({ wifiOn: false, coords: { lat: OFFICE.lat, lng: OFFICE.lng }, office: OFFICE });
    expect(back.present).toBe(true);
    expect(nextAwaySince(back, NOW - 120_000, NOW)).toBeNull();
  });

  it('holds present on office Wi-Fi even with no GPS', () => {
    const wifiOnly = computePresence({ wifiOn: true, coords: null, office: OFFICE });
    expect(wifiOnly.present).toBe(true);
    expect(nextAwaySince(wifiOnly, NOW - 120_000, NOW)).toBeNull();
  });
});

describe('awayLongEnough', () => {
  const NOW = 2_000_000;

  it('false with no timer running', () => {
    expect(awayLongEnough(null, NOW)).toBe(false);
  });

  it('false until the grace period elapses, true after', () => {
    expect(awayLongEnough(NOW - AWAY_GRACE_MS + 1000, NOW)).toBe(false);
    expect(awayLongEnough(NOW - AWAY_GRACE_MS, NOW)).toBe(true);
    expect(awayLongEnough(NOW - AWAY_GRACE_MS - 1, NOW)).toBe(true);
  });

  it('respects a custom grace period', () => {
    expect(awayLongEnough(NOW - 3000, NOW, 2000)).toBe(true);
    expect(awayLongEnough(NOW - 1000, NOW, 2000)).toBe(false);
  });
});

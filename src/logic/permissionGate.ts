// Location gate policy (owner decision, 2026-10-05): entering the app REQUIRES background location
// — "Allow all the time" on Android, "Always" on iOS — AND this account's acceptance of the
// background-location disclosure. Anything less keeps the user on the permissions screen; the app
// does not open. This deliberately reverses the foreground-only gate adopted after the Play
// rejection of 09-10. Known cost, accepted by the owner: Android needs Google Play's
// background-location declaration approved before a build carrying this can ship, both stores
// treat gating core features behind background location as a review risk, and on iOS a person who
// answered "Keep Only While Using" can only fix it in Settings (the screen routes them there).
//
// The work-hours location trail itself still collects only between check-in and check-out.
//
// 'unavailable' (Expo Go / no native module / permissions API failure) cannot be enforced — it
// passes so dev flows keep working.
export type BgLocationStatus = 'granted' | 'foreground-only' | 'denied' | 'unavailable';

// OS half of the gate: only a full background grant passes.
export function locationPermSatisfied(status: BgLocationStatus): boolean {
  return status === 'granted' || status === 'unavailable';
}

// The whole gate: the OS grant AND the in-app disclosure accepted by THIS account. A grant made
// before the disclosure existed (an old install, or toggled by hand in Settings) is not enough —
// the person must have been told what "all the time" is used for.
export function locationGateSatisfied(status: BgLocationStatus, disclosureAccepted: boolean): boolean {
  if (status === 'unavailable') return true;
  return status === 'granted' && disclosureAccepted;
}

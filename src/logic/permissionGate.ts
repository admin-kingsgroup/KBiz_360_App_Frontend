// Location gate policy. Entering the app requires only FOREGROUND location ("While using the app").
// Background location ("Allow all the time") is NOT declared on Android any more (dropped after the
// Play rejection of 09-10) and is never requested anywhere; 'granted' survives only for iOS/legacy
// installs where it was set by hand. Requiring it to open the app locked users out: on iOS's standard two-step grant a
// fresh install lands on "When In Use" and iOS will not re-prompt for "Always", and gating core
// chat/email/calls behind background location is an App Store / Play rejection reason. Only a full
// deny ('denied', location off entirely) blocks entry. 'unavailable' (Expo Go / no native module /
// permissions API failure) cannot be enforced — treat it as satisfied so dev flows keep working.
// Background geofencing arms itself only when the OS actually reports "Always" (checked independently
// in backgroundAttendance), so relaxing this predicate never runs background work without that grant.
export type BgLocationStatus = 'granted' | 'foreground-only' | 'denied' | 'unavailable';

export function locationPermSatisfied(status: BgLocationStatus): boolean {
  return status === 'granted' || status === 'foreground-only' || status === 'unavailable';
}

import { useAttendanceStore } from '../store/attendanceStore';
import { canFacePunch } from '../logic/attendance';
import { branches } from '../data/businesses';

const amd = branches.find((b) => b.code === 'AMD')!;
const office = { lat: amd.lat as number, lng: amd.lng as number, radius: amd.radius };
const inside = { lat: (amd.lat as number) + 0.0003, lng: (amd.lng as number) + 0.0003 };
const away = { lat: (amd.lat as number) + 0.05, lng: (amd.lng as number) + 0.05 };

describe('Attendance — presence + auto-punch + face gating (source-faithful)', () => {
  beforeEach(() => useAttendanceStore.getState().reset());

  it('Wi-Fi ON → present via Wi-Fi → auto check-in', () => {
    useAttendanceStore.getState().refreshPresence({ wifiOn: true, coords: null, office });
    expect(useAttendanceStore.getState().presence?.present).toBe(true);
    expect(useAttendanceStore.getState().presence?.viaNow).toBe('Wi-Fi');
    expect(useAttendanceStore.getState().runAutoPunch()).toBe(true);
    expect(useAttendanceStore.getState().att.inTime).not.toBeNull();
  });

  it('inside geofence → present via Geofence; leaving → auto check-out', () => {
    useAttendanceStore.getState().refreshPresence({ wifiOn: false, coords: inside, office });
    expect(useAttendanceStore.getState().presence?.inside).toBe(true);
    expect(useAttendanceStore.getState().presence?.viaNow).toBe('Geofence');
    useAttendanceStore.getState().runAutoPunch(); // check-in
    useAttendanceStore.getState().refreshPresence({ wifiOn: false, coords: away, office });
    expect(useAttendanceStore.getState().presence?.present).toBe(false);
    expect(useAttendanceStore.getState().runAutoPunch()).toBe(true); // check-out
    expect(useAttendanceStore.getState().att.outTime).not.toBeNull();
  });

  it('face punch is gated by presence (canFacePunch)', () => {
    // away → not present → cannot face punch
    useAttendanceStore.getState().refreshPresence({ wifiOn: false, coords: away, office });
    expect(canFacePunch(false, useAttendanceStore.getState().att, false)).toBe(false);
    expect(useAttendanceStore.getState().punchByFace()).toBe(false);
    // present → can
    useAttendanceStore.getState().refreshPresence({ wifiOn: true, coords: null, office });
    expect(canFacePunch(true, useAttendanceStore.getState().att, false)).toBe(true);
    expect(useAttendanceStore.getState().punchByFace()).toBe(true);
    expect(useAttendanceStore.getState().att.via).toBe('Face');
  });
});

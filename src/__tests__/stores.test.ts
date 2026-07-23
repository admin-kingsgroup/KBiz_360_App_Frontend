import { useAccessStore } from '../store/accessStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { useChatStore } from '../store/chatStore';
import { adminUsers } from '../data/users';
import type { Chat } from '../types';

describe('accessStore', () => {
  it('derives access from user, and "view as" overrides it', () => {
    const s = useAccessStore.getState();
    s.setUser(adminUsers.find((u) => u.id === 'a1')!); // super
    expect(useAccessStore.getState().access()!.isSuper).toBe(true);
    s.setViewAs(adminUsers.find((u) => u.id === 'a6')!); // employee
    const a = useAccessStore.getState().access()!;
    expect(a.isSuper).toBe(false);
    expect(a.branches).toEqual(['AMD']);
    expect(useAccessStore.getState().canManage()).toBe(false);
  });
});

describe('attendanceStore', () => {
  it('auto punch-in via presence, then face punch-out blocked off-site', () => {
    const s = useAttendanceStore.getState();
    s.reset();
    s.refreshPresence({ wifiOn: true, wifiConfigured: true, coords: { lat: 23.0225, lng: 72.5714 }, office: { lat: 23.0225, lng: 72.5714, radius: 150 } });
    expect(useAttendanceStore.getState().runAutoPunch(new Date('2026-06-10T09:00:00Z'))).toBe(true);
    expect(useAttendanceStore.getState().att.inTime).not.toBeNull();
    // leave office
    s.refreshPresence({ wifiOn: false, wifiConfigured: true, coords: { lat: 19.07, lng: 72.87 }, office: { lat: 23.0225, lng: 72.5714, radius: 150 } });
    expect(useAttendanceStore.getState().punchByFace()).toBe(false); // off-site → blocked
  });

  it('refreshPresence does not republish on sub-10m GPS wobble, republishes on real movement', () => {
    const s = useAttendanceStore.getState();
    s.reset();
    const office = { lat: 23.0225, lng: 72.5714, radius: 150 };
    // ~0.00001° lat ≈ 1.1 m — build coords at controlled distances from the office centre.
    const at = (metersNorth: number) => ({ lat: office.lat + metersNorth / 111_320, lng: office.lng });
    s.refreshPresence({ wifiOn: true, wifiConfigured: true, coords: at(100), office });
    const published = useAttendanceStore.getState().presence;
    expect(published?.distance).toBe(100);
    // 3 m wobble: same 10 m bucket → the published object must be IDENTICAL (no re-render).
    const ret = s.refreshPresence({ wifiOn: true, wifiConfigured: true, coords: at(103), office });
    expect(useAttendanceStore.getState().presence).toBe(published);
    expect(ret.distance).toBe(103); // …but the RETURNED value stays raw for presence decisions
    // 20 m of real movement: bucket changes → republish.
    s.refreshPresence({ wifiOn: true, wifiConfigured: true, coords: at(120), office });
    expect(useAttendanceStore.getState().presence).not.toBe(published);
    expect(useAttendanceStore.getState().presence?.distance).toBe(120);
  });
});

describe('chatStore', () => {
  it('unread total + unread-first sorting', () => {
    const chats: Chat[] = [
      { id: 'c1', kind: 'direct', name: 'A', unread: 0, ts: 100 },
      { id: 'c2', kind: 'direct', name: 'B', unread: 2, ts: 50 },
    ];
    useChatStore.getState().setChats(chats);
    expect(useChatStore.getState().unreadTotal()).toBe(2);
    expect(useChatStore.getState().sortedChats()[0].id).toBe('c2'); // unread first
  });
});

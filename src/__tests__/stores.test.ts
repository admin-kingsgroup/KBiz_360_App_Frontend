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

import { useState, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Eye, Plus, UserCheck, UserX } from 'lucide-react-native';
import { KBLogo } from '../ui';
import { CreateMenu } from './CreateMenu';
import { colors } from '../../theme';
import { useAccessStore } from '../../store/accessStore';
import { useUiStore } from '../../store/uiStore';
import { canCreateGroups } from '../../logic/groupCreate';
import { getMyAttendance } from '../../api/attendance';
import { ROLE_DEFS } from '../../constants/roles';

// "HH:MM" wall-clock for an ISO timestamp (attendance chip).
const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

// Shared brand bar for the Chats and Groups tabs: logo + title, the single "+" create hub, today's
// attendance chip, and the View-As banner. Extracted from Home when Groups/Departments/Alerts moved
// to their own bottom tab so both screens keep the identical header.
export function HomeHeader() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false); // Super-Admin "+" create hub
  // Today's attendance for the header Present/Absent chip. Refetched every time the screen gains
  // focus, so punching on the Attendance screen (or the background geofence) updates the chip on return.
  const [attToday, setAttToday] = useState<{ present: boolean; exempt: boolean; inTime: string | null; outTime: string | null } | null>(null);
  useFocusEffect(useCallback(() => {
    let alive = true;
    getMyAttendance()
      .then((m) => { if (alive) setAttToday({ present: !!m.inTime, exempt: !!m.exempt, inTime: m.inTime, outTime: m.outTime }); })
      .catch(() => undefined); // offline → keep last known state
    return () => { alive = false; };
  }, []));
  const access = useAccessStore((s) => s.access());
  const viewAsUser = useAccessStore((s) => s.viewAsUser);
  const setBiz = useUiStore((s) => s.setBiz);
  const showToast = useUiStore((s) => s.showToast);
  const isSuper = !!access?.isSuper;
  // Delegated group creators (allow-listed emails) get the "+" hub too, but limited to New group.
  const mayCreateGroup = canCreateGroups(useAccessStore((s) => s.effUser()), access);

  return (
    <>
      {/* Brand bar — white, sans-serif title, transparent icon buttons (mockup header) */}
      <View className="flex-row items-center justify-between" style={{ backgroundColor: colors.card, paddingHorizontal: 16, height: 60, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <KBLogo size={24} />
          </View>
          <View>
            <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.3, lineHeight: 24 }}>KBiz 360</Text>
            <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 1 }}>Smart Connect</Text>
          </View>
        </View>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          {/* Single "+" create hub — group / user / department / business / alert. Super-Admin only;
              every individual "New …" button was removed in favour of this menu. */}
          {(isSuper || mayCreateGroup) ? <Pressable onPress={() => setCreateOpen(true)} style={ibtn}><Plus size={24} color={colors.ink} strokeWidth={2.4} /></Pressable> : null}
          {/* Today's attendance at a glance — green Present / red Absent; tap to open Attendance.
              Hidden for exempt users (attendance not tracked) and until the first fetch resolves. */}
          {attToday && !attToday.exempt ? (
            <Pressable onPress={() => router.navigate('/attendance')} className="flex-row items-center" style={{ height: 36, paddingHorizontal: 12, gap: 6, borderRadius: 999, marginLeft: 2, backgroundColor: attToday.present ? colors.primarySoft : '#FDECEC' }}>
              {attToday.present ? <UserCheck size={16} color={colors.primary} /> : <UserX size={16} color={colors.danger} />}
              {/* Show today's check-in → check-out times when present; "Absent" until the first punch. */}
              <Text style={{ color: attToday.present ? colors.primary : colors.danger, fontSize: 13, fontWeight: '700' }}>
                {attToday.inTime
                  ? (attToday.outTime ? `${hhmm(attToday.inTime)} – ${hhmm(attToday.outTime)}` : `In ${hhmm(attToday.inTime)}`)
                  : 'Absent'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* View-As banner */}
      {viewAsUser ? (
        <View className="flex-row items-center gap-2 px-4 py-1.5" style={{ backgroundColor: colors.purple + '14', borderBottomColor: colors.purple + '33', borderBottomWidth: 1 }}>
          <Eye size={13} color={colors.purple} />
          <Text numberOfLines={1} style={{ color: colors.purple, fontSize: 11, fontWeight: '700', flex: 1 }}>
            Viewing as {viewAsUser.name} · {ROLE_DEFS[viewAsUser.role]?.label}
          </Text>
          <Pressable onPress={() => { useAccessStore.getState().setViewAs(null); setBiz('all'); showToast('Back to your view'); }} style={{ backgroundColor: colors.purple, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Exit</Text>
          </Pressable>
        </View>
      ) : null}

      {(isSuper || mayCreateGroup) ? <CreateMenu groupOnly={!isSuper} visible={createOpen} onClose={() => setCreateOpen(false)} /> : null}
    </>
  );
}

// Transparent 40px header icon button (mockup dimensions).
const ibtn = { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const };

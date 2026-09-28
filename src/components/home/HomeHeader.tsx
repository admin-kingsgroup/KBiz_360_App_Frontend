import { useState, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Eye, SquarePen, UserCheck, UserX } from 'lucide-react-native';
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

// Shared brand bar for the Chats and Alerts tabs, per the approved design canvas (2026-09-28):
// a small brand eyebrow over a large screen title, then the compose button.
// The title is a prop because the two tabs share every other part of this bar.
//
// Layout note: today's attendance rides the eyebrow line rather than the main row. It is a STATUS
// ("In 09:12" / "Absent"), not a peer action, so that is where it belongs; it stays tappable into
// the Attendance screen with hitSlop making up the touch target.
export function HomeHeader({ title }: { title: string }) {
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
  // One compose button, as drawn. For anyone who may create groups it opens the create hub
  // (group / user / business / branch); for everyone else it starts a new chat — previously they
  // had no create affordance here at all.
  const mayCreate = isSuper || mayCreateGroup;

  return (
    <>
      <View style={{ backgroundColor: colors.card, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.primary, fontSize: 12, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase' }}>KBiz 360 · Smart Connect</Text>
              {/* Today's attendance at a glance — tap to open Attendance. Hidden for exempt users
                  (attendance not tracked) and until the first fetch resolves. */}
              {attToday && !attToday.exempt ? (
                <Pressable onPress={() => router.navigate('/attendance')} hitSlop={12} className="flex-row items-center"
                  accessibilityRole="button" accessibilityLabel="Today's attendance"
                  style={{ height: 22, paddingHorizontal: 8, gap: 4, borderRadius: 999, backgroundColor: attToday.present ? colors.primarySoft : '#FDECEC' }}>
                  {attToday.present ? <UserCheck size={12} color={colors.primary} /> : <UserX size={12} color={colors.danger} />}
                  <Text style={{ color: attToday.present ? colors.primary : colors.danger, fontSize: 11, fontWeight: '700' }}>
                    {attToday.inTime
                      ? (attToday.outTime ? `${hhmm(attToday.inTime)} – ${hhmm(attToday.outTime)}` : `In ${hhmm(attToday.inTime)}`)
                      : 'Absent'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 }}>{title}</Text>
          </View>
          {/* Compose only. There is no profile avatar here: Profile is a bottom tab, and the same
              destination twice on one screen is a wasted 44px, not a convenience. */}
          <Pressable
            onPress={() => (mayCreate ? setCreateOpen(true) : router.push('/chat/search'))}
            accessibilityRole="button" accessibilityLabel={mayCreate ? 'Create' : 'New chat'}
            style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <SquarePen size={20} color={colors.primary} strokeWidth={2} />
          </Pressable>
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

      {mayCreate ? <CreateMenu groupOnly={!isSuper} visible={createOpen} onClose={() => setCreateOpen(false)} /> : null}
    </>
  );
}

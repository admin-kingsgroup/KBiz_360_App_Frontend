import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, useAnimatedRef, interpolate, Extrapolation, runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Search, Eye, UsersRound, Plus, MessageCircle, Mic, UserCheck, UserX } from 'lucide-react-native';
import { KBLogo, Toast, Skeleton, SkeletonList } from '../../src/components/ui';
import { ChatListItem } from '../../src/components/chat';
import { GroupsList, DepartmentsList, SystemAlertsList } from '../../src/components/home';
import { colors } from '../../src/theme';
import { useDirectoryStore } from '../../src/store/directoryStore';
import { useAccessStore } from '../../src/store/accessStore';
import { useAuthStore } from '../../src/store/authStore';
import { useUiStore } from '../../src/store/uiStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { usePulseStore } from '../../src/store/pulseStore';
import type { ChatConversation } from '../../src/api/chat';
import { getMyAttendance } from '../../src/api/attendance';
import { mediaUrl } from '../../src/api/media';
import type { PresenceInfo } from '../../src/store/messagingStore';
import { ROLE_DEFS } from '../../src/constants/roles';

// Map a real conversation → the row shape ChatListItem renders.
const relTime = (iso: string): string => {
  const d = new Date(iso); const now = new Date();
  return d.toDateString() === now.toDateString()
    ? `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    : `${d.getDate()}/${d.getMonth() + 1}`;
};
function convToItem(c: ChatConversation, presence: Record<string, PresenceInfo>, myUserId: string | null) {
  const last = c.lastMessage;
  // Live presence beats the conversation's stale `online` snapshot; the snapshot only fills in when
  // no live entry has arrived at all.
  const live = c.type === 'direct' ? presence[c.otherUserId ?? ''] : undefined;
  const online = c.type === 'direct' ? (live ? live.status === 'online' : !!c.online) : false;
  return {
    id: c.id,
    name: c.name,
    initials: (c.name[0] ?? '?').toUpperCase(),
    color: c.type === 'group' ? colors.purple : colors.blue,
    preview: last ? (last.type === 'text' ? last.text : `[${last.type}]`) : 'No messages yet',
    time: c.lastActivityAt ? relTime(c.lastActivityAt) : '',
    ts: c.lastActivityAt ? new Date(c.lastActivityAt).getTime() : 0,
    unread: c.unread,
    online,
    image: c.image ? mediaUrl(c.image) : null,
    // WhatsApp list ticks — only for MY last message (status may be absent on old cached rows).
    lastStatus: last && myUserId && last.senderId === myUserId ? last.status ?? null : null,
  };
}

type Segment = 'chats' | 'groups' | 'depts' | 'pulse';
const SEGMENTS: { k: Segment; l: string }[] = [
  { k: 'chats', l: 'Chats' }, { k: 'groups', l: 'Groups' }, { k: 'depts', l: 'Departments' }, { k: 'pulse', l: 'Alerts' },
];

// Home — Phase 5: Chats segment only. Other segments are scaffolded (Phase 6).
// Business pills + View-As are access-driven (source-accurate). The DM list is NOT
// access-filtered and not affected by View-As — faithful to source (see Phase 5 report).
export default function Home() {
  const router = useRouter();
  const [seg, setSeg] = useState<Segment>('chats');
  // "Unread" filter chip (client-side; mirrors the mockup's chips row).
  const [unreadOnly, setUnreadOnly] = useState(false);
  // Today's attendance for the header Present/Absent chip. Refetched every time Home gains focus,
  // so punching on the Attendance screen (or the background geofence) updates the chip on return.
  const [attToday, setAttToday] = useState<{ present: boolean; exempt: boolean } | null>(null);
  useFocusEffect(useCallback(() => {
    let alive = true;
    getMyAttendance()
      .then((m) => { if (alive) setAttToday({ present: !!m.inTime, exempt: !!m.exempt }); })
      .catch(() => undefined); // offline → keep last known state
    return () => { alive = false; };
  }, []));
  // Swipeable segments (WhatsApp-style): a horizontal paging ScrollView holds the four panes; tapping
  // a tab scrolls to it, and settling on a pane after a swipe updates the active tab + underline.
  const { width } = useWindowDimensions();
  const pagerRef = useAnimatedRef<Animated.ScrollView>();
  const [pagerH, setPagerH] = useState(0);
  // Live underline driven entirely on the UI thread (Reanimated): scrollX mirrors the pager's offset
  // so the indicator slides + resizes to each tab's measured width with zero JS-bridge work per frame.
  const scrollX = useSharedValue(0);
  const lastIdx = useSharedValue(0);
  const [tabLayouts, setTabLayouts] = useState<({ x: number; width: number } | undefined)[]>([]);
  const goToSeg = (k: Segment): void => {
    setSeg(k);
    pagerRef.current?.scrollTo({ x: SEGMENTS.findIndex((s) => s.k === k) * width, animated: true });
  };
  // Flip the bold/active tab only when the midpoint between panes is actually crossed — keeps React
  // re-renders to ≤1 per swipe instead of one per frame (the per-frame jank source in the old version).
  const setSegByIndex = useCallback((i: number): void => { const k = SEGMENTS[i]?.k; if (k) setSeg(k); }, []);
  const onPagerScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
    const idx = Math.round(e.contentOffset.x / width);
    if (idx !== lastIdx.value) { lastIdx.value = idx; runOnJS(setSegByIndex)(idx); }
  }, [width]);
  const tabsReady = tabLayouts.filter(Boolean).length === SEGMENTS.length;
  const underlineInput = SEGMENTS.map((_, i) => i * width);
  const tabXs = SEGMENTS.map((_, i) => tabLayouts[i]?.x ?? 0);
  const tabWs = SEGMENTS.map((_, i) => tabLayouts[i]?.width ?? 0);
  const underlineStyle = useAnimatedStyle(() => ({
    width: interpolate(scrollX.value, underlineInput, tabWs, Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(scrollX.value, underlineInput, tabXs, Extrapolation.CLAMP) }],
  }), [tabXs, tabWs, underlineInput]);
  const access = useAccessStore((s) => s.access());
  const viewAsUser = useAccessStore((s) => s.viewAsUser);
  const realUser = useAuthStore((s) => s.user);
  const activeBizId = useUiStore((s) => s.activeBizId);
  const setBiz = useUiStore((s) => s.setBiz);
  const toast = useUiStore((s) => s.toast);
  const showToast = useUiStore((s) => s.showToast);

  // Real CRM org directory (companies/branches/departments), access-scoped by the backend. We show the
  // real org ONLY — no mock fallback — so dummy pills/tabs never flash before the real data loads.
  const dir = useDirectoryStore();
  useEffect(() => { void useDirectoryStore.getState().load(); }, []);
  const usingReal = dir.businesses.length > 0;
  const bizSource = dir.businesses;

  const isSuper = !!access?.isSuper;
  const totalUnread = bizSource.reduce((s, b) => s + (b.unread || 0), 0);
  const pills = [
    ...(isSuper ? [{ id: 'all', code: 'ALL', name: 'All businesses', color: colors.ink, unread: totalUnread }] : []),
    // Real data is already access-scoped server-side; the mock path keeps the client-side bizIds filter.
    ...(usingReal || isSuper ? bizSource : bizSource.filter((b) => (access?.bizIds || []).includes(b.id))),
  ];

  // Real conversations from the messaging store. Refetch every time Home gains focus so the list is
  // always current (new chats from elsewhere, reads, the post-reset clean slate) — not just on mount.
  const conversations = useMessagingStore((s) => s.conversations);
  const presence = useMessagingStore((s) => s.presence);
  const myUserId = useMessagingStore((s) => s.myUserId);
  useFocusEffect(useCallback(() => {
    void useMessagingStore.getState().loadConversations().then(() => {
      const ids = useMessagingStore.getState().conversations.filter((c) => c.type === 'direct' && c.otherUserId).map((c) => c.otherUserId as string);
      if (ids.length) void useMessagingStore.getState().loadPresence(ids);
    });
  }, []));
  // Chats segment = direct (1:1) conversations only — groups live exclusively in the Groups segment.
  // Show a direct chat only once it has a message (so tapping a person to "open" a chat without
  // sending anything doesn't leave an empty conversation in the list).
  const chats = conversations.filter((c) => c.type === 'direct' && !!c.lastMessage).map((c) => convToItem(c, presence, myUserId));
  // Real group conversations the user belongs to — manual ones (branchId, no deptKey) surface under
  // their branch in the Groups tab so they're reachable now that groups are out of the Chats list.
  const groupConvs = conversations.filter((c) => c.type === 'group').map((c) => ({
    id: c.id, name: c.name, branchId: c.branchId ?? null, deptKey: c.deptKey ?? null, unread: c.unread,
    preview: c.lastMessage ? (c.lastMessage.type === 'text' ? c.lastMessage.text : `[${c.lastMessage.type}]`) : undefined,
  }));
  void realUser;

  // Unread badges on the segment tabs — number of unread items per segment (NOT the total count).
  // Chats/Groups = conversations with unread; Alerts = unread alert events. Departments has no
  // cheap unread source here, so it stays badge-less.
  const unreadEvents = usePulseStore((s) => s.events).filter((e) => !e.read).length;
  const tabUnread: Record<Segment, number> = {
    chats: chats.filter((c) => c.unread > 0).length,
    groups: groupConvs.filter((g) => (g.unread || 0) > 0).length,
    depts: 0,
    pulse: unreadEvents,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
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
          {/* Group creation is Super-Admin only — everyone else never sees the entry point. */}
          {isSuper ? <Pressable onPress={() => router.push('/chat/new-group')} style={ibtn}><UsersRound size={22} color={colors.ink} strokeWidth={2} /></Pressable> : null}
          {/* Today's attendance at a glance — green Present / red Absent; tap to open Attendance.
              Hidden for exempt users (attendance not tracked) and until the first fetch resolves. */}
          {attToday && !attToday.exempt ? (
            <Pressable onPress={() => router.push('/attendance')} className="flex-row items-center" style={{ height: 36, paddingHorizontal: 12, gap: 6, borderRadius: 999, marginLeft: 2, backgroundColor: attToday.present ? colors.primarySoft : '#FDECEC' }}>
              {attToday.present ? <UserCheck size={16} color={colors.primary} /> : <UserX size={16} color={colors.danger} />}
              <Text style={{ color: attToday.present ? colors.primary : colors.danger, fontSize: 13, fontWeight: '700' }}>{attToday.present ? 'Present' : 'Absent'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Search bar — grey pill (mockup), whole bar opens the search screen. Chats segment only:
          it searches people + chat messages, so it's noise on Groups/Departments/Alerts. */}
      {seg === 'chats' ? (
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <Pressable onPress={() => router.push('/chat/search')} className="flex-row items-center" style={{ height: 50, borderRadius: 999, backgroundColor: colors.coolMuted, paddingHorizontal: 16, gap: 12 }}>
          <Search size={20} color={colors.coolText3} strokeWidth={2.2} />
          <Text style={{ color: colors.coolText3, fontSize: 15, flex: 1 }}>Search chats...</Text>
          {/* Mic goes straight to voice search — the search screen starts listening on arrival */}
          <Pressable onPress={() => router.push({ pathname: '/chat/search', params: { voice: '1' } })} hitSlop={10}>
            <Mic size={19} color={colors.coolText} strokeWidth={2.2} />
          </Pressable>
        </Pressable>
      </View>
      ) : null}

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

      {/* Filter chips. Chats: plain All / Unread (the DM list isn't business-scoped, so business
          pills would be inert here). Groups/Departments: the business pills that actually filter
          those panes (access-filtered, View-As-aware). Hidden on System Alerts. */}
      {seg !== 'pulse' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
          {seg === 'chats' ? (
            <>
              <Pressable onPress={() => setUnreadOnly(false)} style={[chip, { backgroundColor: !unreadOnly ? colors.primary : colors.coolMuted }]}>
                <Text style={{ color: !unreadOnly ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>All</Text>
              </Pressable>
              <Pressable onPress={() => setUnreadOnly(true)} style={[chip, { backgroundColor: unreadOnly ? colors.primary : colors.coolMuted }]}>
                <Text style={{ color: unreadOnly ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>Unread</Text>
              </Pressable>
            </>
          ) : !dir.loaded && pills.length === 0 ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} w={64} h={34} r={999} />)
          ) : (
            pills.map((p) => {
              const on = activeBizId === p.id;
              return (
                <Pressable key={p.id} onPress={() => setBiz(p.id)} style={[chip, { backgroundColor: on ? colors.primary : colors.coolMuted }]}>
                  <Text style={{ color: on ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>{p.id === 'all' ? 'All' : p.code}</Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      ) : null}

      {/* Segment tabs — tap to switch; the underline slides live as you swipe the panes below */}
      <View style={{ borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 14, alignItems: 'flex-end' }}
        >
          {SEGMENTS.map((s, i) => {
            const on = s.k === seg;
            const unread = tabUnread[s.k];
            return (
              <Pressable
                key={s.k}
                onPress={() => goToSeg(s.k)}
                className="flex-row items-center"
                style={{ gap: 6, height: 44 }}
                onLayout={(e) => {
                  const { x, width: w } = e.nativeEvent.layout;
                  setTabLayouts((prev) => {
                    if (prev[i] && prev[i]!.x === x && prev[i]!.width === w) return prev;
                    const n = prev.slice();
                    n[i] = { x, width: w };
                    return n;
                  });
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: on ? colors.primary : colors.coolText }}>{s.l}</Text>
                {unread > 0 ? (
                  <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
          {tabsReady ? (
            <Animated.View
              style={[
                { position: 'absolute', left: 0, bottom: 0, height: 3, borderRadius: 3, backgroundColor: colors.primary },
                underlineStyle,
              ]}
            />
          ) : null}
        </ScrollView>
      </View>

      {/* Swipeable content — swipe left/right to move between Chats · Groups · Departments · System Alerts */}
      <View style={{ flex: 1 }} onLayout={(e) => setPagerH(e.nativeEvent.layout.height)}>
        {pagerH > 0 ? (
          <Animated.ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onPagerScroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* Chats — flat full-width white rows on the cool canvas (mockup list), flush under the tabs */}
            <View style={{ width, height: pagerH, backgroundColor: colors.coolBg }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}>
                {(unreadOnly ? chats.filter((c) => c.unread > 0) : chats).length === 0 ? (
                  <View className="items-center justify-center" style={{ flex: 1, paddingHorizontal: 32, paddingVertical: 48 }}>
                    <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                      <MessageCircle size={50} color={colors.primary} />
                    </View>
                    <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700', marginTop: 20 }}>{unreadOnly ? 'No unread chats' : 'No conversations'}</Text>
                    <Text style={{ color: colors.coolText, fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>Your conversations will appear here.</Text>
                    <Pressable onPress={() => router.push('/chat/search')} className="flex-row items-center gap-2" style={{ marginTop: 24, height: 50, paddingHorizontal: 24, borderRadius: 999, backgroundColor: colors.primary }}>
                      <Plus size={20} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Start new chat</Text>
                    </Pressable>
                  </View>
                ) : (
                  (unreadOnly ? chats.filter((c) => c.unread > 0) : chats).map((c, i) => (
                    <ChatListItem key={c.id} chat={c} topDivider={i > 0} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })} />
                  ))
                )}
              </ScrollView>
            </View>

            {/* Groups */}
            <View style={{ width, height: pagerH }}>
              <ScrollView style={{ flex: 1 }}>
                {!dir.loaded ? <SkeletonList /> : (
                <GroupsList
                  activeBizId={activeBizId} access={access} serverFiltered
                  businesses={dir.businesses}
                  branches={dir.branches}
                  groupConversations={groupConvs}
                  onOpen={(g) => {
                    // A real group is an existing conversation — open it directly by id.
                    if (g.convId) { router.push({ pathname: '/chat/[id]', params: { id: g.convId } }); return; }
                    // Otherwise it's a department: open the department detail to see/create its groups.
                    router.push({ pathname: '/department/[id]', params: { id: g.id, biz: g.bizId, name: g.name } });
                  }}
                />
                )}
              </ScrollView>
            </View>

            {/* Departments */}
            <View style={{ width, height: pagerH }}>
              <ScrollView style={{ flex: 1 }}>
                {!dir.loaded ? <SkeletonList /> : (
                <DepartmentsList
                  activeBizId={activeBizId} access={access} serverFiltered
                  businesses={dir.businesses}
                  branches={dir.branches}
                  businessDepts={dir.businessDepts}
                  onOpenDept={(d) => router.push({ pathname: '/department/[id]', params: { id: d._key, biz: d.bizId, name: d.name } })}
                />
                )}
                {isSuper ? (
                  <View className="px-4 pb-6 pt-1">
                    <Pressable onPress={() => router.push('/admin/departments')} className="flex-row items-center justify-center gap-1.5" style={{ paddingVertical: 12, borderRadius: 999, borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed', backgroundColor: colors.card }}>
                      <Plus size={17} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>Create / manage departments</Text>
                    </Pressable>
                  </View>
                ) : null}
              </ScrollView>
            </View>

            {/* System Alerts */}
            <View style={{ width, height: pagerH }}>
              <ScrollView style={{ flex: 1 }}>
                <SystemAlertsList activeBizId="tk" access={access} onOpenChannel={(ch) => router.push({ pathname: '/alert/[id]', params: { id: ch.id } })} onCreate={() => router.push('/alert/new')} />
              </ScrollView>
            </View>
          </Animated.ScrollView>
        ) : null}
      </View>

      <Toast message={toast} onHide={() => showToast(null)} />
    </SafeAreaView>
  );
}

// Transparent 40px header icon button + 34px filter chip (mockup dimensions).
const ibtn = { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const };
const chip = { height: 34, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const };

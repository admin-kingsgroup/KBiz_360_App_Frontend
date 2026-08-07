import { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, useAnimatedRef, interpolate, Extrapolation, runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Skeleton, SkeletonList } from '../../src/components/ui';
import { GroupsList, DepartmentsList, SystemAlertsList, HomeHeader } from '../../src/components/home';
import { colors } from '../../src/theme';
import { useDirectoryStore } from '../../src/store/directoryStore';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { ChatActionsSheet } from '../../src/components/chat';
import type { ChatConversation } from '../../src/api/chat';
import { usePulseStore } from '../../src/store/pulseStore';
import { isVisibleAlertChannel } from '../../src/data/pulse';

type Segment = 'groups' | 'depts' | 'pulse';
const SEGMENTS: { k: Segment; l: string }[] = [
  { k: 'groups', l: 'Groups' }, { k: 'depts', l: 'Departments' }, { k: 'pulse', l: 'Alerts' },
];

// Groups tab — Groups · Departments · System Alerts (moved out of the Chats tab so Chats holds
// only 1:1 conversations). Business pills + segments are access-driven, same as the old Home panes.
export default function Groups() {
  const router = useRouter();
  const [seg, setSeg] = useState<Segment>('groups');
  // Swipeable segments (WhatsApp-style): a horizontal paging ScrollView holds the three panes;
  // tapping a tab scrolls to it, and settling on a pane after a swipe updates the tab + underline.
  const { width } = useWindowDimensions();
  const pagerRef = useAnimatedRef<Animated.ScrollView>();
  const [pagerH, setPagerH] = useState(0);
  // Pager paging pauses while a nested horizontal row (branch chips) is being touched.
  const [pagerScrollEnabled, setPagerScrollEnabled] = useState(true);
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
  // re-renders to ≤1 per swipe instead of one per frame.
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
  const activeBizId = useUiStore((s) => s.activeBizId);
  const setBiz = useUiStore((s) => s.setBiz);

  // Real CRM org directory (companies/branches/departments), access-scoped by the backend. We show the
  // real org ONLY — no mock fallback — so dummy pills/tabs never flash before the real data loads.
  const dir = useDirectoryStore();
  // Refetch on focus (not just mount): the tab stays mounted all session, so a mount-only load
  // meant businesses/branches/departments created elsewhere only appeared after an app restart.
  useFocusEffect(useCallback(() => { void useDirectoryStore.getState().load(); }, []));
  const usingReal = dir.businesses.length > 0;
  const bizSource = dir.businesses;

  const isSuper = !!access?.isSuper;
  const totalUnread = bizSource.reduce((s, b) => s + (b.unread || 0), 0);
  const pills = [
    ...(isSuper ? [{ id: 'all', code: 'ALL', name: 'All businesses', color: colors.ink, unread: totalUnread }] : []),
    // Real data is already access-scoped server-side; the mock path keeps the client-side bizIds filter.
    ...(usingReal || isSuper ? bizSource : bizSource.filter((b) => (access?.bizIds || []).includes(b.id))),
  ];

  // Real group conversations the user belongs to — manual ones (branchId, no deptKey) surface under
  // their branch in the Groups pane. Refetched on focus so unread/previews stay current.
  const conversations = useMessagingStore((s) => s.conversations);
  // Long-pressed group row → mute / pin / archive (same sheet as the Chats tab).
  const [actionsFor, setActionsFor] = useState<ChatConversation | null>(null);
  // Prefetch after the list lands so opening a group is instant on the first tap too (no-op for
  // threads already cached and up to date).
  useFocusEffect(useCallback(() => {
    void useMessagingStore.getState().loadConversations().then(() => useMessagingStore.getState().prefetchMessages());
  }, []));
  const groupConvs = conversations.filter((c) => c.type === 'group' && !c.archived).map((c) => ({
    id: c.id, name: c.name, branchId: c.branchId ?? null, deptKey: c.deptKey ?? null, unread: c.unread,
    preview: c.lastMessage ? (c.lastMessage.type === 'text' ? c.lastMessage.text : `[${c.lastMessage.type}]`) : undefined,
    pinned: !!c.pinned, // pinned groups float to the top of their branch's list
  }));

  // Unread badges on the segment tabs — number of unread items per segment (NOT the total count).
  // Groups = conversations with unread; Alerts = unread alert events. Departments has no cheap
  // unread source here, so it stays badge-less. The Alerts count must use the same visible-channel
  // gate as the cards: the server still sends events for hidden channel families (CRM/Finance
  // flags), and counting those left a badge the user could never clear.
  const unreadEvents = usePulseStore((s) => s.events).filter((e) => !e.read && isVisibleAlertChannel(e.channelId)).length;
  const tabUnread: Record<Segment, number> = {
    groups: groupConvs.filter((g) => (g.unread || 0) > 0).length,
    depts: 0,
    pulse: unreadEvents,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      <HomeHeader />

      {/* Business pills that filter the Groups/Departments panes (access-filtered, View-As-aware).
          Hidden on System Alerts. */}
      {seg !== 'pulse' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
          {!dir.loaded && pills.length === 0 ? (
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

      {/* Swipeable content — swipe left/right to move between Groups · Departments · System Alerts */}
      <View style={{ flex: 1 }} onLayout={(e) => setPagerH(e.nativeEvent.layout.height)}>
        {pagerH > 0 ? (
          <Animated.ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            // Paused while a finger is on a nested horizontal row (branch chips) — otherwise the
            // pager intercepts the drag on Android and the row can never scroll.
            scrollEnabled={pagerScrollEnabled}
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onPagerScroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* Groups */}
            <View style={{ width, height: pagerH, backgroundColor: colors.coolBg }}>
              <ScrollView style={{ flex: 1 }}>
                {!dir.loaded ? <SkeletonList /> : (
                <GroupsList
                  activeBizId={activeBizId} access={access} serverFiltered
                  onChipRowTouch={(touching) => setPagerScrollEnabled(!touching)}
                  businesses={dir.businesses}
                  branches={dir.branches}
                  groupConversations={groupConvs}
                  onLongPressGroup={(id) => setActionsFor(conversations.find((c) => c.id === id) ?? null)}
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
              </ScrollView>
            </View>

            {/* System Alerts */}
            <View style={{ width, height: pagerH }}>
              <ScrollView style={{ flex: 1 }}>
                {/* Alert creation moved to the "+" create hub — no inline create button here. */}
                <SystemAlertsList activeBizId="tk" access={access} onOpen={(id) => router.push({ pathname: '/alert/[id]', params: { id } })} />
              </ScrollView>
            </View>
          </Animated.ScrollView>
        ) : null}
      </View>
      <ChatActionsSheet conv={actionsFor} onClose={() => setActionsFor(null)} />

    </SafeAreaView>
  );
}

// 34px filter chip (mockup dimensions).
const chip = { height: 34, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const };

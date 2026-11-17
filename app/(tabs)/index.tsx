import { textStyles } from '../../src/theme/typography';
import { memo, useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, FlatList, type GestureResponderEvent, type ListRenderItem } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { Plus, MessageCircle, Archive, ListChecks } from 'lucide-react-native';
import { ChatListItem, ChatActionsSheet } from '../../src/components/chat';
import { anchorOfPress, type AnchorRect } from '../../src/components/ui/AnchoredMenu';
import { HomeHeader, GroupsPane } from '../../src/components/home';
import { colors, useChatListPalette, type ChatListPalette } from '../../src/theme';
import { mixHex } from '../../src/theme/chatListPalette';
import { useAuthStore } from '../../src/store/authStore';
import { useAccessStore } from '../../src/store/accessStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useDirectoryStore, refreshDirectoryUsers } from '../../src/store/directoryStore';
import { useTasksStore } from '../../src/store/tasksStore';
import { isClosedTaskChat } from '../../src/logic/taskGroups';
import type { ChatConversation } from '../../src/api/chat';
import { mediaUrl } from '../../src/api/media';
import { oneLine } from '../../src/logic/text';
import { withSender } from '../../src/logic/groupsStrip';
import { relTime } from '../../src/utils/time';
import { ChatSplit, useOpenChat } from '../../src/components/layout/ChatSplit';
import { useWideLayout } from '../../src/hooks/useWideLayout';
import { useCompactChrome } from '../../src/hooks/useCompactChrome';
import { useChatPaneStore } from '../../src/store/chatPaneStore';
import { useSideStripStore } from '../../src/store/sideStripStore';

// Media types whose preview gets the small image glyph in the approved row.
const PICTORIAL = new Set(['image', 'video']);

// Map a real conversation → the row shape ChatListItem renders. The caller resolves everything that
// lives outside the conversation (presence, the branch/business short code the tile shows — see
// chatTile.ts for which one wins) down to plain values, so a row only repaints when ITS values change.
function convToItem(
  c: ChatConversation,
  online: boolean,
  myUserId: string | null,
  branchCode: string | null,
  companyCode: string | null,
  draft?: string,
  sender?: string | null,
) {
  const last = c.lastMessage;
  return {
    id: c.id,
    name: c.name,
    initials: (c.name[0] ?? '?').toUpperCase(),
    color: c.type === 'group' ? colors.purple : c.type === 'task' ? colors.teal : colors.blue,
    // A group's preview is led by who wrote it ("Sana: …"), as WhatsApp lists groups.
    preview: last ? withSender(last.type === 'text' ? oneLine(last.text) : `[${last.type}]`, sender) : 'No messages yet',
    time: c.lastActivityAt ? relTime(c.lastActivityAt) : '',
    ts: c.lastActivityAt ? new Date(c.lastActivityAt).getTime() : 0,
    unread: c.unread,
    online,
    image: c.image ? mediaUrl(c.image) : null,
    // WhatsApp list ticks — only for MY last message (status may be absent on old cached rows).
    lastStatus: last && myUserId && last.senderId === myUserId ? last.status ?? null : null,
    muted: !!c.muted,
    pinned: !!c.pinned,
    draft: draft ? oneLine(draft) : null,
    branchCode,
    companyCode,
    isImage: !!last && PICTORIAL.has(last.type),
  };
}

// One chat row. Memoised on the conversation object and a handful of primitives: the store keeps a
// conversation's identity until that conversation actually changes, so a message landing in one chat
// (or someone coming online) repaints one row instead of the whole list.
const ChatRow = memo(function ChatRow({ conv, online, myUserId, branchCode, companyCode, draft, sender, selected, onOpen, onActions }: {
  conv: ChatConversation; online: boolean; myUserId: string | null; branchCode: string | null; companyCode: string | null;
  draft?: string; sender: string | null; selected: boolean; onOpen: (id: string) => void; onActions: (id: string, at?: AnchorRect) => void;
}) {
  const id = conv.id;
  const press = useCallback(() => onOpen(id), [onOpen, id]);
  // The actions menu opens beside this row, at the finger.
  const longPress = useCallback((e: GestureResponderEvent) => { void anchorOfPress(e, { atFinger: true }).then((at) => onActions(id, at)); }, [onActions, id]);
  return <ChatListItem chat={convToItem(conv, online, myUserId, branchCode, companyCode, draft, sender)} onPress={press} onLongPress={longPress} selected={selected} />;
});

const convKey = (c: ChatConversation): string => c.id;

// Home — Chats tab: one WhatsApp-style list of direct chats AND groups. Groups also have their own
// chip here — the branch-organised list that used to be the Groups bottom tab (that slot is now
// Alerts); in All/Unread they simply ride the recency list.
// The DM list is NOT access-filtered and not affected by View-As — faithful to source (see Phase 5
// report); groups come from the same store, which the backend already membership-scopes.
// Tasks (2026-11-16): the task chats — one per task, named after it. A closed or cancelled task's chat
// leaves the active lists for "Closed task chats" (still open for messages, decision 4).
type ChatFilter = 'all' | 'unread' | 'groups' | 'tasks';

export default function Home() {
  const router = useRouter();
  // Filter (client-side): All / Unread / Groups — a segmented control. Unread = every chat
  // with unread (direct or group); Groups = every group, filed by business -> branch (GroupsPane).
  const [filter, setFilter] = useState<ChatFilter>('all');
  const realUser = useAuthStore((s) => s.user);
  // The whole list wears the GLOBAL chat theme (Profile -> Chat theme), like the chats it opens.
  const p = useChatListPalette();
  // A dark theme (Midnight) needs light status-bar content while this tab is in front; hand the
  // app default back on blur so the other tabs are unaffected.
  // iPhone Duo (closed): the status bar lives in a strip down the side — paint it in this list's bar
  // colour, so a light (dark-theme) clock is still readable there.
  useFocusEffect(useCallback(() => {
    setStatusBarStyle(p.dark ? 'light' : 'dark');
    useSideStripStore.getState().setColor(p.bar);
    return () => { setStatusBarStyle('dark'); useSideStripStore.getState().setColor(null); };
  }, [p.dark, p.bar]));

  // Wide window (iPhone Duo opened): the list and the open chat side by side, split on the fold.
  // A tap opens the chat in the right pane instead of pushing its own screen.
  const wide = useWideLayout();
  // Short window (the iPhone Duo, an iPhone SE): slimmer search and filter rows — see HomeHeader.
  const compact = useCompactChrome();
  const paneId = useChatPaneStore((s) => s.openId); // the chat open in the right pane (ChatSplit)

  // Real conversations from the messaging store. Refetch every time Home gains focus so the list is
  // always current (new chats from elsewhere, reads, the post-reset clean slate) — not just on mount.
  const conversations = useMessagingStore((s) => s.conversations);
  const presence = useMessagingStore((s) => s.presence);
  const myUserId = useMessagingStore((s) => s.myUserId);
  const drafts = useMessagingStore((s) => s.drafts);
  // Branch/business short codes for the row tiles. The directory is already loaded by GroupsPane
  // and cached in the store; until it lands, tiles simply fall back to initials.
  const dirBranches = useDirectoryStore((s) => s.branches);
  const dirBusinesses = useDirectoryStore((s) => s.businesses);
  const codes = useMemo(() => ({
    branch: new Map(dirBranches.filter((b) => b.code).map((b) => [b.id, b.code])),
    company: new Map(dirBusinesses.filter((b) => b.code).map((b) => [b.id, b.code])),
  }), [dirBranches, dirBusinesses]);
  useFocusEffect(useCallback(() => { void useDirectoryStore.getState().load(); }, []));
  // People, for the sender's name in group previews. Throttled inside, so a focus is usually free.
  const users = useAccessStore((s) => s.users);
  const userNames = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
  useFocusEffect(useCallback(() => { void refreshDirectoryUsers(); }, []));
  // Long-pressed row -> the mute/pin/archive sheet.
  const [actionsFor, setActionsFor] = useState<{ conv: ChatConversation; at?: AnchorRect } | null>(null);
  useFocusEffect(useCallback(() => {
    void useMessagingStore.getState().loadConversations().then(() => {
      const ids = useMessagingStore.getState().conversations.filter((c) => c.type === 'direct' && c.otherUserId).map((c) => c.otherUserId as string);
      if (ids.length) void useMessagingStore.getState().loadPresence(ids);
      // Warm the recent threads in the background so tapping one opens instantly (WhatsApp-style) —
      // skips anything already cached and up to date, so this is usually a no-op.
      void useMessagingStore.getState().prefetchMessages();
    });
    void useMessagingStore.getState().loadPrivacy(); // block list drives who can be messaged
  }, []));
  // Show a direct chat only once it has a message (so tapping a person to "open" a chat without
  // sending anything doesn't leave an empty conversation in the list); groups always show, even
  // before their first message (you were added to them — WhatsApp lists them immediately).
  // Archived chats live behind their own row (WhatsApp keeps them out of the main list entirely).
  // Which task chats are closed: the conversation's own taskStatus, else the tasks loaded on this phone.
  const taskStatuses = useTasksStore((s) => s.statusById);
  // Learn which tasks are closed on every visit (throttled to once a minute; always when Tasks is picked),
  // so a closed task's chat leaves All/Unread even when the server's chat list does not say it.
  useFocusEffect(useCallback(() => { void useTasksStore.getState().loadClosedStatuses(filter === 'tasks'); }, [filter]));
  const { visible, archivedCount, hasArchived, unreadChats, unreadGroupChats, unreadTaskChats, closedTaskChats } = useMemo(() => {
    const live = conversations.filter((c) => !c.archived && (c.type === 'group' || c.type === 'task' || !!c.lastMessage));
    const active = live.filter((c) => !isClosedTaskChat(c, taskStatuses));
    const taskChats = active.filter((c) => c.type === 'task');
    // Pinned chats sit above everything else, in their own recency order — the list is already sorted
    // by activity, so a stable partition is all that is needed.
    // Groups renders GroupsPane instead of this list, so only All/Unread filter it.
    const filtered = filter === 'unread' ? active.filter((c) => c.unread > 0) : filter === 'tasks' ? taskChats : active;
    return {
      visible: [...filtered.filter((c) => c.pinned), ...filtered.filter((c) => !c.pinned)],
      archivedCount: conversations.filter((c) => c.archived && c.unread > 0).length,
      hasArchived: conversations.some((c) => c.archived),
      // Chip badges — number of CHATS with unread, not messages: the badge unit everywhere.
      unreadChats: active.filter((c) => c.unread > 0).length,
      unreadGroupChats: active.filter((c) => c.type === 'group' && c.unread > 0).length,
      unreadTaskChats: taskChats.filter((c) => c.unread > 0).length,
      closedTaskChats: live.filter((c) => isClosedTaskChat(c, taskStatuses)).length,
    };
  }, [conversations, filter, taskStatuses]);
  void realUser;

  // Stable row handlers (rows are memoised — a fresh closure per render would repaint every row).
  // Opens in the right pane on a wide window, as its own screen otherwise (ChatSplit).
  const openChat = useOpenChat();
  const openActions = useCallback((id: string, at?: AnchorRect) => {
    const conv = useMessagingStore.getState().conversations.find((c) => c.id === id);
    setActionsFor(conv ? { conv, at } : null);
  }, []);
  const renderChat: ListRenderItem<ChatConversation> = useCallback(({ item: c }) => {
    // Live presence beats the conversation's stale `online` snapshot; the snapshot only fills in when
    // no live entry has arrived at all.
    const live = c.type === 'direct' ? presence[c.otherUserId ?? ''] : undefined;
    const online = c.type === 'direct' ? (live ? live.status === 'online' : !!c.online) : false;
    // Who wrote a group's last message — not for my own (the ticks say that) nor a system line.
    const last = c.lastMessage;
    const sender = (c.type === 'group' || c.type === 'task') && last && last.senderId !== myUserId && last.type !== 'system'
      ? userNames.get(last.senderId) ?? null : null;
    return (
      <ChatRow conv={c} online={online} myUserId={myUserId}
        branchCode={(c.branchId && codes.branch.get(c.branchId)) || null}
        companyCode={(c.companyId && codes.company.get(c.companyId)) || null}
        draft={drafts[c.id]} sender={sender} selected={wide && c.id === paneId} onOpen={openChat} onActions={openActions} />
    );
  }, [presence, myUserId, codes, drafts, userNames, openChat, openActions, wide, paneId]);

  const listColumn = (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bar }} edges={['top']}>
      {/* Search lives in the header, as a button beside compose: it opens the search screen (input
          box and mic). The field and mic row it replaced cost ~50 pt of list (owner, 2026-11-17). */}
      <HomeHeader title="Chats" palette={p} onSearch={() => router.push('/chat/search')} />

      {/* All / Unread / Groups — a segmented control, not pills: the Groups view under it has its
          own business switcher and branch tiles, and three rows of the same pill (the old layout)
          read as one jumble of filters. Fills the width, so each segment is a big target. */}
      <View style={{ paddingHorizontal: compact ? 16 : 20, paddingTop: compact ? 6 : 8, paddingBottom: compact ? 8 : 12 }}>
        <View className="flex-row" accessibilityRole="tablist" style={[segTrack, compact ? { height: 34 } : null, { backgroundColor: p.field }]}>
          {([['all', 'All', 0], ['unread', 'Unread', unreadChats], ['groups', 'Groups', unreadGroupChats], ['tasks', 'Tasks', unreadTaskChats]] as const).map(([k, label, count]) => {
            const on = filter === k;
            return (
              <Pressable key={k} onPress={() => setFilter(k)} className="flex-row items-center justify-center"
                accessibilityRole="tab" accessibilityState={{ selected: on }}
                // A tab is 28-32 pt inside the track; the slop makes every tap target at least 44 pt.
                hitSlop={{ top: compact ? 8 : 6, bottom: compact ? 8 : 6 }}
                style={[seg, on ? segOn(p) : null]}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ flexShrink: 1, color: on ? p.text : p.mute, ...textStyles.subheadline, fontWeight: on ? '600' : '500' }}>{label}</Text>
                {count > 0 ? (
                  <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: p.accent }}>
                    <Text style={{ color: p.onAccent, ...textStyles.caption1, fontWeight: '600' }}>{count > 99 ? '99+' : count}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Chats — flat full-width rows under a hairline, per the approved list. A virtualised list:
          only the rows on (and near) the screen are mounted, however many conversations there are. */}
      {filter === 'groups' ? (
        <ScrollView style={listStyle(p)} contentContainerStyle={listContent}>
          <GroupsPane onOpenChat={openChat} openId={wide ? paneId : null} onLongPressGroup={openActions} />
        </ScrollView>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={convKey}
          renderItem={renderChat}
          style={listStyle(p)}
          contentContainerStyle={listContent}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={9}
          /* Archived — one row into its own screen, with a count of what is still unread in there.
             Under Tasks the row is "Closed task chats" instead. */
          ListHeaderComponent={filter === 'tasks' ? (
            <Pressable onPress={() => router.push('/chat/closed-tasks')} android_ripple={{ color: p.line }}
              className="flex-row items-center gap-3" style={{ minHeight: 56, paddingHorizontal: 20, backgroundColor: p.list }}>
              <ListChecks size={20} color={p.mute} />
              <Text style={{ flex: 1, color: p.text, ...textStyles.headline }}>Closed task chats</Text>
              {closedTaskChats ? <Text style={{ color: p.mute, ...textStyles.subheadline }}>{closedTaskChats}</Text> : null}
            </Pressable>
          ) : hasArchived ? (
            <Pressable onPress={() => router.push('/chat/archived')} android_ripple={{ color: p.line }}
              className="flex-row items-center gap-3" style={{ minHeight: 56, paddingHorizontal: 20, backgroundColor: p.list }}>
              <Archive size={20} color={p.mute} />
              <Text style={{ flex: 1, color: p.text, ...textStyles.headline }}>Archived</Text>
              {/* A badge, not bare accent text: accent on the canvas is only 3.8:1 on Eclipse. */}
              {archivedCount ? (
                <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: p.onAccent, ...textStyles.caption1, fontWeight: '600' }}>{archivedCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : undefined}
          ListEmptyComponent={(
            <View className="items-center justify-center" style={{ flex: 1, paddingHorizontal: 32, paddingVertical: 48 }}>
              <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: p.rowUnread, alignItems: 'center', justifyContent: 'center' }}>
                <MessageCircle size={50} color={p.accent} />
              </View>
              <Text style={{ color: p.text, ...textStyles.title3, marginTop: 20 }}>{filter === 'unread' ? 'No unread chats' : filter === 'tasks' ? 'No task chats' : 'No conversations'}</Text>
              <Text style={{ color: p.mute, ...textStyles.subheadline, marginTop: 6, textAlign: 'center' }}>{filter === 'tasks' ? 'Every task has its own chat — it appears here when the task is given.' : 'Your conversations will appear here.'}</Text>
              <Pressable onPress={() => router.push('/chat/search')} className="flex-row items-center gap-2" style={{ marginTop: 24, height: 50, paddingHorizontal: 24, borderRadius: 999, backgroundColor: p.accent }}>
                <Plus size={20} color={p.onAccent} />
                <Text style={{ color: p.onAccent, ...textStyles.headline }}>Start new chat</Text>
              </Pressable>
            </View>
          )}
        />
      )}

      <ChatActionsSheet conv={actionsFor?.conv ?? null} at={actionsFor?.at} onClose={() => setActionsFor(null)} />

      {/* Toast is mounted app-wide in app/_layout.tsx (GlobalToast) — not here. */}
    </SafeAreaView>
  );

  // Wide window: the list and the open chat side by side, split on the fold (ChatSplit).
  return <ChatSplit list={listColumn} />;
}

const listStyle = (p: ChatListPalette) => ({ flex: 1, backgroundColor: p.list, borderTopWidth: 1, borderTopColor: p.line });
const listContent = { paddingBottom: 16, flexGrow: 1 };

// Segmented control: a sunken track in the search field's colour, the picked segment a raised thumb.
// On a dark theme the bar is darker than the field, so the thumb is the field lifted toward white.
const segTrack = { height: 38, borderRadius: 12, padding: 3, gap: 2 };
// minWidth 0 + overflow hidden: in a narrow list (two panes) a tab's label shrinks instead of pushing
// its count into the next tab (seen on the Duo opened: "Unread 2Groups 2").
const seg = { flex: 1, minWidth: 0, overflow: 'hidden' as const, borderRadius: 9, gap: 4, paddingHorizontal: 4 };
const segOn = (p: ChatListPalette) => ({
  backgroundColor: p.dark ? mixHex(p.field, '#FFFFFF', 0.08) : p.bar,
  shadowColor: '#101519', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1,
});

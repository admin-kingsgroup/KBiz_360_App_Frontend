import { memo, useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, FlatList, type ListRenderItem } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { Search, Plus, MessageCircle, Mic, Archive } from 'lucide-react-native';
import { ChatListItem, ChatActionsSheet } from '../../src/components/chat';
import { HomeHeader, GroupsPane } from '../../src/components/home';
import { colors, useChatListPalette, type ChatListPalette } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useDirectoryStore } from '../../src/store/directoryStore';
import type { ChatConversation } from '../../src/api/chat';
import { mediaUrl } from '../../src/api/media';
import { oneLine } from '../../src/logic/text';
import { relTime } from '../../src/utils/time';

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
) {
  const last = c.lastMessage;
  return {
    id: c.id,
    name: c.name,
    initials: (c.name[0] ?? '?').toUpperCase(),
    color: c.type === 'group' ? colors.purple : colors.blue,
    preview: last ? (last.type === 'text' ? oneLine(last.text) : `[${last.type}]`) : 'No messages yet',
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
const ChatRow = memo(function ChatRow({ conv, online, myUserId, branchCode, companyCode, draft, onOpen, onActions }: {
  conv: ChatConversation; online: boolean; myUserId: string | null; branchCode: string | null; companyCode: string | null;
  draft?: string; onOpen: (id: string) => void; onActions: (id: string) => void;
}) {
  const id = conv.id;
  const press = useCallback(() => onOpen(id), [onOpen, id]);
  const longPress = useCallback(() => onActions(id), [onActions, id]);
  return <ChatListItem chat={convToItem(conv, online, myUserId, branchCode, companyCode, draft)} onPress={press} onLongPress={longPress} />;
});

const convKey = (c: ChatConversation): string => c.id;

// Home — Chats tab: one WhatsApp-style list of direct chats AND groups. Groups also have their own
// chip here — the branch-organised list that used to be the Groups bottom tab (that slot is now
// Alerts); in All/Unread they simply ride the recency list.
// The DM list is NOT access-filtered and not affected by View-As — faithful to source (see Phase 5
// report); groups come from the same store, which the backend already membership-scopes.
type ChatFilter = 'all' | 'unread' | 'groups';

export default function Home() {
  const router = useRouter();
  // Filter chips (client-side): All / Unread / Groups — the approved chip row. Unread = every chat
  // with unread (direct or group); Groups = every group, filed by business -> branch (GroupsPane).
  const [filter, setFilter] = useState<ChatFilter>('all');
  const realUser = useAuthStore((s) => s.user);
  // The whole list wears the GLOBAL chat theme (Profile -> Chat theme), like the chats it opens.
  const p = useChatListPalette();
  // A dark theme (Midnight) needs light status-bar content while this tab is in front; hand the
  // app default back on blur so the other tabs are unaffected.
  useFocusEffect(useCallback(() => {
    setStatusBarStyle(p.dark ? 'light' : 'dark');
    return () => setStatusBarStyle('dark');
  }, [p.dark]));

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
  // Long-pressed row -> the mute/pin/archive sheet.
  const [actionsFor, setActionsFor] = useState<ChatConversation | null>(null);
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
  const { visible, archivedCount, hasArchived, unreadChats, unreadGroupChats } = useMemo(() => {
    const active = conversations.filter((c) => !c.archived && (c.type === 'group' || !!c.lastMessage));
    // Pinned chats sit above everything else, in their own recency order — the list is already sorted
    // by activity, so a stable partition is all that is needed.
    // Groups renders GroupsPane instead of this list, so only All/Unread filter it.
    const filtered = filter === 'unread' ? active.filter((c) => c.unread > 0) : active;
    return {
      visible: [...filtered.filter((c) => c.pinned), ...filtered.filter((c) => !c.pinned)],
      archivedCount: conversations.filter((c) => c.archived && c.unread > 0).length,
      hasArchived: conversations.some((c) => c.archived),
      // Chip badges — number of CHATS with unread, not messages: the badge unit everywhere.
      unreadChats: active.filter((c) => c.unread > 0).length,
      unreadGroupChats: active.filter((c) => c.type === 'group' && c.unread > 0).length,
    };
  }, [conversations, filter]);
  void realUser;

  // Stable row handlers (rows are memoised — a fresh closure per render would repaint every row).
  const openChat = useCallback((id: string) => router.push({ pathname: '/chat/[id]', params: { id } }), [router]);
  const openActions = useCallback((id: string) => setActionsFor(useMessagingStore.getState().conversations.find((c) => c.id === id) ?? null), []);
  const renderChat: ListRenderItem<ChatConversation> = useCallback(({ item: c }) => {
    // Live presence beats the conversation's stale `online` snapshot; the snapshot only fills in when
    // no live entry has arrived at all.
    const live = c.type === 'direct' ? presence[c.otherUserId ?? ''] : undefined;
    const online = c.type === 'direct' ? (live ? live.status === 'online' : !!c.online) : false;
    return (
      <ChatRow conv={c} online={online} myUserId={myUserId}
        branchCode={(c.branchId && codes.branch.get(c.branchId)) || null}
        companyCode={(c.companyId && codes.company.get(c.companyId)) || null}
        draft={drafts[c.id]} onOpen={openChat} onActions={openActions} />
    );
  }, [presence, myUserId, codes, drafts, openChat, openActions]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bar }} edges={['top']}>
      <HomeHeader title="Chats" palette={p} />

      {/* Search — a grey field that opens the search screen, with voice as its own button beside it
          (the approved header row), so the mic is a full 44px target rather than an inset glyph. */}
      <View className="flex-row" style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 10 }}>
        <Pressable onPress={() => router.push('/chat/search')} className="flex-row items-center" style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: p.field, paddingHorizontal: 14, gap: 10 }}>
          <Search size={18} color={p.mute} strokeWidth={2} />
          <Text numberOfLines={1} style={{ color: p.mute, fontSize: 15, flex: 1 }}>Search chats, people, tickets</Text>
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/chat/search', params: { voice: '1' } })}
          accessibilityRole="button" accessibilityLabel="Voice search"
          style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: p.field, alignItems: 'center', justifyContent: 'center' }}>
          <Mic size={18} color={p.mute} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Filter chips — All / Unread / Groups. Selected is a solid green pill; the rest are outlined,
          so the row reads as one control instead of three grey blocks. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}>
        {([['all', 'All', 0], ['unread', 'Unread', unreadChats], ['groups', 'Groups', unreadGroupChats]] as const).map(([k, label, count]) => {
          const on = filter === k;
          return (
            <Pressable key={k} onPress={() => setFilter(k)} className="flex-row items-center"
              accessibilityRole="button" accessibilityState={{ selected: on }}
              style={[chip, on ? chipOn(p) : chipOff(p)]}>
              <Text style={{ color: on ? p.onAccent : p.text, fontSize: 13, fontWeight: on ? '700' : '600' }}>{label}</Text>
              {count > 0 ? (
                <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? p.onAccent : p.accent }}>
                  <Text style={{ color: on ? p.accent : p.onAccent, fontSize: 11, fontWeight: '700' }}>{count > 99 ? '99+' : count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Chats — flat full-width rows under a hairline, per the approved list. A virtualised list:
          only the rows on (and near) the screen are mounted, however many conversations there are. */}
      {filter === 'groups' ? (
        <ScrollView style={listStyle(p)} contentContainerStyle={listContent}>
          <GroupsPane onLongPressGroup={openActions} />
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
          /* Archived — one row into its own screen, with a count of what is still unread in there. */
          ListHeaderComponent={hasArchived ? (
            <Pressable onPress={() => router.push('/chat/archived')} android_ripple={{ color: p.line }}
              className="flex-row items-center gap-3" style={{ minHeight: 56, paddingHorizontal: 20, backgroundColor: p.list }}>
              <Archive size={20} color={p.mute} />
              <Text style={{ flex: 1, color: p.text, fontSize: 15, fontWeight: '600' }}>Archived</Text>
              {/* A badge, not bare accent text: accent on the canvas is only 3.8:1 on Eclipse. */}
              {archivedCount ? (
                <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: p.onAccent, fontSize: 11, fontWeight: '700' }}>{archivedCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          ListEmptyComponent={(
            <View className="items-center justify-center" style={{ flex: 1, paddingHorizontal: 32, paddingVertical: 48 }}>
              <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: p.rowUnread, alignItems: 'center', justifyContent: 'center' }}>
                <MessageCircle size={50} color={p.accent} />
              </View>
              <Text style={{ color: p.text, fontSize: 20, fontWeight: '700', marginTop: 20 }}>{filter === 'unread' ? 'No unread chats' : 'No conversations'}</Text>
              <Text style={{ color: p.mute, fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>Your conversations will appear here.</Text>
              <Pressable onPress={() => router.push('/chat/search')} className="flex-row items-center gap-2" style={{ marginTop: 24, height: 50, paddingHorizontal: 24, borderRadius: 999, backgroundColor: p.accent }}>
                <Plus size={20} color={p.onAccent} />
                <Text style={{ color: p.onAccent, fontSize: 15, fontWeight: '600' }}>Start new chat</Text>
              </Pressable>
            </View>
          )}
        />
      )}

      <ChatActionsSheet conv={actionsFor} onClose={() => setActionsFor(null)} />

      {/* Toast is mounted app-wide in app/_layout.tsx (GlobalToast) — not here. */}
    </SafeAreaView>
  );
}

const listStyle = (p: ChatListPalette) => ({ flex: 1, backgroundColor: p.list, borderTopWidth: 1, borderTopColor: p.line });
const listContent = { paddingBottom: 16, flexGrow: 1 };

// 34px filter chip (approved dimensions): selected = solid theme accent, the rest outlined.
const chip = { height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6 };
const chipOn = (p: ChatListPalette) => ({ backgroundColor: p.accent, borderWidth: 1, borderColor: p.accent });
const chipOff = (p: ChatListPalette) => ({ backgroundColor: p.bar, borderWidth: 1, borderColor: p.line });

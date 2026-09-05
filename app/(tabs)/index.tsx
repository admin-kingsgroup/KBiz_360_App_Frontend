import { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Search, Plus, MessageCircle, Mic, Archive } from 'lucide-react-native';
import { ChatListItem, ChatActionsSheet } from '../../src/components/chat';
import { HomeHeader } from '../../src/components/home';
import { colors } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import type { ChatConversation } from '../../src/api/chat';
import { mediaUrl } from '../../src/api/media';
import { oneLine } from '../../src/logic/text';
import type { PresenceInfo } from '../../src/store/messagingStore';

// Map a real conversation → the row shape ChatListItem renders.
const relTime = (iso: string): string => {
  const d = new Date(iso); const now = new Date();
  return d.toDateString() === now.toDateString()
    ? `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    : `${d.getDate()}/${d.getMonth() + 1}`;
};
function convToItem(c: ChatConversation, presence: Record<string, PresenceInfo>, myUserId: string | null, draft?: string) {
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
  };
}

// Home — Chats tab: one WhatsApp-style list of direct chats AND groups. The Groups tab still hosts
// the branch-organised Groups/Departments/Alerts panes; here groups simply ride the recency list.
// The DM list is NOT access-filtered and not affected by View-As — faithful to source (see Phase 5
// report); groups come from the same store, which the backend already membership-scopes.
type ChatFilter = 'all' | 'unread' | 'groups';

export default function Home() {
  const router = useRouter();
  // Filter chips (client-side): All / Unread / Groups — WhatsApp's chip row. Groups floats unread
  // groups to the top so the chip doubles as "show me the unread group messages".
  const [filter, setFilter] = useState<ChatFilter>('all');
  const realUser = useAuthStore((s) => s.user);

  // Real conversations from the messaging store. Refetch every time Home gains focus so the list is
  // always current (new chats from elsewhere, reads, the post-reset clean slate) — not just on mount.
  const conversations = useMessagingStore((s) => s.conversations);
  const presence = useMessagingStore((s) => s.presence);
  const myUserId = useMessagingStore((s) => s.myUserId);
  const drafts = useMessagingStore((s) => s.drafts);
  // Long-pressed row → the mute/pin/archive sheet.
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
  const active = conversations.filter((c) => !c.archived && (c.type === 'group' || !!c.lastMessage));
  const archivedCount = conversations.filter((c) => c.archived && c.unread > 0).length;
  const hasArchived = conversations.some((c) => c.archived);
  // Chip badge — number of GROUPS with unread (chats, not messages: the badge unit everywhere).
  const unreadGroupChats = active.filter((c) => c.type === 'group' && c.unread > 0).length;
  // Pinned chats sit above everything else, in their own recency order — the list is already sorted
  // by activity, so a stable partition is all that is needed.
  const filtered = filter === 'groups' ? active.filter((c) => c.type === 'group')
    : filter === 'unread' ? active.filter((c) => c.unread > 0)
    : active;
  const pinnedFirst = [...filtered.filter((c) => c.pinned), ...filtered.filter((c) => !c.pinned)];
  // Groups chip: unread groups float above read ones (each side keeps its pinned-first order).
  const ordered = filter === 'groups'
    ? [...pinnedFirst.filter((c) => c.unread > 0), ...pinnedFirst.filter((c) => c.unread === 0)]
    : pinnedFirst;
  void realUser;
  const visible = ordered.map((c) => convToItem(c, presence, myUserId, drafts[c.id]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      <HomeHeader />

      {/* Search bar — grey pill (mockup), whole bar opens the search screen (people + chat messages). */}
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

      {/* Filter chips — All / Unread / Groups (WhatsApp's chip row; business pills live on the
          Groups tab). The Groups chip carries the count of groups with unread. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
        {([['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups']] as const).map(([k, label]) => {
          const on = filter === k;
          return (
            <Pressable key={k} onPress={() => setFilter(k)} className="flex-row items-center" style={[chip, { gap: 6, backgroundColor: on ? colors.primary : colors.coolMuted }]}>
              <Text style={{ color: on ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>{label}</Text>
              {k === 'groups' && unreadGroupChats > 0 ? (
                <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#fff' : colors.primary }}>
                  <Text style={{ color: on ? colors.primary : '#fff', fontSize: 10.5, fontWeight: '700' }}>{unreadGroupChats}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Chats — flat full-width white rows on the cool canvas (mockup list), flush under the chips */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}>
        {/* Archived — one row into its own screen, with a count of what is still unread in there. */}
        {hasArchived ? (
          <Pressable onPress={() => router.push('/chat/archived')} android_ripple={{ color: colors.coolMuted }}
            className="flex-row items-center gap-3 px-4" style={{ minHeight: 56, backgroundColor: colors.card }}>
            <Archive size={20} color={colors.coolText} />
            <Text style={{ flex: 1, color: colors.ink, fontSize: 15, fontWeight: '600' }}>Archived</Text>
            {archivedCount ? <Text style={{ color: colors.primary, fontSize: 12.5, fontWeight: '700' }}>{archivedCount}</Text> : null}
          </Pressable>
        ) : null}
        {visible.length === 0 ? (
          <View className="items-center justify-center" style={{ flex: 1, paddingHorizontal: 32, paddingVertical: 48 }}>
            <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <MessageCircle size={50} color={colors.primary} />
            </View>
            <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700', marginTop: 20 }}>{filter === 'unread' ? 'No unread chats' : filter === 'groups' ? 'No groups' : 'No conversations'}</Text>
            <Text style={{ color: colors.coolText, fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>Your conversations will appear here.</Text>
            <Pressable onPress={() => router.push('/chat/search')} className="flex-row items-center gap-2" style={{ marginTop: 24, height: 50, paddingHorizontal: 24, borderRadius: 999, backgroundColor: colors.primary }}>
              <Plus size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Start new chat</Text>
            </Pressable>
          </View>
        ) : (
          visible.map((c, i) => (
            <ChatListItem key={c.id} chat={c} topDivider={i > 0}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
              onLongPress={() => setActionsFor(conversations.find((x) => x.id === c.id) ?? null)} />
          ))
        )}
      </ScrollView>

      <ChatActionsSheet conv={actionsFor} onClose={() => setActionsFor(null)} />

      {/* Toast is mounted app-wide in app/_layout.tsx (GlobalToast) — not here. */}
    </SafeAreaView>
  );
}

// 34px filter chip (mockup dimensions).
const chip = { height: 34, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const };

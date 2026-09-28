import { useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Search, Plus, MessageCircle, Mic, Archive } from 'lucide-react-native';
import { ChatListItem, ChatActionsSheet } from '../../src/components/chat';
import { HomeHeader, GroupsPane } from '../../src/components/home';
import { colors } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useDirectoryStore } from '../../src/store/directoryStore';
import type { ChatConversation } from '../../src/api/chat';
import { mediaUrl } from '../../src/api/media';
import { oneLine } from '../../src/logic/text';
import { relTime } from '../../src/utils/time';
import type { PresenceInfo } from '../../src/store/messagingStore';

// Media types whose preview gets the small image glyph in the approved row.
const PICTORIAL = new Set(['image', 'video']);

// Map a real conversation → the row shape ChatListItem renders. `codes` resolves the conversation's
// branch/business id to the short code the tile shows (chatTile.ts picks which one wins).
function convToItem(
  c: ChatConversation,
  presence: Record<string, PresenceInfo>,
  myUserId: string | null,
  codes: { branch: Map<string, string>; company: Map<string, string> },
  draft?: string,
) {
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
    branchCode: (c.branchId && codes.branch.get(c.branchId)) || null,
    companyCode: (c.companyId && codes.company.get(c.companyId)) || null,
    isImage: !!last && PICTORIAL.has(last.type),
  };
}

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
  const active = conversations.filter((c) => !c.archived && (c.type === 'group' || !!c.lastMessage));
  const archivedCount = conversations.filter((c) => c.archived && c.unread > 0).length;
  const hasArchived = conversations.some((c) => c.archived);
  // Chip badges — number of CHATS with unread, not messages: the badge unit everywhere.
  const unreadChats = active.filter((c) => c.unread > 0).length;
  const unreadGroupChats = active.filter((c) => c.type === 'group' && c.unread > 0).length;
  // Pinned chats sit above everything else, in their own recency order — the list is already sorted
  // by activity, so a stable partition is all that is needed.
  // Groups renders GroupsPane instead of this list, so only All/Unread filter it.
  const filtered = filter === 'unread' ? active.filter((c) => c.unread > 0) : active;
  const pinnedFirst = [...filtered.filter((c) => c.pinned), ...filtered.filter((c) => !c.pinned)];
  void realUser;
  const visible = pinnedFirst.map((c) => convToItem(c, presence, myUserId, codes, drafts[c.id]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <HomeHeader title="Chats" />

      {/* Search — a grey field that opens the search screen, with voice as its own button beside it
          (the approved header row), so the mic is a full 44px target rather than an inset glyph. */}
      <View className="flex-row" style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 10 }}>
        <Pressable onPress={() => router.push('/chat/search')} className="flex-row items-center" style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.coolMuted, paddingHorizontal: 14, gap: 10 }}>
          <Search size={18} color={colors.coolText} strokeWidth={2} />
          <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 15, flex: 1 }}>Search chats, people, tickets</Text>
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/chat/search', params: { voice: '1' } })}
          accessibilityRole="button" accessibilityLabel="Voice search"
          style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.coolMuted, alignItems: 'center', justifyContent: 'center' }}>
          <Mic size={18} color={colors.coolText} strokeWidth={2} />
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
              style={[chip, on ? chipOn : chipOff]}>
              <Text style={{ color: on ? '#fff' : colors.textBody, fontSize: 13, fontWeight: on ? '700' : '600' }}>{label}</Text>
              {count > 0 ? (
                <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#fff' : colors.primary }}>
                  <Text style={{ color: on ? colors.primary : '#fff', fontSize: 11, fontWeight: '700' }}>{count > 99 ? '99+' : count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Chats — flat full-width rows under a hairline, per the approved list */}
      <ScrollView style={{ flex: 1, borderTopWidth: 1, borderTopColor: colors.coolMuted }} contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}>
        {filter === 'groups' ? (
          <GroupsPane onLongPressGroup={(id) => setActionsFor(conversations.find((c) => c.id === id) ?? null)} />
        ) : (
          <>
          {/* Archived — one row into its own screen, with a count of what is still unread in there. */}
          {hasArchived ? (
            <Pressable onPress={() => router.push('/chat/archived')} android_ripple={{ color: colors.coolMuted }}
              className="flex-row items-center gap-3" style={{ minHeight: 56, paddingHorizontal: 20, backgroundColor: colors.card }}>
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
              <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700', marginTop: 20 }}>{filter === 'unread' ? 'No unread chats' : 'No conversations'}</Text>
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
          </>
        )}
      </ScrollView>

      <ChatActionsSheet conv={actionsFor} onClose={() => setActionsFor(null)} />

      {/* Toast is mounted app-wide in app/_layout.tsx (GlobalToast) — not here. */}
    </SafeAreaView>
  );
}

// 34px filter chip (approved dimensions): selected = solid green, the rest outlined.
const chip = { height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6 };
const chipOn = { backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primary };
const chipOff = { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong };

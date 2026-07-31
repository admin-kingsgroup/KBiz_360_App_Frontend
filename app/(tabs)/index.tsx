import { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Search, Plus, MessageCircle, Mic } from 'lucide-react-native';
import { ChatListItem } from '../../src/components/chat';
import { HomeHeader } from '../../src/components/home';
import { colors } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import type { ChatConversation } from '../../src/api/chat';
import { mediaUrl } from '../../src/api/media';
import type { PresenceInfo } from '../../src/store/messagingStore';

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

// Home — Chats tab: direct (1:1) conversations ONLY. Groups, Departments and System Alerts live in
// the Groups tab (app/(tabs)/groups.tsx). The DM list is NOT access-filtered and not affected by
// View-As — faithful to source (see Phase 5 report).
export default function Home() {
  const router = useRouter();
  // "Unread" filter chip (client-side; mirrors the mockup's chips row).
  const [unreadOnly, setUnreadOnly] = useState(false);
  const realUser = useAuthStore((s) => s.user);

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
  // Show a direct chat only once it has a message (so tapping a person to "open" a chat without
  // sending anything doesn't leave an empty conversation in the list).
  const chats = conversations.filter((c) => c.type === 'direct' && !!c.lastMessage).map((c) => convToItem(c, presence, myUserId));
  void realUser;
  const visible = unreadOnly ? chats.filter((c) => c.unread > 0) : chats;

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

      {/* Filter chips — plain All / Unread (the DM list isn't business-scoped, so business pills
          would be inert here; they live on the Groups tab). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
        <Pressable onPress={() => setUnreadOnly(false)} style={[chip, { backgroundColor: !unreadOnly ? colors.primary : colors.coolMuted }]}>
          <Text style={{ color: !unreadOnly ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>All</Text>
        </Pressable>
        <Pressable onPress={() => setUnreadOnly(true)} style={[chip, { backgroundColor: unreadOnly ? colors.primary : colors.coolMuted }]}>
          <Text style={{ color: unreadOnly ? '#fff' : colors.coolText, fontSize: 13, fontWeight: '600' }}>Unread</Text>
        </Pressable>
      </ScrollView>

      {/* Chats — flat full-width white rows on the cool canvas (mockup list), flush under the chips */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}>
        {visible.length === 0 ? (
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
          visible.map((c, i) => (
            <ChatListItem key={c.id} chat={c} topDivider={i > 0} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })} />
          ))
        )}
      </ScrollView>

      {/* Toast is mounted app-wide in app/_layout.tsx (GlobalToast) — not here. */}
    </SafeAreaView>
  );
}

// 34px filter chip (mockup dimensions).
const chip = { height: 34, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const };

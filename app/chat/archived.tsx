import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Archive } from 'lucide-react-native';
import { ChatListItem, ChatActionsSheet } from '../../src/components/chat';
import { colors } from '../../src/theme';
import { oneLine } from '../../src/logic/text';
import { useMessagingStore } from '../../src/store/messagingStore';
import { mediaUrl } from '../../src/api/media';
import type { ChatConversation } from '../../src/api/chat';

// Archived chats — out of the main list but not gone, exactly like WhatsApp's archive. They keep
// receiving messages silently; long-press unarchives (or mutes/pins) through the same sheet.

const relTime = (iso: string): string => {
  const d = new Date(iso); const now = new Date();
  return d.toDateString() === now.toDateString()
    ? `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    : `${d.getDate()}/${d.getMonth() + 1}`;
};

export default function ArchivedChats() {
  const router = useRouter();
  const conversations = useMessagingStore((s) => s.conversations);
  const drafts = useMessagingStore((s) => s.drafts);
  const myUserId = useMessagingStore((s) => s.myUserId);
  const [actionsFor, setActionsFor] = useState<ChatConversation | null>(null);

  const archived = conversations.filter((c) => c.archived);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      <View className="flex-row items-center gap-2 px-2" style={{ backgroundColor: colors.card, height: 56, borderBottomColor: colors.coolDivider, borderBottomWidth: StyleSheet.hairlineWidth }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' }}>Archived</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}>
        {archived.length === 0 ? (
          <View className="items-center justify-center" style={{ flex: 1, paddingHorizontal: 32 }}>
            <Archive size={44} color={colors.coolText3} />
            <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700', marginTop: 14 }}>No archived chats</Text>
            <Text style={{ color: colors.coolText, fontSize: 13.5, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
              Long-press any chat and choose Archive to move it here. It keeps receiving messages quietly.
            </Text>
          </View>
        ) : archived.map((c, i) => (
          <ChatListItem
            key={c.id}
            topDivider={i > 0}
            chat={{
              id: c.id,
              name: c.name,
              initials: (c.name[0] ?? '?').toUpperCase(),
              color: c.type === 'group' ? colors.purple : colors.blue,
              preview: c.lastMessage ? (c.lastMessage.type === 'text' ? oneLine(c.lastMessage.text) : `[${c.lastMessage.type}]`) : 'No messages yet',
              time: c.lastActivityAt ? relTime(c.lastActivityAt) : '',
              ts: c.lastActivityAt ? new Date(c.lastActivityAt).getTime() : 0,
              unread: c.unread,
              online: false,
              image: c.image ? mediaUrl(c.image) : null,
              lastStatus: c.lastMessage && myUserId && c.lastMessage.senderId === myUserId ? c.lastMessage.status ?? null : null,
              muted: !!c.muted,
              pinned: !!c.pinned,
              draft: drafts[c.id] ?? null,
            }}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
            onLongPress={() => setActionsFor(c)}
          />
        ))}
      </ScrollView>

      <ChatActionsSheet conv={actionsFor} onClose={() => setActionsFor(null)} />
    </SafeAreaView>
  );
}

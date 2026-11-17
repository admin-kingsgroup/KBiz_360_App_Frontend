import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { ChevronLeft, ListChecks, Search } from 'lucide-react-native';
import { ChatListItem, ChatActionsSheet } from '../../src/components/chat';
import { anchorOfPress, type AnchorRect } from '../../src/components/ui/AnchoredMenu';
import { ChatSplit, useOpenChat } from '../../src/components/layout/ChatSplit';
import { useWideLayout } from '../../src/hooks/useWideLayout';
import { useChatPaneStore } from '../../src/store/chatPaneStore';
import { colors, useChatListPalette } from '../../src/theme';
import { oneLine } from '../../src/logic/text';
import { isClosedTaskChat } from '../../src/logic/taskGroups';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useTasksStore } from '../../src/store/tasksStore';
import { mediaUrl } from '../../src/api/media';
import type { ChatConversation } from '../../src/api/chat';

// Closed task chats (spec 2026-11-16, section 5): the chats of tasks that were closed or cancelled.
// They leave the active list but are kept for good, searchable — and, by the owner's decision, they
// never lock: anyone in them can still write (a message does not reopen the task).

const relTime = (iso: string): string => {
  const d = new Date(iso); const now = new Date();
  return d.toDateString() === now.toDateString()
    ? `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    : `${d.getDate()}/${d.getMonth() + 1}`;
};

export default function ClosedTaskChats() {
  const router = useRouter();
  const p = useChatListPalette();
  useFocusEffect(useCallback(() => {
    setStatusBarStyle(p.dark ? 'light' : 'dark');
    void useTasksStore.getState().loadClosedStatuses(true); // which task chats are closed
    return () => setStatusBarStyle('dark');
  }, [p.dark]));
  const conversations = useMessagingStore((s) => s.conversations);
  const drafts = useMessagingStore((s) => s.drafts);
  const myUserId = useMessagingStore((s) => s.myUserId);
  const statuses = useTasksStore((s) => s.statusById);
  const [q, setQ] = useState('');
  // A tap opens the chat beside this list on a wide window, as its own screen otherwise.
  const openChat = useOpenChat();
  const wide = useWideLayout();
  const paneId = useChatPaneStore((s) => s.openId); // marked in the list, as on the Chats tab
  const [actionsFor, setActionsFor] = useState<{ conv: ChatConversation; at: AnchorRect } | null>(null);

  const closed = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return conversations.filter((c) => isClosedTaskChat(c, statuses) && (!needle || c.name.toLowerCase().includes(needle)));
  }, [conversations, statuses, q]);

  const list = (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bar }} edges={['top']}>
      <View className="flex-row items-center gap-2 px-2" style={{ backgroundColor: p.bar, height: 56, borderBottomColor: p.line, borderBottomWidth: StyleSheet.hairlineWidth }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={24} color={p.text} />
        </Pressable>
        <Text style={{ flex: 1, color: p.text, fontSize: 17, fontWeight: '700' }}>Closed task chats</Text>
      </View>
      <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: p.bar }}>
        <View className="flex-row items-center" style={{ height: 40, borderRadius: 12, backgroundColor: p.field, paddingHorizontal: 12, gap: 8 }}>
          <Search size={16} color={p.mute} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search closed task chats" placeholderTextColor={p.mute} style={{ flex: 1, color: p.text, fontSize: 14.5 }} />
        </View>
      </View>

      <ScrollView style={{ backgroundColor: p.list }} contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}>
        {closed.length === 0 ? (
          <View className="items-center justify-center" style={{ flex: 1, paddingHorizontal: 32 }}>
            <ListChecks size={44} color={p.mute} />
            <Text style={{ color: p.text, fontSize: 17, fontWeight: '700', marginTop: 14 }}>{q ? 'No closed task chat matches' : 'No closed task chats'}</Text>
            <Text style={{ color: p.mute, fontSize: 13.5, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
              When a task is closed or cancelled, its chat moves here. Everything in it is kept, and you can still write in it.
            </Text>
          </View>
        ) : closed.map((c) => (
          <ChatListItem
            key={c.id}
            chat={{
              id: c.id,
              name: c.name,
              initials: (c.name[0] ?? '?').toUpperCase(),
              color: colors.teal,
              preview: c.lastMessage ? (c.lastMessage.type === 'text' || c.lastMessage.type === 'system' ? oneLine(c.lastMessage.text) : `[${c.lastMessage.type}]`) : 'No messages yet',
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
            selected={wide && c.id === paneId}
            onPress={() => openChat(c.id)}
            onLongPress={(e) => { void anchorOfPress(e, { atFinger: true }).then((at) => setActionsFor({ conv: c, at })); }}
          />
        ))}
      </ScrollView>

      <ChatActionsSheet conv={actionsFor?.conv ?? null} at={actionsFor?.at} onClose={() => setActionsFor(null)} />
    </SafeAreaView>
  );
  // Wide window (the iPhone Duo opened): this list on the left, the chat it opens on the right.
  return <ChatSplit list={list} />;
}

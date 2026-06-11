import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Star } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { starredMessages, type ChatMessage } from '../../src/api/chat';
import { listUsers, toUser } from '../../src/api/directory';

const hhmm = (iso: string): string => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; };

// All starred messages across conversations.
export default function StarredMessages() {
  const router = useRouter();
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const conversations = useMessagingStore((s) => s.conversations);
  const users = useAccessStore((s) => s.users);

  useEffect(() => {
    if (users.length === 0) listUsers().then((l) => useAccessStore.getState().setUsers(l.map(toUser))).catch(() => undefined);
    starredMessages().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, [users.length]);

  const convName = (id: string): string => conversations.find((c) => c.id === id)?.name ?? 'Conversation';
  const userName = (id: string): string => users.find((u) => u.id === id)?.name ?? 'Member';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ backgroundColor: '#fff', borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View className="flex-row items-center gap-2">
          <Star size={16} color={colors.orange} />
          <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600' }}>Starred messages</Text>
        </View>
      </View>

      {loading ? (
        <View className="items-center" style={{ paddingVertical: 48 }}><ActivityIndicator color={colors.ink} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          ListEmptyComponent={<View className="items-center" style={{ paddingVertical: 56 }}><Star size={26} color={colors.textMuted2} /><Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 10 }}>No starred messages</Text><Text style={{ color: colors.textMuted2, fontSize: 11, marginTop: 4 }}>Long-press a message → Star</Text></View>}
          renderItem={({ item: m }) => (
            <Pressable onPress={() => router.push({ pathname: '/chat/[id]', params: { id: m.conversationId } })} style={{ backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 14, padding: 12 }}>
              <View className="flex-row justify-between items-baseline">
                <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 12.5, fontWeight: '800', flex: 1 }}>{convName(m.conversationId)}</Text>
                <Text style={{ color: colors.textMuted2, fontSize: 9.5, fontWeight: '700' }}>{hhmm(m.createdAt)}</Text>
              </View>
              <Text style={{ color: colors.purple, fontSize: 10.5, fontWeight: '700', marginTop: 2 }}>{userName(m.senderId)}</Text>
              <Text numberOfLines={2} style={{ color: colors.warmMute, fontSize: 12, marginTop: 2 }}>{m.text || `[${m.type}]`}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

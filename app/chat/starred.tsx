import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Star } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { starredMessages, type ChatMessage } from '../../src/api/chat';
import { refreshDirectoryUsers } from '../../src/store/directoryStore';

const hhmm = (iso: string): string => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; };

// All starred messages across conversations.
export default function StarredMessages() {
  const router = useRouter();
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const conversations = useMessagingStore((s) => s.conversations);
  const users = useAccessStore((s) => s.users);

  useEffect(() => {
    void refreshDirectoryUsers(); // throttled — names stay current without an app restart
    starredMessages().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  const convName = (id: string): string => conversations.find((c) => c.id === id)?.name ?? 'Conversation';
  const userName = (id: string): string => users.find((u) => u.id === id)?.name ?? 'Member';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-2" style={{ backgroundColor: colors.card, minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-row items-center gap-2">
          <Star size={18} color={colors.orange} fill={colors.orange} />
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Starred messages</Text>
        </View>
      </View>

      {loading ? (
        <View className="items-center" style={{ paddingVertical: 48 }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          ListEmptyComponent={<View className="items-center" style={{ paddingVertical: 56 }}><View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Star size={40} color={colors.primary} /></View><Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 16 }}>No starred messages</Text><Text style={{ color: colors.coolText, fontSize: 13, marginTop: 5 }}>Long-press a message → Star</Text></View>}
          renderItem={({ item: m }) => (
            <Pressable onPress={() => router.push({ pathname: '/chat/[id]', params: { id: m.conversationId, messageId: m.id } })} android_ripple={{ color: colors.coolMuted }} style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 16, padding: 14 }}>
              <View className="flex-row justify-between items-baseline gap-2">
                <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: '600', flex: 1 }}>{convName(m.conversationId)}</Text>
                <Text style={{ color: colors.coolText3, fontSize: 12, fontWeight: '500' }}>{hhmm(m.createdAt)}</Text>
              </View>
              <Text style={{ color: colors.primary, fontSize: 12.5, fontWeight: '700', marginTop: 2 }}>{userName(m.senderId)}</Text>
              <Text numberOfLines={2} style={{ color: colors.coolText, fontSize: 14, marginTop: 2 }}>{m.text || `[${m.type}]`}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Search as SearchIcon, Star } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { searchMessages, type ChatMessage } from '../../src/api/chat';
import { listUsers, toUser } from '../../src/api/directory';

const hhmm = (iso: string): string => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; };

// Global message search (backed by the Mongo text index, scoped to the user's conversations).
export default function ChatSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const conversations = useMessagingStore((s) => s.conversations);
  const users = useAccessStore((s) => s.users);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (users.length === 0) listUsers().then((l) => useAccessStore.getState().setUsers(l.map(toUser))).catch(() => undefined); }, [users.length]);

  const convName = (id: string): string => conversations.find((c) => c.id === id)?.name ?? 'Conversation';
  const userName = (id: string): string => users.find((u) => u.id === id)?.name ?? 'Member';

  const onChange = (t: string): void => {
    setQ(t);
    if (timer.current) clearTimeout(timer.current);
    if (!t.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try { setResults(await searchMessages(t.trim())); } catch { setResults([]); } finally { setLoading(false); }
    }, 300);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ backgroundColor: '#fff', borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View className="flex-row items-center gap-2 flex-1" style={{ backgroundColor: '#FAFAF7', borderRadius: 18, borderWidth: 1, borderColor: colors.cardEdge, paddingHorizontal: 12 }}>
          <SearchIcon size={15} color={colors.textMuted} />
          <TextInput value={q} onChangeText={onChange} autoFocus placeholder="Search messages" placeholderTextColor={colors.textMuted} style={{ flex: 1, paddingVertical: 9, fontSize: 14, color: colors.ink }} />
        </View>
        <Pressable onPress={() => router.push('/chat/starred')} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><Star size={18} color={colors.ink} /></Pressable>
      </View>

      {loading ? (
        <View className="items-center" style={{ paddingVertical: 40 }}><ActivityIndicator color={colors.ink} /></View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<View className="items-center" style={{ paddingVertical: 48 }}><Text style={{ color: colors.textMuted, fontSize: 12.5 }}>{q.trim() ? 'No messages found' : 'Type to search your messages'}</Text></View>}
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

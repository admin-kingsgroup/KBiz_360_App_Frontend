import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Search as SearchIcon, Star } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useUiStore } from '../../src/store/uiStore';
import { searchMessages, getOrCreateDirect, type ChatMessage } from '../../src/api/chat';
import { listUsers, toUser } from '../../src/api/directory';

const hhmm = (iso: string): string => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; };

// Search: matching PEOPLE (tap to start a chat) + global message search (Mongo text index).
export default function ChatSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const conversations = useMessagingStore((s) => s.conversations);
  const myId = useMessagingStore((s) => s.myUserId);
  const users = useAccessStore((s) => s.users);
  const showToast = useUiStore((s) => s.showToast);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (users.length === 0) listUsers().then((l) => useAccessStore.getState().setUsers(l.map(toUser))).catch(() => undefined); }, [users.length]);

  const convName = (id: string): string => conversations.find((c) => c.id === id)?.name ?? 'Conversation';
  const userName = (id: string): string => users.find((u) => u.id === id)?.name ?? 'Member';

  // People whose name matches the query (excluding myself).
  const people = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return users.filter((u) => u.id !== myId && u.name.toLowerCase().includes(s)).slice(0, 12);
  }, [q, users, myId]);

  const onChange = (t: string): void => {
    setQ(t);
    if (timer.current) clearTimeout(timer.current);
    if (!t.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try { setResults(await searchMessages(t.trim())); } catch { setResults([]); } finally { setLoading(false); }
    }, 300);
  };

  // Open (or create) a direct chat with this person.
  const startChat = async (userId: string): Promise<void> => {
    if (starting) return;
    setStarting(true);
    try {
      const conv = await getOrCreateDirect(userId);
      router.replace({ pathname: '/chat/[id]', params: { id: conv.id } });
    } catch {
      showToast('Could not start chat');
      setStarting(false);
    }
  };

  const noResults = !!q.trim() && !loading && people.length === 0 && results.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ backgroundColor: '#fff', borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View className="flex-row items-center gap-2 flex-1" style={{ backgroundColor: '#FAFAF7', borderRadius: 18, borderWidth: 1, borderColor: colors.cardEdge, paddingHorizontal: 12 }}>
          <SearchIcon size={15} color={colors.textMuted} />
          <TextInput value={q} onChangeText={onChange} autoFocus placeholder="Search people or messages" placeholderTextColor={colors.textMuted} style={{ flex: 1, paddingVertical: 9, fontSize: 14, color: colors.ink }} />
        </View>
        <Pressable onPress={() => router.push('/chat/starred')} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><Star size={18} color={colors.ink} /></Pressable>
      </View>

      <FlatList
        data={results}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          people.length ? (
            <View style={{ marginBottom: 6 }}>
              <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 4, marginBottom: 6 }}>PEOPLE</Text>
              {people.map((u) => (
                <Pressable key={u.id} onPress={() => startChat(u.id)} className="flex-row items-center" style={{ gap: 10, backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 14, padding: 10, marginBottom: 6 }}>
                  <Avatar initials={u.initials} color={u.color} size={36} uri={u.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13.5, fontWeight: '700' }}>{u.name}</Text>
                    {u.scopeLine ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11 }}>{u.scopeLine}</Text> : null}
                  </View>
                  <Text style={{ color: colors.blue, fontSize: 11.5, fontWeight: '800' }}>Message</Text>
                </Pressable>
              ))}
              {results.length || loading ? <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 4, marginTop: 6, marginBottom: 2 }}>MESSAGES</Text> : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View className="items-center" style={{ paddingVertical: 40 }}><ActivityIndicator color={colors.ink} /></View>
          ) : noResults ? (
            <View className="items-center" style={{ paddingVertical: 48 }}><Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No people or messages found</Text></View>
          ) : !q.trim() ? (
            <View className="items-center" style={{ paddingVertical: 48 }}><Text style={{ color: colors.textMuted, fontSize: 12.5 }}>Search people to start a chat, or find messages</Text></View>
          ) : null
        }
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
    </SafeAreaView>
  );
}

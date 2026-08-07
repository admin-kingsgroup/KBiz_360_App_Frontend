import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Search as SearchIcon, Star, Mic } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useUiStore } from '../../src/store/uiStore';
import { searchMessages, getOrCreateDirect, type ChatMessage } from '../../src/api/chat';
import { search as searchLocal } from '../../src/services/chatDb';
import { listUsers, toUser } from '../../src/api/directory';
import { startVoiceSearch, stopVoiceSearch } from '../../src/services/speech';

const hhmm = (iso: string): string => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; };

// Uppercase section label on the cool canvas (matches the redesigned Chats screen language).
const sectionLabel = { color: colors.coolText, fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8, paddingHorizontal: 16, marginBottom: 8 };

// Search: matching PEOPLE (tap to start a chat) + message search read from the DEVICE's own message
// database — instant and works offline, like WhatsApp. The server text index is only consulted when
// local storage has nothing to offer (a thread this device never downloaded).
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
      const term = t.trim();
      try {
        // Device first, most-recently-active chats first — no network, no wait.
        const local = await searchLocal(conversations.map((c) => c.id), term, { limit: 50 });
        if (local.length) { setResults(local as ChatMessage[]); return; }
        // Nothing stored matches: fall back to the server's index, which can also reach history this
        // device never downloaded. Offline, an empty result is simply the honest answer.
        setResults(await searchMessages(term));
      } catch { setResults([]); } finally { setLoading(false); }
    }, 300);
  };

  // Voice search (WhatsApp-style): tap the mic → speech streams into the query as you talk.
  // Partial transcripts run through the same onChange, so people + message results update live.
  const [listening, setListening] = useState(false);
  const onMic = async (): Promise<void> => {
    if (listening) { stopVoiceSearch(); return; } // 'end' event flips the state off
    const ok = await startVoiceSearch({
      onResult: (t) => onChange(t),
      onEnd: () => setListening(false),
      onError: (msg) => showToast(msg),
    });
    setListening(ok);
  };
  // Arriving from the Home search bar's mic (?voice=1): start listening immediately.
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const autoVoice = useRef(false);
  useEffect(() => {
    if (voice === '1' && !autoVoice.current) { autoVoice.current = true; void onMic(); }
    return () => stopVoiceSearch(); // leaving the screen ends any active dictation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-row items-center gap-2 flex-1" style={{ backgroundColor: colors.coolMuted, borderRadius: 999, paddingHorizontal: 14 }}>
          <SearchIcon size={17} color={listening ? colors.primary : colors.coolText3} />
          <TextInput value={q} onChangeText={onChange} autoFocus placeholder={listening ? 'Listening…' : 'Search people or messages'} placeholderTextColor={listening ? colors.primary : colors.coolText3} style={{ flex: 1, paddingVertical: 11, fontSize: 15, color: colors.ink }} />
          <Pressable onPress={() => void onMic()} hitSlop={10} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? colors.danger : 'transparent' }}>
            <Mic size={18} color={listening ? '#fff' : colors.coolText} />
          </Pressable>
        </View>
        <Pressable onPress={() => router.push('/chat/starred')} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Star size={20} color={colors.ink} /></Pressable>
      </View>

      <FlatList
        data={results}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingVertical: 12 }}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.coolDivider, marginLeft: 16 }} />}
        ListHeaderComponent={
          people.length ? (
            <View style={{ marginBottom: 10 }}>
              <Text style={sectionLabel}>PEOPLE</Text>
              {people.map((u, i) => (
                <Pressable key={u.id} onPress={() => startChat(u.id)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center" style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.card, borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.coolDivider }}>
                  <Avatar initials={u.initials} color={u.color} size={48} uri={u.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 16, fontWeight: '600' }}>{u.name}</Text>
                    {u.scopeLine ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 13, marginTop: 1 }}>{u.scopeLine}</Text> : null}
                  </View>
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>Message</Text>
                </Pressable>
              ))}
              {results.length || loading ? <Text style={[sectionLabel, { marginTop: 14 }]}>MESSAGES</Text> : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View className="items-center" style={{ paddingVertical: 40 }}><ActivityIndicator color={colors.primary} /></View>
          ) : noResults ? (
            <View className="items-center" style={{ paddingVertical: 48 }}><Text style={{ color: colors.coolText, fontSize: 14 }}>No people or messages found</Text></View>
          ) : !q.trim() ? (
            <View className="items-center" style={{ paddingVertical: 48 }}><Text style={{ color: colors.coolText, fontSize: 14 }}>Search people to start a chat, or find messages</Text></View>
          ) : null
        }
        renderItem={({ item: m }) => (
          <Pressable onPress={() => router.push({ pathname: '/chat/[id]', params: { id: m.conversationId, messageId: m.id } })} android_ripple={{ color: colors.coolMuted }} style={{ backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 12 }}>
            <View className="flex-row justify-between items-baseline gap-2">
              <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: '600', flex: 1 }}>{convName(m.conversationId)}</Text>
              <Text style={{ color: colors.coolText3, fontSize: 12, fontWeight: '500' }}>{hhmm(m.createdAt)}</Text>
            </View>
            <Text style={{ color: colors.primary, fontSize: 12.5, fontWeight: '700', marginTop: 2 }}>{userName(m.senderId)}</Text>
            <Text numberOfLines={2} style={{ color: colors.coolText, fontSize: 14, marginTop: 2 }}>{m.text || `[${m.type}]`}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

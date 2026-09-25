import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, Trash2, Image as ImageIcon, MessageSquare } from 'lucide-react-native';
import { Avatar } from '../src/components/ui';
import { colors } from '../src/theme';
import { useMessagingStore } from '../src/store/messagingStore';
import { useUiStore } from '../src/store/uiStore';
import { mediaUrl } from '../src/api/media';
import * as chatDb from '../src/services/chatDb';
import { mediaCacheUsage, clearMediaCache } from '../src/services/attachments';

// Storage (WhatsApp's "Manage storage"): what this phone is holding — the message database and the
// downloaded media — and the means to free either. Messages live on the device by design (that is
// what makes chats open instantly); this is where a user with a full phone gets that space back.

interface Row { conversationId: string; bytes: number; messages: number }

const fmt = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function Storage() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const conversations = useMessagingStore((s) => s.conversations);
  const [rows, setRows] = useState<Row[]>([]);
  const [media, setMedia] = useState<{ bytes: number; files: number }>({ bytes: 0, files: 0 });
  const [loading, setLoading] = useState(true);

  const measure = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [usage, cache] = await Promise.all([
        chatDb.usage(conversations.map((c) => c.id)),
        mediaCacheUsage(),
      ]);
      setRows(usage);
      setMedia(cache);
    } finally { setLoading(false); }
  }, [conversations]);

  useFocusEffect(useCallback(() => { void measure(); }, [measure]));

  const convOf = (id: string) => conversations.find((c) => c.id === id);
  const totalMessages = rows.reduce((n, r) => n + r.messages, 0);
  const totalBytes = rows.reduce((n, r) => n + r.bytes, 0) + media.bytes;

  // Clearing one chat's stored history: the messages themselves are safe on the server, so the thread
  // refills from its newest page the next time it is opened. Older history is re-downloaded as the
  // user scrolls back. Said plainly in the prompt so nobody expects a deletion.
  const clearChat = (id: string): void => {
    const name = convOf(id)?.name ?? 'this chat';
    Alert.alert(`Clear stored messages for ${name}?`, 'They stay on the server — this chat will fetch them again when you open it. Frees space on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => void (async () => {
          await useMessagingStore.getState().clearLocalThread(id);
          showToast('Cleared from this phone');
          await measure();
        })(),
      },
    ]);
  };

  const clearAllChats = (): void => {
    Alert.alert('Clear all stored messages?', 'Every chat re-downloads from the server the next time you open it, and will be slower to open until it does.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: () => void (async () => {
          for (const r of rows) await useMessagingStore.getState().clearLocalThread(r.conversationId);
          showToast('Stored messages cleared');
          await measure();
        })(),
      },
    ]);
  };

  const clearMedia = (): void => {
    Alert.alert('Delete downloaded media?', 'Photos, videos, voice notes and documents you downloaded are removed from this phone. You can download them again from the chat.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void (async () => { await clearMediaCache(); showToast('Downloads deleted'); await measure(); })(),
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      <View className="flex-row items-center gap-2 px-2" style={{ backgroundColor: colors.card, height: 56, borderBottomColor: colors.coolDivider, borderBottomWidth: StyleSheet.hairlineWidth }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' }}>Storage</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Total — the headline number, with what it is made of underneath. */}
        <View className="mx-4 mt-4" style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, padding: 16 }}>
          <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>ON THIS PHONE</Text>
          <Text style={{ color: colors.ink, fontSize: 30, fontWeight: '800', marginTop: 6 }}>{loading ? '—' : fmt(totalBytes)}</Text>
          <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 2 }}>
            {loading ? 'Measuring…' : `${totalMessages.toLocaleString()} messages · ${media.files} downloaded file${media.files === 1 ? '' : 's'}`}
          </Text>
          <Text style={{ color: colors.coolText3, fontSize: 12, marginTop: 10, lineHeight: 17 }}>
            Chats are kept on your phone so they open instantly and work offline. Clearing them here frees space —
            nothing is deleted for anyone else.
          </Text>
        </View>

        {/* Downloads */}
        <Text className="mx-5 mt-5 mb-1.5" style={{ color: colors.coolText, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>DOWNLOADS</Text>
        <View className="mx-4" style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>
          <Pressable onPress={clearMedia} disabled={!media.files} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 px-4 py-3.5" style={{ opacity: media.files ? 1 : 0.5 }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: `${colors.blue}1A`, alignItems: 'center', justifyContent: 'center' }}>
              <ImageIcon size={19} color={colors.blue} />
            </View>
            <View className="flex-1">
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>Photos, videos & documents</Text>
              <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 1 }}>{media.files ? `${fmt(media.bytes)} · ${media.files} files` : 'Nothing downloaded yet'}</Text>
            </View>
            {media.files ? <Trash2 size={18} color={colors.danger} /> : null}
          </Pressable>
        </View>

        {/* Per-chat, largest first */}
        <View className="flex-row items-center justify-between mx-5 mt-5 mb-1.5">
          <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>CHATS</Text>
          {rows.length ? (
            <Pressable onPress={clearAllChats} hitSlop={8}><Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: '700' }}>Clear all</Text></Pressable>
          ) : null}
        </View>

        {loading ? (
          <View style={{ paddingVertical: 32 }}><ActivityIndicator color={colors.primary} /></View>
        ) : rows.length === 0 ? (
          <View className="items-center" style={{ paddingVertical: 32, paddingHorizontal: 32 }}>
            <MessageSquare size={34} color={colors.coolText3} />
            <Text style={{ color: colors.coolText, fontSize: 14, marginTop: 10, textAlign: 'center' }}>No messages stored on this phone yet.</Text>
          </View>
        ) : (
          <View className="mx-4" style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>
            {rows.map((r, i) => {
              const c = convOf(r.conversationId);
              const name = c?.name ?? 'Conversation';
              return (
                <Pressable key={r.conversationId} onPress={() => clearChat(r.conversationId)} android_ripple={{ color: colors.coolMuted }}
                  className="flex-row items-center gap-3 px-4 py-3"
                  style={{ borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.coolDivider }}>
                  <Avatar initials={(name[0] ?? '?').toUpperCase()} color={c?.type === 'group' ? colors.purple : colors.primary} size={38} uri={c?.image ? mediaUrl(c.image) : null} />
                  <View className="flex-1">
                    <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{name}</Text>
                    <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 1 }}>{r.messages.toLocaleString()} messages · {fmt(r.bytes)}</Text>
                  </View>
                  <Trash2 size={17} color={colors.coolText3} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

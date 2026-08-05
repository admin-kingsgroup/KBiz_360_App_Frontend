import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { X, Trash2, Eye } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import { listStatus, viewStatus, deleteStatus, type StatusEntry } from '../../src/api/chat';
import { mediaUrl } from '../../src/api/media';

// The story player: one person's updates, advanced by tapping the right half (or left to go back),
// with the segment bar across the top. Each item is marked viewed as it appears, and the poster —
// and only the poster — sees who has watched.

const STEP_MS = 5000; // how long an image/text card holds before advancing

export default function StatusView() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const showToast = useUiStore((s) => s.showToast);
  const users = useAccessStore((s) => s.users);
  const [entry, setEntry] = useState<StatusEntry | null>(null);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const feed = await listStatus();
      setEntry(feed.find((e) => e.userId === userId) ?? null);
    } catch { setEntry(null); } finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const items = entry?.items ?? [];
  const item = items[idx];

  // Mark viewed as each item comes up (the server ignores a poster viewing their own).
  useEffect(() => { if (item) void viewStatus(item.id).catch(() => undefined); }, [item]);

  // Auto-advance; a long-press pauses, which is how you read a long caption without it moving on.
  useEffect(() => {
    if (!item || paused) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (idx + 1 < items.length) setIdx(idx + 1); else router.back();
    }, item.type === 'video' ? 15000 : STEP_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [item, idx, items.length, paused, router]);

  const next = (): void => { if (idx + 1 < items.length) setIdx(idx + 1); else router.back(); };
  const prev = (): void => { if (idx > 0) setIdx(idx - 1); else router.back(); };

  const removeItem = (): void => {
    if (!item) return;
    Alert.alert('Delete this status?', 'It disappears for everyone right away.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void deleteStatus(item.id).then(() => { showToast('Status deleted'); router.back(); }).catch(() => showToast('Could not delete')),
      },
    ]);
  };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>;
  }
  if (!entry || !item) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#fff', fontSize: 15, textAlign: 'center' }}>This status is no longer available.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 18, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const url = item.attachment ? mediaUrl(item.attachment.url) : null;
  const viewerNames = item.viewers
    .map((v) => users.find((u) => u.id === v.userId)?.name ?? 'Someone')
    .slice(0, 3)
    .join(', ');

  return (
    <View style={{ flex: 1, backgroundColor: item.type === 'text' ? item.backgroundColor ?? colors.primaryDark : '#000' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Segment bar — one filled pip per item, WhatsApp-style. */}
        <View className="flex-row gap-1 px-3" style={{ paddingTop: 6 }}>
          {items.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 2.5, borderRadius: 2, backgroundColor: i <= idx ? '#fff' : 'rgba(255,255,255,0.35)' }} />
          ))}
        </View>

        <View className="flex-row items-center gap-2.5 px-3" style={{ paddingVertical: 10 }}>
          <Avatar initials={(entry.name[0] ?? '?').toUpperCase()} color={colors.blue} size={36} uri={entry.avatar ? mediaUrl(entry.avatar) : null} />
          <View className="flex-1">
            <Text numberOfLines={1} style={{ color: '#fff', fontSize: 14.5, fontWeight: '700' }}>{entry.mine ? 'My status' : entry.name}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11.5 }}>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
          {entry.mine ? (
            <Pressable onPress={removeItem} hitSlop={8} style={{ padding: 6 }}><Trash2 size={20} color="#fff" /></Pressable>
          ) : null}
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}><X size={22} color="#fff" /></Pressable>
        </View>

        {/* The card. Tapping the right two-thirds advances, the left third goes back; holding pauses. */}
        <View style={{ flex: 1 }}>
          {item.type === 'text' ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
              <Text style={{ color: '#fff', fontSize: 24, lineHeight: 34, fontWeight: '600', textAlign: 'center' }}>{item.caption}</Text>
            </View>
          ) : item.type === 'video' && url ? (
            <WebView source={{ uri: url }} style={{ flex: 1, backgroundColor: '#000' }} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} />
          ) : url ? (
            <Image source={{ uri: url }} style={{ flex: 1, width: '100%' }} resizeMode="contain" />
          ) : null}

          <Pressable onPress={prev} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)}
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '33%' }} />
          <Pressable onPress={next} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '67%' }} />
        </View>

        {item.type !== 'text' && item.caption ? (
          <Text style={{ color: '#fff', fontSize: 15, lineHeight: 21, paddingHorizontal: 20, paddingVertical: 14 }}>{item.caption}</Text>
        ) : null}

        {/* Viewers — the poster only. WhatsApp keeps the watch list private to the author. */}
        {entry.mine ? (
          <View className="flex-row items-center gap-2 px-5" style={{ paddingBottom: insets.bottom ? 4 : 12, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.2)' }}>
            <Eye size={16} color="rgba(255,255,255,0.85)" />
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, flex: 1 }}>
              {item.viewCount === 0 ? 'No views yet' : `${item.viewCount} view${item.viewCount === 1 ? '' : 's'}${viewerNames ? ` · ${viewerNames}` : ''}`}
            </Text>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

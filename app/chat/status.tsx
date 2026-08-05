import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ChevronLeft, Camera, Pencil, Eye, Plus } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { STATUS_BACKGROUNDS } from '../../src/theme/wallpapers';
import { useUiStore } from '../../src/store/uiStore';
import { listStatus, postStatus, type StatusEntry } from '../../src/api/chat';
import { uploadFile, toAttachment, mediaUrl } from '../../src/api/media';

// Status — 24-hour updates shared with the colleagues you already chat with. The list mirrors
// WhatsApp's: your own row first (tap to add), then everyone else with an unseen-first order and a
// ring that dims once you have watched them all.

const ago = (iso: string): string => {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : 'yesterday';
};

export default function Status() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const [entries, setEntries] = useState<StatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try { setEntries(await listStatus()); } catch { /* offline — keep what is shown */ } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const mine = entries.find((e) => e.mine);
  const others = entries.filter((e) => !e.mine);

  const addPhoto = async (): Promise<void> => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 1 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    setPosting(true);
    try {
      let uri = a.uri, w = a.width, h = a.height;
      if (a.type !== 'video') {
        // Same downscale as a chat photo — a status is viewed on a phone screen, not printed.
        const out = await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: Math.min(a.width || 1280, 1280) } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
        uri = out.uri; w = out.width; h = out.height;
      }
      const up = await uploadFile({ uri, name: a.fileName ?? (a.type === 'video' ? 'status.mp4' : 'status.jpg'), mime: a.type === 'video' ? (a.mimeType ?? 'video/mp4') : 'image/jpeg' });
      await postStatus({ type: a.type === 'video' ? 'video' : 'image', attachment: toAttachment(up, { width: w, height: h }) });
      showToast('Status posted — it disappears in 24 hours');
      await load();
    } catch {
      showToast('Could not post your status');
    } finally { setPosting(false); }
  };

  const addText = (): void => {
    Alert.prompt?.('Text status', 'Shared with the colleagues you chat with. Disappears in 24 hours.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Post',
        onPress: (value?: string) => {
          const caption = (value ?? '').trim();
          if (!caption) return;
          setPosting(true);
          const bg = STATUS_BACKGROUNDS[Math.floor(caption.length % STATUS_BACKGROUNDS.length)];
          postStatus({ type: 'text', caption, backgroundColor: bg })
            .then(() => { showToast('Status posted'); return load(); })
            .catch(() => showToast('Could not post your status'))
            .finally(() => setPosting(false));
        },
      },
    ], 'plain-text');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      <View className="flex-row items-center gap-2 px-2" style={{ backgroundColor: colors.card, height: 56, borderBottomColor: colors.coolDivider, borderBottomWidth: StyleSheet.hairlineWidth }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' }}>Status</Text>
        {posting ? <ActivityIndicator color={colors.primary} style={{ marginRight: 10 }} /> : null}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {/* My status — tap to view mine, the buttons to add. */}
        <View className="mx-4 mt-4" style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>
          <Pressable
            onPress={() => (mine ? router.push({ pathname: '/chat/status-view', params: { userId: mine.userId } }) : void addPhoto())}
            android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 px-4 py-3">
            <View>
              <Avatar initials="Me" color={colors.primary} size={52} uri={mine?.avatar ? mediaUrl(mine.avatar) : null} ring={mine ? (mine.allViewed ? colors.coolDivider : colors.primary) : undefined} />
              {!mine ? (
                <View style={{ position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.card }}>
                  <Plus size={13} color="#fff" />
                </View>
              ) : null}
            </View>
            <View className="flex-1">
              <Text style={{ color: colors.ink, fontSize: 15.5, fontWeight: '700' }}>My status</Text>
              <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 1 }}>
                {mine ? `${mine.items.length} update${mine.items.length === 1 ? '' : 's'} · ${ago(mine.lastAt)}` : 'Share a photo or a note with your team'}
              </Text>
            </View>
            {mine ? (
              <View className="flex-row items-center gap-1">
                <Eye size={15} color={colors.coolText3} />
                <Text style={{ color: colors.coolText3, fontSize: 12.5 }}>{mine.items.reduce((n, i) => n + i.viewCount, 0)}</Text>
              </View>
            ) : null}
          </Pressable>
          <View className="flex-row" style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.coolDivider }}>
            <Pressable onPress={() => void addPhoto()} disabled={posting} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center justify-center gap-2" style={{ flex: 1, paddingVertical: 12 }}>
              <Camera size={17} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 13.5, fontWeight: '700' }}>Photo / video</Text>
            </Pressable>
            <Pressable onPress={addText} disabled={posting} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center justify-center gap-2" style={{ flex: 1, paddingVertical: 12, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.coolDivider }}>
              <Pencil size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 13.5, fontWeight: '700' }}>Text</Text>
            </Pressable>
          </View>
        </View>

        <Text className="mx-5 mt-6 mb-1.5" style={{ color: colors.coolText, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>RECENT UPDATES</Text>
        {loading ? (
          <View style={{ paddingVertical: 28 }}><ActivityIndicator color={colors.primary} /></View>
        ) : others.length === 0 ? (
          <Text className="mx-5" style={{ color: colors.coolText, fontSize: 13.5, lineHeight: 19 }}>
            No one has posted in the last 24 hours.
          </Text>
        ) : (
          <View className="mx-4" style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>
            {others.map((e, i) => (
              <Pressable key={e.userId} onPress={() => router.push({ pathname: '/chat/status-view', params: { userId: e.userId } })}
                android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-3 px-4 py-3"
                style={{ borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.coolDivider }}>
                <Avatar initials={(e.name[0] ?? '?').toUpperCase()} color={colors.blue} size={52} uri={e.avatar ? mediaUrl(e.avatar) : null}
                  ring={e.allViewed ? colors.coolDivider : colors.primary} />
                <View className="flex-1">
                  <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15.5, fontWeight: e.allViewed ? '500' : '700' }}>{e.name}</Text>
                  <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 1 }}>{ago(e.lastAt)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

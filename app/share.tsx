import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ScrollView, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Search as SearchIcon, Send, FileText, Play, Check } from 'lucide-react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { useShareIntentContext } from 'expo-share-intent';
import { Avatar } from '../src/components/ui';
import { colors } from '../src/theme';
import { useUiStore } from '../src/store/uiStore';
import { useMessagingStore } from '../src/store/messagingStore';
import { uploadFile, mediaUrl, toAttachment } from '../src/api/media';
import { toSharedUpload, shareSummary, type SharedFile, type SharedUpload } from '../src/logic/shareIntent';

// System share sheet target ("Send to…"): photos/files/text shared to KBiz 360 from other apps land
// here — pick one or more chats, then each file is uploaded once and sent to every selected chat.
export default function ShareTarget() {
  const router = useRouter();
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  const showToast = useUiStore((s) => s.showToast);
  const insets = useSafeAreaInsets();
  const conversations = useMessagingStore((s) => s.conversations);

  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState<string | null>(null);

  // Snapshot the payload at mount — resetShareIntent() during the send/close must not blank the UI.
  const [payload] = useState(() => ({
    files: (shareIntent?.files ?? []) as SharedFile[],
    text: shareIntent?.text?.trim() ?? '',
  }));
  const uploads = useMemo(() => payload.files.map((f, i) => toSharedUpload(f, i)), [payload.files]);
  const summary = shareSummary(payload.files, payload.text);

  useEffect(() => {
    if (conversations.length === 0) void useMessagingStore.getState().loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? conversations.filter((c) => c.name.toLowerCase().includes(s)) : conversations;
  }, [q, conversations]);

  const toggle = (id: string): void =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const close = (): void => {
    resetShareIntent();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const doSend = async (): Promise<void> => {
    if (sending || selected.length === 0) return;
    const store = useMessagingStore.getState();
    try {
      for (let i = 0; i < uploads.length; i++) {
        const u = uploads[i];
        setSending(uploads.length > 1 ? `Sending ${i + 1} of ${uploads.length}…` : 'Sending…');
        let file: { uri: string; name: string; mime: string } = u;
        let extra = u.extra;
        if (u.type === 'image') {
          // Same compression as the in-chat picker (resize to ≤1280w, JPEG 0.7); fall back to original.
          try {
            const out = await ImageManipulator.manipulateAsync(u.uri, [{ resize: { width: Math.min(u.extra.width || 1280, 1280) } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
            file = { uri: out.uri, name: u.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg' };
            extra = { width: out.width, height: out.height };
          } catch { /* original */ }
        }
        // Upload ONCE, then attach the same stored file to every selected chat.
        const res = await uploadFile(file);
        const attachment = toAttachment(res, extra);
        for (const convId of selected) {
          // Shared caption text rides on the first file (WhatsApp behaviour).
          await store.sendMedia(convId, { type: u.type, attachments: [attachment], text: i === 0 && payload.text ? payload.text : undefined });
        }
      }
      if (uploads.length === 0 && payload.text) {
        setSending('Sending…');
        for (const convId of selected) await store.send(convId, payload.text);
      }
      resetShareIntent();
      if (selected.length === 1) {
        router.replace({ pathname: '/chat/[id]', params: { id: selected[0] } });
      } else {
        showToast(`Sent to ${selected.length} chats`);
        router.replace('/(tabs)');
      }
    } catch {
      setSending(null);
      showToast('Sending failed — check your connection');
    }
  };

  const selectedNames = selected
    .map((id) => conversations.find((c) => c.id === id)?.name ?? '')
    .filter(Boolean)
    .join(', ');
  const empty = uploads.length === 0 && !payload.text;

  return (
    // Bottom inset is handled explicitly (list padding + send bar) — same pattern as the chat screen.
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      {/* header */}
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={close} disabled={!!sending} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <X size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Send to…</Text>
          {summary ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 13, marginTop: 1 }}>{summary}</Text> : null}
        </View>
      </View>

      {empty ? (
        <View className="flex-1 items-center justify-center" style={{ padding: 32 }}>
          <Text style={{ color: colors.coolText, fontSize: 14 }}>Nothing to share</Text>
        </View>
      ) : (
        <>
          {/* shared content preview */}
          {uploads.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, backgroundColor: colors.card }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
              {uploads.map((u: SharedUpload, i: number) => (
                <View key={`${u.uri}-${i}`} style={{ width: 72, alignItems: 'center' }}>
                  {u.type === 'image' ? (
                    <Image source={{ uri: u.uri }} style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: colors.coolMuted }} />
                  ) : (
                    <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                      {u.type === 'video' ? <Play size={26} color={colors.primary} /> : <FileText size={26} color={colors.primary} />}
                    </View>
                  )}
                  <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 10, marginTop: 4, maxWidth: 72 }}>{u.name}</Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={{ backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text numberOfLines={3} style={{ color: colors.coolText, fontSize: 13, fontStyle: 'italic' }}>{payload.text}</Text>
            </View>
          )}

          {/* search */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
            <View className="flex-row items-center gap-2" style={{ backgroundColor: colors.coolMuted, borderRadius: 999, paddingHorizontal: 14 }}>
              <SearchIcon size={17} color={colors.coolText3} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search chats" placeholderTextColor={colors.coolText3} style={{ flex: 1, paddingVertical: 10, fontSize: 15, color: colors.ink }} />
            </View>
          </View>

          <FlatList
            data={list}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
            ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.coolDivider, marginLeft: 78 }} />}
            ListEmptyComponent={
              <View className="items-center" style={{ paddingVertical: 48 }}>
                <Text style={{ color: colors.coolText, fontSize: 14 }}>{q.trim() ? 'No chats match your search' : 'No chats yet'}</Text>
              </View>
            }
            renderItem={({ item: c }) => {
              const on = selected.includes(c.id);
              return (
                <Pressable onPress={() => toggle(c.id)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center" style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.card }}>
                  <Avatar initials={(c.name[0] ?? '?').toUpperCase()} color={c.type === 'group' ? colors.purple : colors.blue} size={50} uri={c.image ? mediaUrl(c.image) : undefined} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 16, fontWeight: '600' }}>{c.name}</Text>
                    {c.type === 'group' ? <Text style={{ color: colors.coolText, fontSize: 13, marginTop: 1 }}>{c.memberCount} members</Text> : null}
                  </View>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? colors.primary : colors.coolText3, backgroundColor: on ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <Check size={15} color="#fff" strokeWidth={3} /> : null}
                  </View>
                </Pressable>
              );
            }}
          />

          {/* bottom send bar — absolute children ignore SafeAreaView padding, so pad the Android
              nav-bar inset in explicitly (the bar's background extends behind the transparent nav bar). */}
          {selected.length > 0 ? (
            <View className="flex-row items-center" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 + insets.bottom, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.coolDivider }}>
              <Text numberOfLines={1} style={{ flex: 1, color: colors.coolText, fontSize: 13 }}>{selectedNames}</Text>
              <Pressable onPress={() => void doSend()} disabled={!!sending} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: sending ? 0.6 : 1 }}>
                {sending ? <ActivityIndicator color="#fff" /> : <Send size={22} color="#fff" />}
              </Pressable>
            </View>
          ) : null}

          {/* sending overlay label */}
          {sending ? (
            <View style={{ position: 'absolute', bottom: 84 + insets.bottom, alignSelf: 'center', backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{sending}</Text>
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

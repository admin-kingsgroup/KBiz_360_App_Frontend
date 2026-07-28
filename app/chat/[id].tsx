import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, Image, Modal, Linking, Platform, StyleSheet, Vibration } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS, interpolate, Extrapolation } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, MoreVertical, Send, X, Reply, Copy, Star, Pin, Pencil, Trash2, Paperclip, Mic, FileText, Play, Image as ImageIcon, Camera, Phone, Clock, Check, CheckCheck } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Avatar } from '../../src/components/ui';
import { VoiceMessage } from '../../src/components/chat';
import { colors } from '../../src/theme';
import { useUiStore } from '../../src/store/uiStore';
import { useAccessStore } from '../../src/store/accessStore';
import { useMessagingStore, toEpochMs, type StoredMessage } from '../../src/store/messagingStore';
import { getConversation, getPinned, type ChatConversation, type ChatAttachment, type ChatMessage } from '../../src/api/chat';
import { uploadFile, mediaUrl, toAttachment, humanSize } from '../../src/api/media';
import { listUsers, toUser } from '../../src/api/directory';
import { useVoiceRecorder } from '../../src/hooks/useVoiceRecorder';
import { joinConversation, leaveConversation, emitTyping, emitStopTyping, emitRead } from '../../src/realtime/chatSocket';
import { callManager } from '../../src/services/rtc/CallManager';
import { daySeparator, isDifferentDay } from '../../src/utils/time';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const DELETE_EVERYONE_MS = 60 * 60 * 1000;
const hhmm = (iso: string): string => { const d = new Date(iso); return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; };
const mmss = (s: number): string => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

// WhatsApp-style "last seen today/yesterday/DD/MM at HH:MM".
function lastSeenLabel(ts: number): string {
  const d = new Date(ts); const now = new Date();
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return `last seen today at ${time}`;
  if (d.toDateString() === yest.toDateString()) return `last seen yesterday at ${time}`;
  return `last seen ${d.getDate()}/${d.getMonth() + 1} at ${time}`;
}

export default function ChatDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = id ?? '';
  const showToast = useUiStore((s) => s.showToast);
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((s) => s.isVisible);

  const rawMessages = useMessagingStore((s) => s.messages[convId]);
  const messages = useMemo(() => rawMessages ?? [], [rawMessages]);
  // The list is INVERTED (newest at the bottom, rendered first) so a chat always opens already at
  // the last message — no scroll-to-bottom, no "chasing" as rows/media lay out. reversed = newest
  // first; `messages` stays chronological for everything else (send, divider anchor, etc.).
  const reversed = useMemo(() => messages.slice().reverse(), [messages]);
  const typingUsers = useMessagingStore((s) => s.typing[convId]) ?? [];
  const convFromStore = useMessagingStore((s) => s.conversations.find((c) => c.id === convId));
  const presence = useMessagingStore((s) => s.presence);
  const users = useAccessStore((s) => s.users);

  const [conv, setConv] = useState<ChatConversation | undefined>(convFromStore);
  const [text, setText] = useState('');
  const [active, setActive] = useState<StoredMessage | null>(null);
  const [editing, setEditing] = useState<StoredMessage | null>(null);
  const [replyTo, setReplyTo] = useState<StoredMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<number | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const [contactOpen, setContactOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const { isRecording, elapsedSec, start, finish, cancel } = useVoiceRecorder();
  const listRef = useRef<FlatList<StoredMessage>>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unread divider ("— N unread messages —", WhatsApp-style). Freeze the conversation's unread count
  // at OPEN, synchronously during the first render — the mount effect calls markRead which zeroes it,
  // so reading it later would always give 0.
  const initialUnreadRef = useRef<number | null>(null);
  if (initialUnreadRef.current === null) {
    initialUnreadRef.current = useMessagingStore.getState().conversations.find((c) => c.id === convId)?.unread ?? 0;
  }
  // The message the divider sits ABOVE (first unread). Computed ONCE after messages load, then frozen
  // so it doesn't jump when markRead fires or new messages arrive while the chat is open.
  const [unreadDivider, setUnreadDivider] = useState<{ anchorId: string; count: number } | null>(null);
  const dividerComputed = useRef(false);

  useEffect(() => { if (convFromStore) setConv(convFromStore); }, [convFromStore]);

  useEffect(() => {
    if (dividerComputed.current || loading) return;
    dividerComputed.current = true;
    const n = initialUnreadRef.current ?? 0;
    if (n <= 0) return;
    // Read the just-loaded messages from the store (loading flips false only after loadMessages).
    // The unread are the last N messages from the other side: walk from the newest, counting
    // received (not-mine) messages until we reach N; that message is the first unread.
    const loaded = useMessagingStore.getState().messages[convId] ?? [];
    let count = 0;
    let anchorId: string | null = null;
    for (let i = loaded.length - 1; i >= 0; i--) {
      if (!loaded[i].mine) { count++; if (count >= n) { anchorId = loaded[i].id; break; } }
    }
    if (anchorId) setUnreadDivider({ anchorId, count });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (!convId) return;
    const store = useMessagingStore.getState();
    store.setActive(convId);
    joinConversation(convId);
    Promise.all([store.loadMessages(convId), convFromStore ? Promise.resolve() : getConversation(convId).then(setConv).catch(() => undefined)])
      .finally(() => { setLoading(false); void store.markRead(convId); emitRead(convId); });
    getPinned(convId).then(setPinned).catch(() => setPinned([]));
    if (users.length === 0) listUsers().then((l) => useAccessStore.getState().setUsers(l.map(toUser))).catch(() => undefined);
    return () => { leaveConversation(convId); useMessagingStore.getState().setActive(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);


  const nameOf = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u.name]));
    return (uid: string): string => map.get(uid) ?? (conv?.type === 'direct' ? conv.name : 'Member');
  }, [users, conv]);

  const isGroup = conv?.type === 'group';
  const title = conv?.name ?? 'Chat';
  const otherPresence = conv?.otherUserId ? presence[conv.otherUserId] : undefined;

  // Keep the other person's presence fresh while the chat is open (live socket events + a 30s poll
  // so "online" / "last seen" stays accurate even if no event arrives).
  useEffect(() => {
    const other = conv?.type === 'direct' ? conv.otherUserId : undefined;
    if (!other) return;
    void useMessagingStore.getState().loadPresence([other]);
    const t = setInterval(() => void useMessagingStore.getState().loadPresence([other]), 30000);
    return () => clearInterval(t);
  }, [conv?.type, conv?.otherUserId]);

  // The other person's job title (if set) — its own header line above presence, so a long title
  // can never truncate the "last seen …" text away.
  const otherPosition = !isGroup ? (users.find((u) => u.id === conv?.otherUserId)?.position ?? null) : null;
  // Live presence always beats the conversation's stale online/lastSeen snapshot — the snapshot is
  // only the fallback when no live entry has arrived at all.
  const convLastSeen = toEpochMs(conv?.lastSeen);
  const offlineAt = otherPresence?.lastSeen ?? convLastSeen;
  const presenceLabel = typingUsers.length ? 'typing…'
    : otherPresence
      ? otherPresence.status === 'in_call' ? 'in a call'
        : otherPresence.status === 'online' ? 'online'
          : offlineAt ? lastSeenLabel(offlineAt) : 'last seen recently'
      : conv?.online ? 'online' : convLastSeen ? lastSeenLabel(convLastSeen) : 'last seen recently';
  const subtitle = isGroup ? `${conv?.memberCount ?? 0} members` : presenceLabel;

  const onChangeText = (t: string): void => {
    setText(t);
    emitTyping(convId);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitStopTyping(convId), 1500);
  };

  const submitText = async (): Promise<void> => {
    const t = text.trim();
    if (!t) return;
    if (editing) { await useMessagingStore.getState().edit(editing.id, convId, t); setEditing(null); setText(''); return; }
    setText('');
    emitStopTyping(convId);
    await useMessagingStore.getState().send(convId, t, replyTo?.id);
    setReplyTo(null);
  };

  // ── media ──
  const doUpload = async (file: { uri: string; name: string; mime: string }, type: ChatMessage['type'], extra: Partial<ChatAttachment> = {}): Promise<void> => {
    setUploading(0);
    try {
      const res = await uploadFile(file, setUploading);
      await useMessagingStore.getState().sendMedia(convId, { type, attachments: [toAttachment(res, extra)] });
    } catch {
      showToast('Upload failed — check your connection');
    } finally {
      setUploading(null);
    }
  };
  // Shared by the library picker and the camera — video goes up as-is, images are resized/compressed.
  const uploadAsset = async (a: ImagePicker.ImagePickerAsset): Promise<void> => {
    if (a.type === 'video') {
      await doUpload({ uri: a.uri, name: a.fileName ?? 'video.mp4', mime: a.mimeType ?? 'video/mp4' }, 'video', { width: a.width, height: a.height, durationMs: a.duration ?? undefined });
      return;
    }
    // compress image before upload
    let uri = a.uri, w = a.width, h = a.height;
    try {
      const out = await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: Math.min(a.width || 1280, 1280) } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
      uri = out.uri; w = out.width; h = out.height;
    } catch { /* fall back to original */ }
    await doUpload({ uri, name: a.fileName ?? 'photo.jpg', mime: 'image/jpeg' }, 'image', { width: w, height: h });
  };
  const pickImageOrVideo = async (): Promise<void> => {
    setAttachOpen(false);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 1 });
    if (r.canceled || !r.assets[0]) return;
    await uploadAsset(r.assets[0]);
  };
  const takePhoto = async (): Promise<void> => {
    setAttachOpen(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { showToast('Camera permission is needed to take photos'); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 1, videoMaxDuration: 60 });
    if (r.canceled || !r.assets[0]) return;
    await uploadAsset(r.assets[0]);
  };
  const pickDocument = async (): Promise<void> => {
    setAttachOpen(false);
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    await doUpload({ uri: a.uri, name: a.name, mime: a.mimeType ?? 'application/octet-stream' }, 'document', { size: a.size ?? 0 });
  };
  const onMic = async (): Promise<void> => {
    if (isRecording) {
      const clip = await finish();
      if (!clip) { showToast('Recording failed'); return; }
      await doUpload({ uri: clip.uri, name: 'voice.m4a', mime: 'audio/m4a' }, 'voice', { durationMs: Math.round(clip.durationSec * 1000) });
    } else {
      const ok = await start();
      if (!ok) showToast('Microphone permission is needed to record');
    }
  };

  const closeMenu = (): void => setActive(null);
  const startEdit = (m: StoredMessage): void => { setEditing(m); setText(m.text); setReplyTo(null); closeMenu(); };
  const refreshPinned = (): void => { getPinned(convId).then(setPinned).catch(() => setPinned([])); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      {/* Header — white, sans, 40px avatar, green typing indicator (matches the Chats screen) */}
      <View className="flex-row items-center gap-2 px-2" style={{ backgroundColor: colors.card, height: 60, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <Pressable disabled={!isGroup} onPress={() => router.push({ pathname: '/chat/group-info', params: { id: convId } })} className="flex-1 flex-row items-center gap-2.5">
          <Avatar initials={(title[0] ?? '?').toUpperCase()} color={isGroup ? colors.purple : colors.blue} size={40} uri={conv?.image ? mediaUrl(conv.image) : null} />
          <View className="flex-1">
            <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>{title}</Text>
            {otherPosition ? <Text numberOfLines={1} style={{ color: colors.coolText3, fontSize: 11, fontWeight: '600' }}>{otherPosition}</Text> : null}
            <Text numberOfLines={1} style={{ color: typingUsers.length ? colors.primary : colors.coolText, fontSize: 12.5, fontWeight: '500', fontStyle: typingUsers.length ? 'italic' : 'normal' }}>{subtitle}</Text>
          </View>
        </Pressable>
        {!isGroup && conv?.otherUserId ? (
          <Pressable onPress={() => callManager.startOutgoing({ id: conv.otherUserId as string, name: title }, 'voice')} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Phone size={21} color={colors.ink} />
          </Pressable>
        ) : null}
        <Pressable onPress={() => (isGroup ? router.push({ pathname: '/chat/group-info', params: { id: convId } }) : setContactOpen(true))} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><MoreVertical size={21} color={colors.ink} /></Pressable>
      </View>

      {/* Pinned banner */}
      {pinned.length > 0 ? (
        <Pressable onPress={() => setPinnedOpen(true)} className="flex-row items-center gap-2 px-4 py-2" style={{ backgroundColor: colors.primarySoft, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
          <Pin size={14} color={colors.primary} />
          <View className="flex-1">
            <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{pinned.length} pinned message{pinned.length > 1 ? 's' : ''}</Text>
            <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 11.5 }}>{pinned[0].text || `[${pinned[0].type}]`}</Text>
          </View>
        </Pressable>
      ) : null}

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {loading ? (
          <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.coolBg }}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={reversed}
            inverted
            keyExtractor={(m) => m.id}
            style={{ flex: 1, backgroundColor: colors.coolBg }}
            contentContainerStyle={{ padding: 12 }}
            // Counter-flip must mirror the list's inversion exactly: Android inverts with
            // scale:-1 (both axes — a scaleY-only counter leaves the text mirrored), iOS with scaleY:-1.
            ListEmptyComponent={<View className="items-center" style={{ paddingVertical: 48, transform: Platform.OS === 'android' ? [{ scale: -1 }] : [{ scaleY: -1 }] }}><Text style={{ color: colors.coolText, fontSize: 14 }}>No messages yet — say hi 👋</Text></View>}
            renderItem={({ item: m, index }) => {
              // Inverted list: `index+1` is the chronologically OLDER message. WhatsApp-style day
              // separator: a centered date pill before the FIRST (oldest) message of each calendar
              // day — i.e. when the older neighbour is a different day (or this is the oldest message).
              const older = index < reversed.length - 1 ? reversed[index + 1] : null;
              const showDay = !older || isDifferentDay(new Date(older.createdAt).getTime(), new Date(m.createdAt).getTime());
              const showUnread = unreadDivider?.anchorId === m.id;
              const bubble = <Bubble m={m} isGroup={isGroup} nameOf={nameOf} onPress={() => !m.deletedForEveryone && setActive(m)} onOpenImage={setViewer} onRetry={(cid) => void useMessagingStore.getState().retry(cid)} />;
              const row = m.type === 'system'
                ? <SystemNotice text={m.text} />
                // Swipe a message right to reply (WhatsApp-style). Deleted messages aren't replyable.
                : m.deletedForEveryone
                  ? bubble
                  : <SwipeToReply onReply={() => setReplyTo(m)}>{bubble}</SwipeToReply>;
              // Inverted list reverses the vertical order WITHIN a cell, so render the bubble first
              // and the separators after — they then appear ABOVE the message on screen.
              return (
                <>
                  {row}
                  {showUnread ? <UnreadDivider count={unreadDivider!.count} /> : null}
                  {showDay ? <DateSeparator label={daySeparator(new Date(m.createdAt).getTime())} /> : null}
                </>
              );
            }}
          />
        )}

        {/* Upload progress */}
        {uploading !== null ? (
          <View className="px-3 py-2" style={{ backgroundColor: colors.card, borderTopColor: colors.coolDivider, borderTopWidth: 1 }}>
            <Text style={{ color: colors.coolText, fontSize: 11.5, fontWeight: '600', marginBottom: 4 }}>Uploading… {Math.round(uploading * 100)}%</Text>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.coolMuted }}><View style={{ height: 4, borderRadius: 2, width: `${Math.max(5, uploading * 100)}%`, backgroundColor: colors.primary }} /></View>
          </View>
        ) : null}

        {/* Reply / edit banner */}
        {replyTo || editing ? (
          <View className="flex-row items-center gap-2 px-3 py-2" style={{ backgroundColor: colors.card, borderTopColor: colors.coolDivider, borderTopWidth: 1 }}>
            <View style={{ width: 3, height: 32, borderRadius: 2, backgroundColor: colors.primary }} />
            <View className="flex-1">
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{editing ? 'Editing' : `Reply to ${nameOf((replyTo as StoredMessage).senderId)}`}</Text>
              <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12.5 }}>{(editing ?? replyTo)?.text || '[media]'}</Text>
            </View>
            <Pressable onPress={() => { setReplyTo(null); setEditing(null); setText(''); }} hitSlop={8}><X size={18} color={colors.coolText} /></Pressable>
          </View>
        ) : null}

        {/* Attach menu */}
        {attachOpen ? (
          <View className="flex-row gap-3 px-4 py-3" style={{ backgroundColor: colors.card, borderTopColor: colors.coolDivider, borderTopWidth: 1 }}>
            <AttachOption Icon={Camera} label="Camera" color={colors.primary} onPress={takePhoto} />
            <AttachOption Icon={ImageIcon} label="Photo / Video" color={colors.blue} onPress={pickImageOrVideo} />
            <AttachOption Icon={FileText} label="Document" color={colors.orange} onPress={pickDocument} />
          </View>
        ) : null}

        {/* Composer — grey pill input + green circular send/mic (WhatsApp style) */}
        <View className="flex-row items-end gap-2" style={{ backgroundColor: colors.card, borderTopColor: colors.coolDivider, borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: keyboardVisible ? 8 : insets.bottom + 10 }}>
          <Pressable onPress={isRecording ? () => void cancel() : () => setAttachOpen((v) => !v)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            {isRecording ? <Trash2 size={22} color={colors.danger} /> : <Paperclip size={22} color={colors.coolText} />}
          </Pressable>
          {isRecording ? (
            <View className="flex-row items-center gap-2" style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22, backgroundColor: '#FDECEC' }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger }} />
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>{mmss(elapsedSec)}</Text>
              <Text style={{ color: colors.coolText, fontSize: 13 }}>Recording…</Text>
            </View>
          ) : (
            <TextInput value={text} onChangeText={onChangeText} onFocus={() => setAttachOpen(false)} onSubmitEditing={submitText} placeholder="Message" placeholderTextColor={colors.coolText3} multiline
              style={{ flex: 1, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 22, backgroundColor: colors.coolMuted, fontSize: 15.5, color: colors.ink, maxHeight: 110 }} />
          )}
          <Pressable onPress={() => { if (text.trim()) return void submitText(); return void onMic(); }}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: isRecording ? colors.danger : colors.primary }}>
            {text.trim() || isRecording ? <Send size={19} color="#fff" /> : <Mic size={19} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Full-screen image viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          {viewer ? <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
          <Pressable onPress={() => setViewer(null)} style={{ position: 'absolute', top: insets.top + 12, right: 18 }}><X size={26} color="#fff" /></Pressable>
        </Pressable>
      </Modal>

      {/* Contact info (direct chats) */}
      <Modal visible={contactOpen} transparent animationType="fade" onRequestClose={() => setContactOpen(false)}>
        <Pressable onPress={() => setContactOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 28 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#fff', borderRadius: 18, padding: 20, alignItems: 'center' }}>
            {(() => {
              const c = users.find((u) => u.id === conv?.otherUserId);
              return (
                <>
                  <Avatar initials={c?.initials ?? (title[0] ?? '?').toUpperCase()} color={c?.color ?? colors.blue} size={64} uri={c?.avatar} />
                  <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '800', marginTop: 10 }}>{c?.name ?? title}</Text>
                  {c?.position ? <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '600', marginTop: 2 }}>{c.position}</Text> : null}
                  {c?.roleName ? <Text style={{ color: colors.coolText, fontSize: 11.5, marginTop: 1 }}>{c.roleName}</Text> : null}
                  {c?.email ? <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 6 }}>{c.email}</Text> : null}
                  <View className="flex-row gap-2" style={{ marginTop: 16 }}>
                    <Pressable onPress={() => { setContactOpen(false); if (conv?.otherUserId) callManager.startOutgoing({ id: conv.otherUserId, name: title }, 'voice'); }}
                      className="flex-row items-center gap-1.5" style={{ paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, backgroundColor: colors.primary }}>
                      <Phone size={16} color="#fff" /><Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '700' }}>Voice call</Text>
                    </Pressable>
                    <Pressable onPress={() => setContactOpen(false)} style={{ paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: colors.coolDivider }}>
                      <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '700' }}>Close</Text>
                    </Pressable>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Pinned messages list */}
      <Modal visible={pinnedOpen} transparent animationType="slide" onRequestClose={() => setPinnedOpen(false)}>
        <Pressable onPress={() => setPinnedOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: insets.bottom + 12, maxHeight: '70%' }}>
            <View className="flex-row items-center gap-2 px-4 py-3" style={{ borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
              <Pin size={16} color={colors.primary} />
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>Pinned messages</Text>
            </View>
            <FlatList
              data={pinned}
              keyExtractor={(pm) => pm.id}
              contentContainerStyle={{ padding: 12, gap: 8 }}
              renderItem={({ item: pm }) => (
                <View className="flex-row items-center gap-2" style={{ backgroundColor: colors.coolBg, borderRadius: 12, padding: 10 }}>
                  <View className="flex-1">
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{nameOf(pm.senderId)}</Text>
                    <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 13.5 }}>{pm.text || `[${pm.type}]`}</Text>
                  </View>
                  <Pressable onPress={() => void useMessagingStore.getState().pin(pm.id, convId).then(refreshPinned)} hitSlop={8}><Text style={{ color: colors.danger, fontSize: 11, fontWeight: '800' }}>Unpin</Text></Pressable>
                </View>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Action menu */}
      {active ? (
        <Pressable onPress={closeMenu} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 8, minWidth: 250 }}>
            <View className="flex-row justify-around" style={{ paddingVertical: 6, marginBottom: 4, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
              {REACTIONS.map((e) => (<Pressable key={e} onPress={() => { void useMessagingStore.getState().react(active.id, e); closeMenu(); }}><Text style={{ fontSize: 24 }}>{e}</Text></Pressable>))}
            </View>
            {[
              { label: 'Reply', Icon: Reply, onPress: () => { setReplyTo(active); closeMenu(); } },
              ...(active.type === 'text' ? [{ label: 'Copy', Icon: Copy, onPress: () => { void Clipboard.setStringAsync(active.text); closeMenu(); showToast('Copied'); } }] : []),
              { label: active.starred ? 'Unstar' : 'Star', Icon: Star, onPress: () => { void useMessagingStore.getState().star(active.id, convId); closeMenu(); } },
              { label: active.pinned ? 'Unpin' : 'Pin', Icon: Pin, onPress: () => { void useMessagingStore.getState().pin(active.id, convId).then(refreshPinned); closeMenu(); } },
              ...(active.mine && active.type === 'text' && Date.now() - new Date(active.sentAt).getTime() < EDIT_WINDOW_MS ? [{ label: 'Edit', Icon: Pencil, onPress: () => startEdit(active) }] : []),
              { label: 'Delete for me', Icon: Trash2, onPress: () => { void useMessagingStore.getState().remove(active.id, convId, 'me'); closeMenu(); } },
              ...(active.mine && Date.now() - new Date(active.sentAt).getTime() < DELETE_EVERYONE_MS ? [{ label: 'Delete for everyone', Icon: Trash2, danger: true, onPress: () => { void useMessagingStore.getState().remove(active.id, convId, 'everyone'); closeMenu(); } }] : []),
            ].map((a) => (
              <Pressable key={a.label} onPress={a.onPress} className="flex-row items-center gap-3" style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
                <a.Icon size={18} color={(a as { danger?: boolean }).danger ? colors.danger : colors.ink} />
                <Text style={{ color: (a as { danger?: boolean }).danger ? colors.danger : colors.ink, fontSize: 14, fontWeight: '600' }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

function AttachOption({ Icon, label, color, onPress }: { Icon: typeof FileText; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="items-center gap-1.5">
      <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}><Icon size={22} color="#fff" /></View>
      <Text style={{ color: colors.ink, fontSize: 10.5, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function Attachments({ m, mine, onOpenImage }: { m: StoredMessage; mine: boolean; onOpenImage: (uri: string) => void }) {
  return (
    <>
      {m.attachments.map((att: ChatAttachment, i: number) => {
        const url = mediaUrl(att.url);
        if (m.type === 'image') {
          const ratio = att.width && att.height ? att.height / att.width : 0.75;
          return (
            <Pressable key={i} onPress={() => onOpenImage(url)} style={{ marginBottom: 4 }}>
              <Image source={{ uri: url }} style={{ width: 210, height: Math.min(280, 210 * ratio), borderRadius: 12, backgroundColor: colors.coolMuted }} resizeMode="cover" />
            </Pressable>
          );
        }
        if (m.type === 'video') {
          return (
            <Pressable key={i} onPress={() => void Linking.openURL(url)} style={{ width: 210, height: 140, borderRadius: 12, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              {att.thumbnailUrl ? <Image source={{ uri: mediaUrl(att.thumbnailUrl) }} style={{ position: 'absolute', width: 210, height: 140, borderRadius: 12 }} /> : null}
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' }}><Play size={20} color={colors.ink} /></View>
            </Pressable>
          );
        }
        if (m.type === 'voice') {
          return <VoiceMessage key={i} uri={url} durationSec={(att.durationMs ?? 0) / 1000} outgoing={mine} />;
        }
        // document
        return (
          <Pressable key={i} onPress={() => void Linking.openURL(url)} className="flex-row items-center gap-2" style={{ paddingVertical: 6, marginBottom: 2 }}>
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: mine ? 'rgba(255,255,255,0.18)' : colors.coolMuted, alignItems: 'center', justifyContent: 'center' }}><FileText size={19} color={mine ? '#fff' : colors.primary} /></View>
            <View style={{ maxWidth: 180 }}>
              <Text numberOfLines={1} style={{ color: mine ? '#fff' : colors.ink, fontSize: 13.5, fontWeight: '600' }}>{att.name}</Text>
              <Text style={{ color: mine ? 'rgba(255,255,255,0.65)' : colors.coolText, fontSize: 11 }}>{humanSize(att.size)}</Text>
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

// WhatsApp-style centered grey notice for group events ("X added Y", "Z left", subject changes).
function SystemNotice({ text }: { text: string }) {
  if (!text) return null;
  return (
    <View className="items-center" style={{ marginVertical: 6 }}>
      <View style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, maxWidth: '85%' }}>
        <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{text}</Text>
      </View>
    </View>
  );
}

// Centered day-separator pill (WhatsApp-style) shown before the first message of each calendar day.
function DateSeparator({ label }: { label: string }) {
  return (
    <View className="items-center" style={{ marginVertical: 8 }}>
      <View style={{ backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5 }}>
        <Text style={{ color: colors.coolText, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.3 }}>{label}</Text>
      </View>
    </View>
  );
}

// Full-width "N unread messages" band above the first message the user hasn't read (WhatsApp-style).
function UnreadDivider({ count }: { count: number }) {
  return (
    <View className="flex-row items-center" style={{ marginVertical: 8, gap: 8 }}>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.primary + '55' }} />
      <View style={{ backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
        <Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 }}>
          {count} unread message{count === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.primary + '55' }} />
    </View>
  );
}

// Swipe-right-to-reply (WhatsApp-style). The message row follows the finger to the right, a reply
// arrow grows in on the left, and releasing past the threshold sets the reply target (with a tiny
// haptic tick when the threshold is crossed). Horizontal-only: it yields to the vertical list
// scroll (failOffsetY) and never starts on a leftward drag (activeOffsetX), so taps/scrolls are
// untouched. Applied to every non-deleted message, incoming or outgoing.
const REPLY_THRESHOLD = 56;
const REPLY_MAX_DRAG = 80;
function SwipeToReply({ onReply, children }: { onReply: () => void; children: React.ReactNode }) {
  const tx = useSharedValue(0);
  const reached = useSharedValue(false);
  const tick = (): void => { try { Vibration.vibrate(8); } catch { /* no vibrator */ } };
  const pan = Gesture.Pan()
    .activeOffsetX(12) // only a rightward drag starts it
    .failOffsetY([-12, 12]) // a vertical drag scrolls the list instead
    .onUpdate((e) => {
      const x = Math.max(0, Math.min(e.translationX, REPLY_MAX_DRAG));
      tx.value = x;
      const past = x >= REPLY_THRESHOLD;
      if (past && !reached.value) { reached.value = true; runOnJS(tick)(); }
      else if (!past && reached.value) { reached.value = false; }
    })
    .onEnd(() => {
      if (reached.value) runOnJS(onReply)();
      tx.value = withSpring(0, { damping: 20, stiffness: 220 });
      reached.value = false;
    });
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [8, REPLY_THRESHOLD], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(tx.value, [8, REPLY_THRESHOLD], [0.4, 1], Extrapolation.CLAMP) }],
  }));
  return (
    <View style={{ justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 8 }, iconStyle]}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Reply size={18} color={colors.primary} />
        </View>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

function Bubble({ m, isGroup, nameOf, onPress, onOpenImage, onRetry }: { m: StoredMessage; isGroup: boolean; nameOf: (id: string) => string; onPress: () => void; onOpenImage: (uri: string) => void; onRetry: (clientId: string) => void }) {
  const mine = m.mine;
  const deleted = m.deletedForEveryone;
  // WhatsApp tick glyphs: pending → clock, sent → ✓, delivered → ✓✓ muted, read → ✓✓ light blue
  // (#53BDEB is WhatsApp's read-tick blue — it stays legible on the green outgoing bubble).
  const tickColor = m.status === 'read' ? '#53BDEB' : 'rgba(255,255,255,0.65)';
  const TickIcon = m.pending ? Clock : m.status === 'sent' ? Check : CheckCheck;
  const hasMedia = !deleted && m.type !== 'text' && m.attachments.length > 0;
  return (
    <View className="mb-2.5" style={{ maxWidth: '80%', alignSelf: mine ? 'flex-end' : 'flex-start' }}>
      <Pressable onPress={onPress} style={{ paddingHorizontal: 9, paddingVertical: 7, borderRadius: 16, backgroundColor: mine ? colors.primary : colors.card, borderTopLeftRadius: mine ? 16 : 4, borderTopRightRadius: mine ? 4 : 16 }}>
        {isGroup && !mine && !deleted ? <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginBottom: 2, marginLeft: 4 }}>{nameOf(m.senderId)}</Text> : null}
        {m.replyTo ? (
          <View style={{ borderLeftWidth: 3, borderLeftColor: mine ? 'rgba(255,255,255,0.7)' : colors.primary, paddingLeft: 6, marginBottom: 4, marginHorizontal: 4, opacity: 0.9 }}>
            <Text numberOfLines={1} style={{ color: mine ? 'rgba(255,255,255,0.8)' : colors.coolText, fontSize: 12.5 }}>{m.replyTo.preview}</Text>
          </View>
        ) : null}
        {hasMedia ? <Attachments m={m} mine={mine} onOpenImage={onOpenImage} /> : null}
        {deleted ? (
          <Text style={{ color: mine ? 'rgba(255,255,255,0.7)' : colors.coolText, fontSize: 14, fontStyle: 'italic', paddingHorizontal: 4 }}>This message was deleted</Text>
        ) : m.text ? (
          <Text style={{ color: mine ? '#fff' : colors.ink, fontSize: 15, lineHeight: 21, paddingHorizontal: 4 }}>{m.text}</Text>
        ) : null}
        <View className="flex-row items-center gap-1" style={{ alignSelf: 'flex-end', marginTop: 3, paddingHorizontal: 4 }}>
          {m.edited && !deleted ? <Text style={{ color: mine ? 'rgba(255,255,255,0.55)' : colors.coolText3, fontSize: 10 }}>edited</Text> : null}
          <Text style={{ color: mine ? 'rgba(255,255,255,0.65)' : colors.coolText3, fontSize: 11, fontWeight: '500' }}>{hhmm(m.createdAt)}</Text>
          {mine && !deleted && !m.failed ? <TickIcon size={14} color={tickColor} /> : null}
        </View>
        {mine && m.failed ? (
          <Pressable onPress={() => m.clientId && onRetry(m.clientId)} style={{ alignSelf: 'flex-end', paddingHorizontal: 4 }}>
            <Text style={{ color: '#FFD1CC', fontSize: 10.5, fontWeight: '800' }}>⚠ Failed · tap to retry</Text>
          </Pressable>
        ) : null}
      </Pressable>
      {m.reactions.length ? (
        <View className="flex-row" style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: -6, marginRight: 4 }}>
          <View style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
            <Text style={{ fontSize: 12 }}>{[...new Set(m.reactions.map((r) => r.emoji))].join(' ')} {m.reactions.length}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

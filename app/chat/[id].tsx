import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, Image, Modal, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, MoreVertical, Send, X, Reply, Copy, Star, Pin, Pencil, Trash2, Paperclip, Mic, FileText, Play, Image as ImageIcon, Phone, Clock, Check, CheckCheck } from 'lucide-react-native';
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

  const messages = useMessagingStore((s) => s.messages[convId]) ?? [];
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

  useEffect(() => { if (convFromStore) setConv(convFromStore); }, [convFromStore]);

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
  const pickImageOrVideo = async (): Promise<void> => {
    setAttachOpen(false);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 1 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
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
            data={messages}
            keyExtractor={(m) => m.id}
            style={{ flex: 1, backgroundColor: colors.coolBg }}
            contentContainerStyle={{ padding: 12 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={<View className="items-center" style={{ paddingVertical: 48 }}><Text style={{ color: colors.coolText, fontSize: 14 }}>No messages yet — say hi 👋</Text></View>}
            renderItem={({ item: m }) => (m.type === 'system'
              ? <SystemNotice text={m.text} />
              : <Bubble m={m} isGroup={isGroup} nameOf={nameOf} onPress={() => !m.deletedForEveryone && setActive(m)} onOpenImage={setViewer} onRetry={(cid) => void useMessagingStore.getState().retry(cid)} />)}
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

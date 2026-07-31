import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, Image, Modal, Linking, Platform, ScrollView, StyleSheet, Vibration, Alert, Keyboard } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS, interpolate, Extrapolation } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronDown, MoreVertical, Send, X, Reply, Copy, Star, Pin, Pencil, Trash2, Plus, Mic, FileText, Play, Image as ImageIcon, Camera, Clock, Check, CheckCheck, Forward as ForwardIcon, Megaphone, ListChecks, Info, Download, Smile } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Avatar } from '../../src/components/ui';
import { VoiceMessage, LinkedText } from '../../src/components/chat';
import { EmojiPicker } from '../../src/components/chat/EmojiPicker';
import { colors as themeColors } from '../../src/theme';
import { useUiStore } from '../../src/store/uiStore';
import { useAccessStore } from '../../src/store/accessStore';
import { useMessagingStore, toEpochMs, type StoredMessage } from '../../src/store/messagingStore';
import { getConversation, getPinned, getReceipts, type ChatConversation, type ChatAttachment, type ChatMessage, type MessageReceipts } from '../../src/api/chat';
import { uploadFile, mediaUrl, toAttachment, humanSize } from '../../src/api/media';
import { listUsers, toUser } from '../../src/api/directory';
import { activeMention, applyMention, rankMentionMatches, mentionIdsInText, hasEveryoneMention, MENTION_EVERYONE } from '../../src/logic/mentions';
import type { User } from '../../src/types';
import { useVoiceRecorder } from '../../src/hooks/useVoiceRecorder';
import { joinConversation, leaveConversation, emitTyping, emitStopTyping, emitRead } from '../../src/realtime/chatSocket';
import { daySeparator, isDifferentDay, dateStamp } from '../../src/utils/time';

// Chat-screen redesign palette (kbiz360_chat_screen_redesign mockup): teal accent, white message
// cards with hairline borders on a cool grey canvas. Shadows the app theme LOCALLY so the rest of
// the app (chat list, tabs, reminders) keeps its green accent untouched.
const colors = {
  ...themeColors,
  primary: '#12857A',
  primaryDark: '#0F4B44',
  primarySoft: '#F3FAF8',
  coolBg: '#ECEFF3',
  coolDivider: '#E4E8ED',
  coolMuted: '#F2F5F7',
  coolText: '#5F6871',
  coolText3: '#98A0A8',
  ink: '#0F1418',
};
const TICK_MUTED = '#B6BEC6'; // sent/delivered ticks + pending clock
const TIME_FAINT = '#A2AAB2'; // in-bubble timestamps
const ONLINE_DOT = '#2BC48A'; // avatar presence dot

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
  const conversations = useMessagingStore((s) => s.conversations);
  const myUserId = useMessagingStore((s) => s.myUserId);
  const presence = useMessagingStore((s) => s.presence);
  const users = useAccessStore((s) => s.users);

  const [conv, setConv] = useState<ChatConversation | undefined>(convFromStore);
  const [text, setText] = useState('');
  // Caret position + controlled-selection override, for @-mention insertion (same pattern as the
  // reminder composer): `sel` is set once after a pick to park the caret, then released.
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState<{ start: number; end: number } | undefined>(undefined);
  const [active, setActive] = useState<StoredMessage | null>(null);
  const [reactionsFor, setReactionsFor] = useState<string | null>(null); // message id → reactions sheet
  const [reactPickerOpen, setReactPickerOpen] = useState<string | null>(null); // message id → full emoji picker
  const [infoFor, setInfoFor] = useState<StoredMessage | null>(null);
  const [savingImage, setSavingImage] = useState(false);
  const [editing, setEditing] = useState<StoredMessage | null>(null);
  const [replyTo, setReplyTo] = useState<StoredMessage | null>(null);
  const [forwardMsgs, setForwardMsgs] = useState<StoredMessage[]>([]); // [] = sheet closed
  const [forwarding, setForwarding] = useState(false);
  // Multi-select (WhatsApp-style): long-press enters selection mode, taps toggle; the header
  // becomes an action bar (copy/star/forward/delete). Empty = not selecting.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<number | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false); // WhatsApp-style emoji panel below the composer
  const [viewer, setViewer] = useState<string | null>(null);
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const [contactOpen, setContactOpen] = useState(false);
  // Jump-to-pinned (WhatsApp-style): which pin the banner targets next, the message id waiting to be
  // scrolled to (resolved by an effect once the row is in the list data), and the highlight flash.
  const [pinIdx, setPinIdx] = useState(0);
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    setPinIdx(0); setPendingJump(null); setHighlightId(null);
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
        : otherPresence.status === 'online' ? 'Online'
          : offlineAt ? lastSeenLabel(offlineAt) : 'last seen recently'
      : conv?.online ? 'Online' : convLastSeen ? lastSeenLabel(convLastSeen) : 'last seen recently';
  const otherOnline = !isGroup && (otherPresence ? otherPresence.status === 'online' : !!conv?.online);
  const subtitle = isGroup ? `${conv?.memberCount ?? 0} members` : presenceLabel;

  const onChangeText = (t: string): void => {
    setText(t);
    emitTyping(convId);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitStopTyping(convId), 1500);
  };

  // ── @-mentions (groups only, WhatsApp-style) ──
  // Typing "@" opens the member list above the composer; picking someone writes "@Full Name " into
  // the text. At send time the text is re-scanned against the roster to build the mentions ids.
  const mentionPeople = useMemo<User[]>(() => {
    if (conv?.type !== 'group') return [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return (conv.members ?? []).map((m) => byId.get(m.userId)).filter((u): u is User => !!u && u.id !== myUserId);
  }, [conv?.type, conv?.members, users, myUserId]);
  const mention = isGroup && !editing ? activeMention(text, cursor) : null;
  const mentionMatches = mention ? rankMentionMatches(mentionPeople, mention.query) : [];
  // "@everyone" notifies the whole group — admin-gated like WhatsApp (group admins, the creator,
  // and super-admins) so one member can't spam-ping everybody. Pure UI gate: expanding it to all
  // member ids at send time is the same as mentioning each person, which the API allows anyway.
  const canMentionEveryone = isGroup && (conv?.myRole === 'admin' || conv?.createdBy === myUserId
    || users.find((u) => u.id === myUserId)?.role === 'SUPER_ADMIN');
  const showEveryone = !!mention && canMentionEveryone && MENTION_EVERYONE.startsWith(mention.query.trim().toLowerCase());
  const applyPicked = (name: string): void => {
    if (!mention) return;
    const next = applyMention(text, mention, name);
    setText(next.text);
    setCursor(next.cursor);
    setSel({ start: next.cursor, end: next.cursor });
  };
  const pickMention = (p: User): void => applyPicked(p.name);
  const pickEveryone = (): void => applyPicked(MENTION_EVERYONE);

  // ── emoji panel (WhatsApp-style) ──
  // Smiley toggles the panel (dismissing the keyboard); focusing the input brings the keyboard
  // back and hides the panel. Insertions go to the tracked cursor, exactly like mention picks.
  useEffect(() => { if (keyboardVisible) setEmojiOpen(false); }, [keyboardVisible]);
  const toggleEmoji = (): void => {
    if (!emojiOpen) { Keyboard.dismiss(); setAttachOpen(false); }
    setEmojiOpen((v) => !v);
  };
  const insertEmoji = (e: string): void => {
    const next = text.slice(0, cursor) + e + text.slice(cursor);
    const c = cursor + e.length;
    setText(next); setCursor(c); setSel({ start: c, end: c });
  };
  const emojiBackspace = (): void => {
    if (cursor <= 0) return;
    // Drop one code point before the cursor (a naive slice(-1) can cut an emoji's surrogate pair
    // in half). ZWJ family sequences may take a few presses — same as most non-WhatsApp keyboards.
    const before = Array.from(text.slice(0, cursor));
    before.pop();
    const head = before.join('');
    setText(head + text.slice(cursor));
    setCursor(head.length); setSel({ start: head.length, end: head.length });
  };

  const submitText = async (): Promise<void> => {
    const t = text.trim();
    if (!t) return;
    if (editing) { await useMessagingStore.getState().edit(editing.id, convId, t); setEditing(null); setText(''); return; }
    setText('');
    emitStopTyping(convId);
    let mentions = isGroup ? mentionIdsInText(t, mentionPeople) : undefined;
    if (isGroup && canMentionEveryone && hasEveryoneMention(t)) {
      mentions = mentionPeople.map((p) => p.id); // @everyone ⇒ the whole roster (supersedes named picks)
    }
    await useMessagingStore.getState().send(convId, t, replyTo?.id, mentions?.length ? mentions : undefined);
    setReplyTo(null);
  };

  // ── forward ──
  // Target list: every existing chat (recent first, as the store keeps them), then teammates with
  // no direct chat yet — picking one of those creates the DM on the fly (openDirect) before sending.
  const forwardTargets = useMemo<ForwardTarget[]>(() => {
    if (!forwardMsgs.length) return [];
    const convT: ForwardTarget[] = conversations.filter((c) => !c.archived).map((c) => ({
      key: `c:${c.id}`, kind: 'conv', id: c.id, name: c.name,
      sub: c.type === 'group' ? `Group · ${c.memberCount} members` : null,
      initials: (c.name[0] ?? '?').toUpperCase(), color: c.type === 'group' ? colors.purple : colors.blue,
      avatarUri: c.image ? mediaUrl(c.image) : null,
    }));
    const haveDirect = new Set(conversations.filter((c) => c.type === 'direct' && c.otherUserId).map((c) => c.otherUserId as string));
    const userT: ForwardTarget[] = users
      .filter((u) => u.id !== myUserId && !haveDirect.has(u.id))
      .map((u) => ({ key: `u:${u.id}`, kind: 'user', id: u.id, name: u.name, sub: u.position ?? u.roleName ?? null, initials: u.initials, color: u.color, avatarUri: u.avatar ?? null }));
    return [...convT, ...userT];
  }, [forwardMsgs.length, conversations, users, myUserId]);

  const doForward = async (targets: ForwardTarget[]): Promise<void> => {
    if (!forwardMsgs.length || forwarding || !targets.length) return;
    setForwarding(true);
    try {
      const store = useMessagingStore.getState();
      const convIds: string[] = [];
      for (const t of targets) convIds.push(t.kind === 'conv' ? t.id : await store.openDirect(t.id));
      // Multi-select: forward in chronological order so the copies read like the original thread.
      let n = 0;
      for (const msg of forwardMsgs) n = await store.forward(msg.id, convIds);
      showToast(n ? `Forwarded to ${n} chat${n === 1 ? '' : 's'}` : 'Could not forward');
      setForwardMsgs([]);
      setSelectedIds([]);
    } catch {
      showToast('Could not forward — check your connection');
    } finally {
      setForwarding(false);
    }
  };

  // ── multi-select ──
  const selecting = selectedIds.length > 0;
  const selectedMsgs = useMemo(() => messages.filter((m) => selectedIds.includes(m.id)), [messages, selectedIds]); // chronological
  // Deleted/system rows aren't selectable; pending/failed have no server id yet (nothing to act on).
  const toggleSelect = (m: StoredMessage): void => {
    if (m.deletedForEveryone || m.type === 'system' || m.pending || m.failed) return;
    setSelectedIds((cur) => (cur.includes(m.id) ? cur.filter((x) => x !== m.id) : [...cur, m.id]));
  };
  const exitSelect = (): void => setSelectedIds([]);
  // WhatsApp long-press: select the message AND open the reactions/action menu in one gesture.
  // Dismissing the menu keeps the selection, so tapping more messages extends it; picking an
  // action applies to this message and leaves selection mode (finishAction). Once already
  // selecting, long-press just toggles like a tap.
  const onMsgLongPress = (m: StoredMessage): void => {
    if (m.deletedForEveryone || m.type === 'system') return;
    if (selecting) { toggleSelect(m); return; }
    toggleSelect(m);
    setActive(m);
  };
  const copySelected = (): void => {
    const texts = selectedMsgs.filter((m) => m.text);
    const out = texts.length === 1 ? texts[0].text : texts.map((m) => `${nameOf(m.senderId)}: ${m.text}`).join('\n');
    void Clipboard.setStringAsync(out);
    showToast('Copied');
    exitSelect();
  };
  const starSelected = (): void => {
    const store = useMessagingStore.getState();
    for (const m of selectedMsgs) if (!m.starred) void store.star(m.id, convId);
    showToast('Starred');
    exitSelect();
  };
  const deleteSelected = (): void => {
    const n = selectedMsgs.length;
    // "Delete for everyone" only when EVERY selected message is deletable that way (mine + in window).
    const allMine = selectedMsgs.every((m) => m.mine && Date.now() - new Date(m.sentAt).getTime() < DELETE_EVERYONE_MS);
    const store = useMessagingStore.getState();
    Alert.alert(`Delete ${n} message${n === 1 ? '' : 's'}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete for me', onPress: () => { for (const m of selectedMsgs) void store.remove(m.id, convId, 'me'); exitSelect(); } },
      ...(allMine ? [{ text: 'Delete for everyone', style: 'destructive' as const, onPress: () => { for (const m of selectedMsgs) void store.remove(m.id, convId, 'everyone'); exitSelect(); } }] : []),
    ]);
  };

  // ── media ──
  // Download the viewer's image to cache, then hand it to the OS share sheet
  // ("Save Image" / "Save to Photos" live there). OTA-safe: expo-file-system +
  // expo-sharing are already compiled into the shipped builds — expo-media-library
  // (direct gallery save) is NOT, and adding it would need a new native build.
  const downloadViewerImage = async (): Promise<void> => {
    if (!viewer || savingImage) return;
    setSavingImage(true);
    try {
      const FS = await import('expo-file-system/legacy');
      const Sharing = await import('expo-sharing');
      const raw = viewer.split('/').pop()?.split('?')[0] || `kb360-image-${Date.now()}.jpg`;
      const name = raw.includes('.') ? raw : `${raw}.jpg`;
      const res = await FS.downloadAsync(viewer, `${FS.cacheDirectory}${name}`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, { mimeType: res.mimeType ?? 'image/jpeg', dialogTitle: 'Save image' });
      } else {
        showToast('Sharing is unavailable on this device');
      }
    } catch {
      showToast('Could not download image');
    } finally {
      setSavingImage(false);
    }
  };

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
  // A menu action acted on the single message — close the menu AND leave selection mode.
  const finishAction = (): void => { setActive(null); setSelectedIds([]); };
  const startEdit = (m: StoredMessage): void => { setEditing(m); setText(m.text); setReplyTo(null); finishAction(); };
  const refreshPinned = (): void => { getPinned(convId).then((p) => { setPinned(p); setPinIdx(0); }).catch(() => setPinned([])); };

  // Tap the banner → scroll to the pinned message (cycling through pins on repeated taps). The
  // target may be far above the last-40 window the chat opened with, so page history in until it's
  // loaded (bounded so a deleted/foreign id can't loop forever), then let the effect below scroll.
  const jumpToMessage = async (messageId: string): Promise<void> => {
    const store = useMessagingStore.getState;
    const has = (): boolean => (store().messages[convId] ?? []).some((m) => m.id === messageId);
    for (let hops = 0; !has() && hops < 25; hops++) {
      if ((await store().loadOlderMessages(convId)) === 0) break;
    }
    if (!has()) { showToast('Message is no longer available'); return; }
    setPendingJump(messageId);
  };
  const jumpToPinned = (): void => {
    if (!pinned.length) return;
    const i = pinIdx % pinned.length;
    setPinIdx((i + 1) % pinned.length);
    void jumpToMessage(pinned[i].id);
  };

  // Scroll fires from an effect (not inline in jumpToMessage) so rows paged in above are already in
  // the FlatList's data — scrollToIndex on a not-yet-committed index throws.
  useEffect(() => {
    if (!pendingJump) return;
    const idx = reversed.findIndex((m) => m.id === pendingJump);
    if (idx < 0) return;
    setPendingJump(null);
    listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    setHighlightId(pendingJump);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 2000);
  }, [pendingJump, reversed]);
  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    if (scrollRetry.current) clearTimeout(scrollRetry.current);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      {/* Selection action bar — replaces the header while messages are selected (WhatsApp-style) */}
      {selecting ? (
        <View className="flex-row items-center gap-1 px-2" style={{ backgroundColor: colors.card, height: 60, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
          <Pressable onPress={exitSelect} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={colors.ink} /></Pressable>
          <Text style={{ flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' }}>{selectedIds.length}</Text>
          {selectedMsgs.some((m) => m.text) ? (
            <Pressable onPress={copySelected} accessibilityLabel="Copy" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Copy size={20} color={colors.ink} /></Pressable>
          ) : null}
          <Pressable onPress={starSelected} accessibilityLabel="Star" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Star size={20} color={colors.ink} /></Pressable>
          <Pressable onPress={deleteSelected} accessibilityLabel="Delete" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={20} color={colors.ink} /></Pressable>
          <Pressable onPress={() => setForwardMsgs(selectedMsgs)} accessibilityLabel="Forward" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ForwardIcon size={20} color={colors.ink} /></Pressable>
        </View>
      ) : (
      <View className="flex-row items-center gap-2 px-2" style={{ backgroundColor: colors.card, height: 60, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <Pressable disabled={!isGroup} onPress={() => router.push({ pathname: '/chat/group-info', params: { id: convId } })} className="flex-1 flex-row items-center gap-2.5">
          <View style={{ position: 'relative' }}>
            <Avatar initials={(title[0] ?? '?').toUpperCase()} color={isGroup ? colors.purple : colors.primary} size={40} uri={conv?.image ? mediaUrl(conv.image) : null} />
            {otherOnline ? <View style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: ONLINE_DOT, borderWidth: 2.5, borderColor: '#fff' }} /> : null}
          </View>
          <View className="flex-1">
            <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 16, fontWeight: '600' }}>{title}</Text>
            {/* One subtitle line, mockup-style: "Finance Manager · Online" — the presence part goes
                teal when live (online/typing), the position stays grey. */}
            <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, color: colors.coolText3 }}>
              {!isGroup && otherPosition ? `${otherPosition} · ` : ''}
              <Text style={{ color: typingUsers.length || otherOnline ? colors.primary : colors.coolText3, fontStyle: typingUsers.length ? 'italic' : 'normal' }}>{subtitle}</Text>
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={() => (isGroup ? router.push({ pathname: '/chat/group-info', params: { id: convId } }) : setContactOpen(true))} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><MoreVertical size={21} color={colors.ink} /></Pressable>
      </View>
      )}

      {/* Pinned bar — compact mockup style: teal rail + uppercase label; tap scrolls to the pinned
          message (repeated taps cycle through pins via the chevron too) */}
      {pinned.length > 0 ? (() => {
        const cur = pinned[pinIdx % pinned.length];
        return (
          <Pressable onPress={jumpToPinned} className="flex-row items-center" style={{ gap: 12, paddingVertical: 8, paddingLeft: 16, paddingRight: 12, backgroundColor: '#fff', borderTopColor: colors.coolDivider, borderTopWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.coolDivider, borderBottomWidth: StyleSheet.hairlineWidth }}>
            <View style={{ width: 3, height: 26, borderRadius: 2, backgroundColor: colors.primary }} />
            <View className="flex-1">
              <Text numberOfLines={1} style={{ color: colors.primary, fontSize: 11, fontWeight: '600', letterSpacing: 0.8, lineHeight: 14 }}>
                {pinned.length > 1 ? `PINNED MESSAGE ${(pinIdx % pinned.length) + 1} OF ${pinned.length}` : 'PINNED MESSAGE'}
              </Text>
              <Text numberOfLines={1} style={{ color: '#3A424B', fontSize: 13, lineHeight: 18 }}>{cur.text || `[${cur.type}]`}</Text>
            </View>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.coolMuted, alignItems: 'center', justifyContent: 'center' }}>
              <ChevronDown size={16} color={colors.coolText} />
            </View>
          </Pressable>
        );
      })() : null}

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
            // Jump-to-pinned can target a row far outside the rendered window (no getItemLayout —
            // rows are variable height): land near it by estimate, then retry precisely once rendered.
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
              if (scrollRetry.current) clearTimeout(scrollRetry.current);
              scrollRetry.current = setTimeout(() => {
                try { listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 }); } catch { /* already near it */ }
              }, 400);
            }}
            renderItem={({ item: m, index }) => {
              // Inverted list: `index+1` is the chronologically OLDER message. WhatsApp-style day
              // separator: a centered date pill before the FIRST (oldest) message of each calendar
              // day — i.e. when the older neighbour is a different day (or this is the oldest message).
              const older = index < reversed.length - 1 ? reversed[index + 1] : null;
              const showDay = !older || isDifferentDay(new Date(older.createdAt).getTime(), new Date(m.createdAt).getTime());
              const showUnread = unreadDivider?.anchorId === m.id;
              const isSel = selectedIds.includes(m.id);
              const bubble = (
                <Bubble m={m} isGroup={isGroup} nameOf={nameOf}
                  onPress={() => (selecting ? toggleSelect(m) : !m.deletedForEveryone && setActive(m))}
                  onLongPress={() => onMsgLongPress(m)}
                  selecting={selecting}
                  onOpenImage={setViewer} onRetry={(cid) => void useMessagingStore.getState().retry(cid)} onForward={() => setForwardMsgs([m])}
                  onReactions={() => setReactionsFor(m.id)} />
              );
              const row = m.type === 'system'
                ? <SystemNotice text={m.text} />
                // Swipe a message right to reply (WhatsApp-style). Deleted messages aren't replyable,
                // and the gesture is parked while selecting so drags don't fight the toggles.
                : m.deletedForEveryone || selecting
                  ? bubble
                  : <SwipeToReply onReply={() => setReplyTo(m)}>{bubble}</SwipeToReply>;
              // Inverted list reverses the vertical order WITHIN a cell, so render the bubble first
              // and the separators after — they then appear ABOVE the message on screen.
              // The FULL row (empty space beside the bubble included) long-presses into selection
              // (WhatsApp-style); the bubble's own handlers win for touches on the bubble itself.
              return (
                <>
                  {m.type === 'system'
                    ? row
                    : (
                      <Pressable onLongPress={() => onMsgLongPress(m)} onPress={selecting ? () => toggleSelect(m) : undefined}
                        style={isSel || m.id === highlightId ? { backgroundColor: colors.primary + '2E', borderRadius: 14, marginHorizontal: -6, paddingHorizontal: 6 } : undefined}>
                        {row}
                      </Pressable>
                    )}
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

        {/* @-mention suggestions — member list above the composer (groups only). Admins also get
            a pinned "Everyone" row that pings the whole group. */}
        {mention && (mentionMatches.length > 0 || showEveryone) ? (
          <View style={{ backgroundColor: colors.card, borderTopColor: colors.coolDivider, borderTopWidth: 1 }}>
            {showEveryone ? (
              <Pressable onPress={pickEveryone} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-2.5"
                style={{ paddingHorizontal: 14, paddingVertical: 9 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Megaphone size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>Everyone</Text>
                  <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 11.5 }}>Notify all {mentionPeople.length} members</Text>
                </View>
              </Pressable>
            ) : null}
            {mentionMatches.map((p, i) => (
              <Pressable key={p.id} onPress={() => pickMention(p)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-2.5"
                style={{ paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: i === 0 && !showEveryone ? 0 : 1, borderTopColor: colors.coolDivider }}>
                <Avatar initials={p.initials} color={p.color} size={32} uri={p.avatar} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{p.name}</Text>
                  {p.position || p.roleName ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 11.5 }}>{p.position ?? p.roleName}</Text> : null}
                </View>
              </Pressable>
            ))}
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

        {/* Composer — mockup style: plus button, grey pill with camera inside, teal circular send/mic */}
        <View className="flex-row items-end gap-2" style={{ backgroundColor: '#fff', borderTopColor: colors.coolDivider, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 10, paddingBottom: keyboardVisible ? 8 : insets.bottom + 10 }}>
          <Pressable onPress={isRecording ? () => void cancel() : () => setAttachOpen((v) => !v)} style={{ width: 44, height: 46, alignItems: 'center', justifyContent: 'center' }}>
            {isRecording ? <Trash2 size={22} color={colors.danger} /> : <Plus size={24} color={colors.coolText} />}
          </Pressable>
          {isRecording ? (
            <View className="flex-row items-center gap-2" style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 23, backgroundColor: '#FDECEC' }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger }} />
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>{mmss(elapsedSec)}</Text>
              <Text style={{ color: colors.coolText, fontSize: 13 }}>Recording…</Text>
            </View>
          ) : (
            <View className="flex-row items-end" style={{ flex: 1, minHeight: 46, borderRadius: 23, backgroundColor: colors.coolMuted, paddingLeft: 6, paddingRight: 10 }}>
              <Pressable onPress={toggleEmoji} hitSlop={6} style={{ width: 34, height: 46, alignItems: 'center', justifyContent: 'center' }}>
                <Smile size={22} color={emojiOpen ? colors.primary : colors.coolText} />
              </Pressable>
              <TextInput value={text} onChangeText={onChangeText} onFocus={() => { setAttachOpen(false); setEmojiOpen(false); }} onSubmitEditing={submitText} placeholder={isGroup ? 'Message — @ to mention' : 'Message'} placeholderTextColor={colors.coolText3} multiline
                selection={sel}
                onSelectionChange={(e) => { setCursor(e.nativeEvent.selection.start); if (sel) setSel(undefined); }}
                style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: colors.ink, maxHeight: 110 }} />
              <Pressable onPress={() => void takePhoto()} hitSlop={6} style={{ width: 34, height: 46, alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={21} color={colors.coolText} />
              </Pressable>
            </View>
          )}
          <Pressable onPress={() => { if (text.trim()) return void submitText(); return void onMic(); }}
            style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: isRecording ? colors.danger : colors.primary }}>
            {text.trim() || isRecording ? <Send size={20} color="#fff" /> : <Mic size={22} color="#fff" />}
          </Pressable>
        </View>

        {/* Emoji panel — sits where the keyboard would be (smiley toggles it, focusing the input swaps back). */}
        {emojiOpen && !isRecording ? <EmojiPicker onPick={insertEmoji} onBackspace={emojiBackspace} /> : null}
      </KeyboardAvoidingView>

      {/* Full-screen image viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          {viewer ? <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
          <Pressable onPress={() => setViewer(null)} style={{ position: 'absolute', top: insets.top + 12, right: 18 }}><X size={26} color="#fff" /></Pressable>
          <Pressable onPress={() => void downloadViewerImage()} hitSlop={10} style={{ position: 'absolute', top: insets.top + 12, left: 18 }}>
            {savingImage ? <ActivityIndicator color="#fff" /> : <Download size={24} color="#fff" />}
          </Pressable>
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

      {/* Action menu */}
      {active ? (
        <Pressable onPress={closeMenu} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 8, minWidth: 250 }}>
            <View className="flex-row items-center justify-around" style={{ paddingVertical: 6, marginBottom: 4, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
              {/* My current reaction is highlighted; tapping it again REMOVES it (server toggles). */}
              {REACTIONS.map((e) => {
                const isMine = active.reactions.some((r) => r.userId === myUserId && r.emoji === e);
                return (
                  <Pressable key={e} onPress={() => { void useMessagingStore.getState().react(active.id, e); finishAction(); }}
                    style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: isMine ? colors.primarySoft : 'transparent' }}>
                    <Text style={{ fontSize: 24 }}>{e}</Text>
                  </Pressable>
                );
              })}
              {/* "+" → full emoji picker, WhatsApp-style. */}
              <Pressable onPress={() => { setReactPickerOpen(active.id); closeMenu(); }}
                style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}>
                <Plus size={20} color={colors.coolText} />
              </Pressable>
            </View>
            {[
              { label: 'Reply', Icon: Reply, onPress: () => { setReplyTo(active); finishAction(); } },
              { label: 'Forward', Icon: ForwardIcon, onPress: () => { setForwardMsgs([active]); finishAction(); } },
              // Keep (don't toggle) the long-pressed message selected and stay in selection mode.
              { label: 'Select', Icon: ListChecks, onPress: () => { setSelectedIds((cur) => (cur.includes(active.id) ? cur : [...cur, active.id])); closeMenu(); } },
              ...(active.type === 'text' ? [{ label: 'Copy', Icon: Copy, onPress: () => { void Clipboard.setStringAsync(active.text); finishAction(); showToast('Copied'); } }] : []),
              { label: active.starred ? 'Unstar' : 'Star', Icon: Star, onPress: () => { void useMessagingStore.getState().star(active.id, convId); finishAction(); } },
              // "Message info" (who read/received) — sender-only, like WhatsApp.
              ...(active.mine && !active.pending && !active.failed ? [{ label: 'Info', Icon: Info, onPress: () => { setInfoFor(active); finishAction(); } }] : []),
              // Pinned by anyone counts (the message flag can lag pins made from another device).
              { label: active.pinned || pinned.some((p) => p.id === active.id) ? 'Unpin' : 'Pin', Icon: Pin, onPress: () => { void useMessagingStore.getState().pin(active.id, convId).then(refreshPinned); finishAction(); } },
              ...(active.mine && active.type === 'text' && Date.now() - new Date(active.sentAt).getTime() < EDIT_WINDOW_MS ? [{ label: 'Edit', Icon: Pencil, onPress: () => startEdit(active) }] : []),
              { label: 'Delete for me', Icon: Trash2, onPress: () => { void useMessagingStore.getState().remove(active.id, convId, 'me'); finishAction(); } },
              ...(active.mine && Date.now() - new Date(active.sentAt).getTime() < DELETE_EVERYONE_MS ? [{ label: 'Delete for everyone', Icon: Trash2, danger: true, onPress: () => { void useMessagingStore.getState().remove(active.id, convId, 'everyone'); finishAction(); } }] : []),
            ].map((a) => (
              <Pressable key={a.label} onPress={a.onPress} className="flex-row items-center gap-3" style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
                <a.Icon size={18} color={(a as { danger?: boolean }).danger ? colors.danger : colors.ink} />
                <Text style={{ color: (a as { danger?: boolean }).danger ? colors.danger : colors.ink, fontSize: 14, fontWeight: '600' }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      ) : null}

      {/* Forward picker (WhatsApp-style: multi-select up to 5 chats, then send) */}
      <ForwardSheet visible={forwardMsgs.length > 0} targets={forwardTargets} sending={forwarding}
        preview={forwardMsgs.length > 1 ? `${forwardMsgs.length} messages` : (forwardMsgs[0]?.text || (forwardMsgs[0] ? `[${forwardMsgs[0].type}]` : ''))}
        onClose={() => setForwardMsgs([])} onSend={(t) => void doForward(t)} />

      {/* Message info: who read / received one of MY messages (sender-only endpoint) */}
      <MessageInfoSheet message={infoFor} users={users} nameOf={nameOf} onClose={() => setInfoFor(null)} />

      {/* Full emoji picker for reactions ("+" in the quick bar) */}
      <Modal visible={!!reactPickerOpen} transparent animationType="slide" onRequestClose={() => setReactPickerOpen(null)}>
        <Pressable onPress={() => setReactPickerOpen(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' }}>
            <EmojiPicker
              onPick={(e) => { const id = reactPickerOpen; setReactPickerOpen(null); setSelectedIds([]); if (id) void useMessagingStore.getState().react(id, e); }}
              onBackspace={() => setReactPickerOpen(null)}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reactions sheet — who reacted; tap YOUR OWN row/emoji to remove it (server toggles). */}
      <Modal visible={!!reactionsFor} transparent animationType="fade" onRequestClose={() => setReactionsFor(null)}>
        <Pressable onPress={() => setReactionsFor(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: insets.bottom + 16, maxHeight: '60%' }}>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', marginBottom: 2 }}>Reactions</Text>
            <Text style={{ color: colors.coolText, fontSize: 12, marginBottom: 10 }}>Tap your reaction to remove it.</Text>
            <ScrollView>
              {(messages.find((x) => x.id === reactionsFor)?.reactions ?? []).map((r) => {
                const isMine = r.userId === myUserId;
                return (
                  <Pressable key={`${r.userId}-${r.emoji}`} disabled={!isMine}
                    onPress={() => { const id = reactionsFor; setReactionsFor(null); if (id) void useMessagingStore.getState().react(id, r.emoji); }}
                    className="flex-row items-center gap-3" style={{ paddingVertical: 10, borderBottomColor: colors.coolDivider, borderBottomWidth: StyleSheet.hairlineWidth }}>
                    <Avatar initials={(nameOf(r.userId)[0] ?? '?').toUpperCase()} color={colors.blue} size={36} uri={users.find((u) => u.id === r.userId)?.avatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }}>{isMine ? 'You' : nameOf(r.userId)}</Text>
                      {isMine ? <Text style={{ color: colors.coolText, fontSize: 11.5 }}>Tap to remove</Text> : null}
                    </View>
                    <Text style={{ fontSize: 22 }}>{r.emoji}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// WhatsApp-style "Message info" bottom sheet: Read by (with time) → Delivered to → Pending.
function MessageInfoSheet({ message, users, nameOf, onClose }: {
  message: StoredMessage | null; users: User[]; nameOf: (id: string) => string; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<MessageReceipts | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setData(null); setFailed(false);
    if (message) getReceipts(message.id).then(setData).catch(() => setFailed(true));
  }, [message]);
  if (!message) return null;

  const byId = new Map(users.map((u) => [u.id, u]));
  const read = (data?.readBy ?? []).slice().sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const readSet = new Set(read.map((r) => r.userId));
  const delivered = data?.deliveredTo ?? [];
  const deliveredSet = new Set(delivered);
  const pendingIds = (data?.participants ?? []).filter((u) => !readSet.has(u) && !deliveredSet.has(u));

  const Row = ({ userId, at }: { userId: string; at?: number | null }) => {
    const u = byId.get(userId);
    return (
      <View className="flex-row items-center gap-3" style={{ paddingHorizontal: 18, paddingVertical: 8 }}>
        <Avatar initials={u?.initials ?? (nameOf(userId)[0] ?? '?').toUpperCase()} color={u?.color ?? colors.blue} size={36} uri={u?.avatar ?? null} />
        <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontSize: 14.5, fontWeight: '600' }}>{nameOf(userId)}</Text>
        {at != null ? <Text style={{ color: colors.coolText3, fontSize: 12 }}>{dateStamp(at)}</Text> : null}
      </View>
    );
  };
  const SectionHead = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
    <View className="flex-row items-center gap-2" style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4 }}>
      {icon}
      <Text style={{ color: colors.coolText, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '75%', paddingBottom: insets.bottom + 10 }}>
        <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>Message info</Text>
          <Pressable onPress={onClose} hitSlop={10}><X size={20} color={colors.coolText} /></Pressable>
        </View>
        <ScrollView>
          <View style={{ marginHorizontal: 18, backgroundColor: colors.primarySoft, borderRadius: 12, padding: 10 }}>
            <Text numberOfLines={3} style={{ color: colors.ink, fontSize: 13.5 }}>{message.text || `[${message.type}]`}</Text>
          </View>
          {failed ? (
            <Text style={{ color: colors.coolText3, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>Could not load receipts.</Text>
          ) : !data ? (
            <ActivityIndicator style={{ paddingVertical: 24 }} color={colors.primary} />
          ) : (
            <>
              <SectionHead icon={<CheckCheck size={16} color={colors.primary} />} label={`READ${read.length ? ` · ${read.length}` : ''}`} />
              {read.length ? read.map((r) => <Row key={r.userId} userId={r.userId} at={r.at} />)
                : <Text style={{ color: colors.coolText3, fontSize: 13, fontStyle: 'italic', paddingHorizontal: 18, paddingVertical: 4 }}>No one yet</Text>}
              {delivered.length ? (
                <>
                  <SectionHead icon={<CheckCheck size={16} color={TICK_MUTED} />} label={`DELIVERED · ${delivered.length}`} />
                  {delivered.map((u) => <Row key={u} userId={u} />)}
                </>
              ) : null}
              {pendingIds.length ? (
                <>
                  <SectionHead icon={<Clock size={14} color={TICK_MUTED} />} label={`PENDING · ${pendingIds.length}`} />
                  {pendingIds.map((u) => <Row key={u} userId={u} />)}
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// A row in the forward picker: an existing conversation, or a teammate with no DM yet (the send
// path creates the DM on demand).
interface ForwardTarget {
  key: string;
  kind: 'conv' | 'user';
  id: string;
  name: string;
  sub: string | null;
  initials: string;
  color: string;
  avatarUri: string | null;
}

const FORWARD_MAX = 5; // WhatsApp's forward cap — keeps one tap from spamming every chat

function ForwardSheet({ visible, targets, preview, sending, onClose, onSend }: {
  visible: boolean; targets: ForwardTarget[]; preview: string; sending: boolean;
  onClose: () => void; onSend: (picked: ForwardTarget[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [selKeys, setSelKeys] = useState<string[]>([]);
  useEffect(() => { if (visible) { setQ(''); setSelKeys([]); } }, [visible]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? targets.filter((t) => t.name.toLowerCase().includes(needle)) : targets;
  }, [targets, q]);
  const toggle = (key: string): void =>
    setSelKeys((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= FORWARD_MAX ? cur : [...cur, key]));
  const picked = targets.filter((t) => selKeys.includes(t.key));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', paddingBottom: insets.bottom }}>
          <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '800' }}>Forward to…</Text>
              <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12, marginTop: 2 }}>{preview}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}>
              <X size={16} color={colors.coolText} />
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
            <TextInput value={q} onChangeText={setQ} placeholder="Search chats & people" placeholderTextColor={colors.coolText3}
              style={{ backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14.5, color: colors.ink }} />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(t) => t.key}
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0 }}
            ListEmptyComponent={<Text style={{ color: colors.coolText, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>No chats match</Text>}
            renderItem={({ item: t }) => {
              const on = selKeys.includes(t.key);
              return (
                <Pressable onPress={() => toggle(t.key)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center gap-2.5"
                  style={{ paddingHorizontal: 18, paddingVertical: 9 }}>
                  <Avatar initials={t.initials} color={t.color} size={38} uri={t.avatarUri} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }}>{t.name}</Text>
                    {t.sub ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 11.5 }}>{t.sub}</Text> : null}
                  </View>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? colors.primary : colors.coolDivider, backgroundColor: on ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
                  </View>
                </Pressable>
              );
            }}
          />
          <View className="flex-row items-center" style={{ paddingHorizontal: 18, paddingVertical: 10, borderTopColor: colors.coolDivider, borderTopWidth: 1, gap: 10 }}>
            <Text style={{ flex: 1, color: colors.coolText, fontSize: 12.5 }}>
              {picked.length ? `${picked.length} of ${FORWARD_MAX} selected` : `Select up to ${FORWARD_MAX} chats`}
            </Text>
            <Pressable disabled={!picked.length || sending} onPress={() => onSend(picked)}
              className="flex-row items-center gap-1.5"
              style={{ paddingHorizontal: 20, paddingVertical: 11, borderRadius: 999, backgroundColor: picked.length && !sending ? colors.primary : colors.coolMuted }}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={15} color={picked.length ? '#fff' : colors.coolText3} />}
              <Text style={{ color: picked.length && !sending ? '#fff' : colors.coolText3, fontSize: 13.5, fontWeight: '700' }}>Send</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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

// `onLongPress` forwards the bubble's long-press so selection mode starts from a press on the
// media too — the nested pressables would otherwise swallow it.
function Attachments({ m, mine, onOpenImage, onLongPress }: { m: StoredMessage; mine: boolean; onOpenImage: (uri: string) => void; onLongPress?: () => void }) {
  return (
    <>
      {m.attachments.map((att: ChatAttachment, i: number) => {
        const url = mediaUrl(att.url);
        if (m.type === 'image') {
          const ratio = att.width && att.height ? att.height / att.width : 0.75;
          return (
            <Pressable key={i} onPress={() => onOpenImage(url)} onLongPress={onLongPress} style={{ marginBottom: 4 }}>
              <Image source={{ uri: url }} style={{ width: 210, height: Math.min(280, 210 * ratio), borderRadius: 12, backgroundColor: colors.coolMuted }} resizeMode="cover" />
            </Pressable>
          );
        }
        if (m.type === 'video') {
          return (
            <Pressable key={i} onPress={() => void Linking.openURL(url)} onLongPress={onLongPress} style={{ width: 210, height: 140, borderRadius: 12, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              {att.thumbnailUrl ? <Image source={{ uri: mediaUrl(att.thumbnailUrl) }} style={{ position: 'absolute', width: 210, height: 140, borderRadius: 12 }} /> : null}
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' }}><Play size={20} color={colors.ink} /></View>
            </Pressable>
          );
        }
        if (m.type === 'voice') {
          // Both sides are light cards now — always use the dark-on-light voice styling.
          return <VoiceMessage key={i} uri={url} durationSec={(att.durationMs ?? 0) / 1000} outgoing={false} />;
        }
        // document
        return (
          <Pressable key={i} onPress={() => void Linking.openURL(url)} onLongPress={onLongPress} className="flex-row items-center gap-2" style={{ paddingVertical: 6, marginBottom: 2 }}>
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: mine ? '#fff' : colors.coolMuted, alignItems: 'center', justifyContent: 'center' }}><FileText size={19} color={colors.primary} /></View>
            <View style={{ maxWidth: 180 }}>
              <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13.5, fontWeight: '600' }}>{att.name}</Text>
              <Text style={{ color: colors.coolText, fontSize: 11 }}>{humanSize(att.size)}</Text>
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
      <View style={{ backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 5 }}>
        <Text style={{ color: '#7C858F', fontSize: 11, fontWeight: '500', letterSpacing: 0.4 }}>{label}</Text>
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

function Bubble({ m, isGroup, nameOf, onPress, onLongPress, selecting, onOpenImage, onRetry, onForward, onReactions }: { m: StoredMessage; isGroup: boolean; nameOf: (id: string) => string; onPress: () => void; onLongPress?: () => void; selecting?: boolean; onOpenImage: (uri: string) => void; onRetry: (clientId: string) => void; onForward?: () => void; onReactions?: () => void }) {
  const mine = m.mine;
  const deleted = m.deletedForEveryone;
  // Tick glyphs on the light cards: pending → clock, sent → ✓, delivered → ✓✓ (muted grey),
  // read → ✓✓ teal (mockup style).
  const tickColor = m.status === 'read' ? colors.primary : TICK_MUTED;
  const TickIcon = m.pending ? Clock : m.status === 'sent' ? Check : CheckCheck;
  const hasMedia = !deleted && m.type !== 'text' && m.attachments.length > 0;
  // WhatsApp-style one-tap forward arrow beside media (photo/video/document). Pending messages have
  // no server id yet, so the arrow appears only once the send is confirmed. Hidden while selecting.
  const quickForward = !!onForward && hasMedia && ['image', 'video', 'document'].includes(m.type) && !m.pending && !m.failed && !selecting;
  // Names of the @-mentioned users, resolved for highlight matching. The 'Member' fallback of
  // nameOf must not leak in — it would light up random "@Member" text. Any mentioning message may
  // carry the "@everyone" token (admins), so that name always joins the highlight roster.
  const mentionNames = !deleted && m.mentions?.length ? [...m.mentions.map(nameOf).filter((n) => n !== 'Member'), 'everyone'] : [];
  return (
    <View className="mb-2.5" style={{ maxWidth: '80%', alignSelf: mine ? 'flex-end' : 'flex-start' }}>
      {/* Row places the forward arrow on the OUTER side of the bubble (left of outgoing, right of incoming). */}
      <View className="items-center" style={{ flexDirection: mine ? 'row-reverse' : 'row', gap: 6 }}>
      <Pressable onPress={onPress} onLongPress={onLongPress} style={{ flexShrink: 1, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 18, backgroundColor: mine ? colors.primarySoft : '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: mine ? '#DCEDE9' : colors.coolDivider }}>
        {isGroup && !mine && !deleted ? <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginBottom: 2, marginLeft: 4 }}>{nameOf(m.senderId)}</Text> : null}
        {m.forwardedFrom && !deleted ? (
          <View className="flex-row items-center gap-1" style={{ marginBottom: 2, paddingHorizontal: 4 }}>
            <ForwardIcon size={12} color={colors.coolText3} />
            <Text style={{ color: colors.coolText3, fontSize: 11.5, fontStyle: 'italic' }}>Forwarded</Text>
          </View>
        ) : null}
        {m.replyTo ? (
          <View style={{ borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 6, marginBottom: 4, marginHorizontal: 4, opacity: 0.9 }}>
            <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12.5 }}>{m.replyTo.preview}</Text>
          </View>
        ) : null}
        {hasMedia ? <Attachments m={m} mine={mine} onOpenImage={onOpenImage} onLongPress={onLongPress} /> : null}
        {deleted ? (
          <Text style={{ color: colors.coolText, fontSize: 14, fontStyle: 'italic', paddingHorizontal: 4 }}>This message was deleted</Text>
        ) : m.text ? (
          <LinkedText text={m.text} linkColor={colors.blue}
            mentionNames={mentionNames} mentionColor={colors.primary} onLongPress={onLongPress}
            style={{ color: colors.ink, fontSize: 15, lineHeight: 21, paddingHorizontal: 4 }} />
        ) : null}
        <View className="flex-row items-center gap-1" style={{ alignSelf: 'flex-end', marginTop: 3, paddingHorizontal: 4 }}>
          {m.edited && !deleted ? <Text style={{ color: TIME_FAINT, fontSize: 10 }}>edited</Text> : null}
          <Text style={{ color: TIME_FAINT, fontSize: 11, fontWeight: '500' }}>{hhmm(m.createdAt)}</Text>
          {mine && !deleted && !m.failed ? <TickIcon size={15} color={tickColor} /> : null}
        </View>
        {mine && m.failed ? (
          <Pressable onPress={() => m.clientId && onRetry(m.clientId)} style={{ alignSelf: 'flex-end', paddingHorizontal: 4 }}>
            <Text style={{ color: colors.danger, fontSize: 10.5, fontWeight: '800' }}>⚠ Failed · tap to retry</Text>
          </Pressable>
        ) : null}
        {/* Selection mode: a transparent catcher on top so taps toggle selection instead of hitting
            nested pressables (image viewer, video/doc links, tappable URLs). */}
        {selecting ? <Pressable onPress={onPress} onLongPress={onLongPress} style={StyleSheet.absoluteFill} /> : null}
      </Pressable>
      {quickForward ? (
        <Pressable onPress={onForward} hitSlop={8} accessibilityLabel="Forward"
          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(11,20,26,0.24)', alignItems: 'center', justifyContent: 'center' }}>
          <ForwardIcon size={16} color="#fff" />
        </Pressable>
      ) : null}
      </View>
      {m.reactions.length ? (
        <View className="flex-row" style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: -6, marginRight: 4 }}>
          {/* Tapping the chip opens the reactions sheet (who reacted; tap your own to remove). */}
          <Pressable onPress={onReactions} hitSlop={6} style={{ backgroundColor: colors.card, borderColor: colors.coolDivider, borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
            <Text style={{ fontSize: 12 }}>{[...new Set(m.reactions.map((r) => r.emoji))].join(' ')} {m.reactions.length}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

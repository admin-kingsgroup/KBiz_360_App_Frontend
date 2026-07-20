import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Star, Trash2, RotateCcw, MailOpen, Reply, ReplyAll, Forward, Paperclip, Download, Pencil } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Avatar } from '../../src/components/ui';
import { EmailBody } from '../../src/components/email';
import { colors } from '../../src/theme';
import { useEmailStore } from '../../src/store/emailStore';
import { useUiStore } from '../../src/store/uiStore';
import * as emailApi from '../../src/api/email';
import { initialsOf, relativeTime } from '../../src/logic/email';
import type { AttachmentMeta } from '../../src/types';

const humanSize = (b: number): string => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

export default function EmailDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const email = useEmailStore((s) => s.byId(id ?? ''));
  const toggleRead = useEmailStore((s) => s.toggleRead);
  const toggleStar = useEmailStore((s) => s.toggleStar);
  const moveToFolder = useEmailStore((s) => s.moveToFolder);
  const deleteForever = useEmailStore((s) => s.deleteForever);
  const showToast = useUiStore((s) => s.showToast);

  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Fetch the full message body (the list only carries a preview) + attachment list.
  useEffect(() => { if (id) void useEmailStore.getState().loadMessage(id); }, [id]);
  useEffect(() => {
    if (email?.hasAttachments && id) emailApi.listAttachments(id).then(setAttachments).catch(() => setAttachments([]));
  }, [email?.hasAttachments, id]);

  if (!email) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.coolText }}>Message not found</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Go back</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const inTrash = email.folder === 'deleted';
  const isDraft = email.folder === 'drafts';

  // Reply/forward carry the original's id + mode; compose builds the quoted body at send time
  // (HTML originals are embedded as HTML so the quote keeps its formatting — no raw-tag dump).
  const reply = (all: boolean) => {
    const me = (useEmailStore.getState().account ?? '').toLowerCase(); // real connected mailbox, not a mock address
    const others = all ? [...email.to, ...(email.cc ?? [])].filter((a) => a.email.toLowerCase() !== me && a.email !== email.from.email) : [];
    const to = [email.from, ...others].map((a) => a.email).join(', ');
    router.push({ pathname: '/email/compose', params: { to, subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`, replyTo: email.id, mode: all ? 'replyAll' : 'reply' } });
  };
  const forward = () => router.push({ pathname: '/email/compose', params: { to: '', subject: email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`, replyTo: email.id, mode: 'forward' } });
  const editDraft = () => router.push({ pathname: '/email/compose', params: { id: email.id } });

  const trash = () => { moveToFolder(email.id, 'deleted'); showToast('Moved to Deleted'); router.back(); };
  const restore = () => { moveToFolder(email.id, 'inbox'); showToast('Restored to Inbox'); router.back(); };
  const purge = () => { deleteForever(email.id); showToast('Deleted permanently'); router.back(); };

  const openAttachment = async (att: AttachmentMeta) => {
    setDownloading(att.id);
    try {
      const data = await emailApi.downloadAttachment(email.id, att.id);
      const path = `${FileSystem.cacheDirectory}${att.name.replace(/[^\w.-]+/g, '_')}`;
      await FileSystem.writeAsStringAsync(path, data.contentBytes, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: data.contentType, dialogTitle: att.name });
      else showToast('Saved to device cache');
    } catch { showToast('Could not open attachment'); }
    finally { setDownloading(null); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      {/* Header actions */}
      <View className="flex-row items-center px-2 py-2" style={{ gap: 2, backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={iconBtn}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => toggleStar(email.id)} style={iconBtn}><Star size={20} color={email.starred ? colors.orange : colors.ink} fill={email.starred ? colors.orange : 'transparent'} /></Pressable>
        <Pressable onPress={() => { toggleRead(email.id); showToast(email.read ? 'Marked unread' : 'Marked read'); }} style={iconBtn}><MailOpen size={20} color={colors.ink} /></Pressable>
        {inTrash ? (
          <>
            <Pressable onPress={restore} style={iconBtn}><RotateCcw size={20} color={colors.ink} /></Pressable>
            <Pressable onPress={purge} style={iconBtn}><Trash2 size={20} color={colors.danger} /></Pressable>
          </>
        ) : (
          <Pressable onPress={trash} style={iconBtn}><Trash2 size={20} color={colors.ink} /></Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 28 }}>
        <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.3, lineHeight: 29 }}>{email.subject}</Text>

        {/* Sender */}
        <View className="flex-row items-center" style={{ gap: 12, marginTop: 16 }}>
          <Avatar initials={initialsOf(email.from)} color={email.color} size={46} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15.5, fontWeight: '600' }}>{email.from.name}</Text>
            <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12.5 }}>{email.from.email}</Text>
          </View>
          <Text style={{ color: colors.coolText, fontSize: 12, fontWeight: '500' }}>{relativeTime(email.ts, Date.now())}</Text>
        </View>
        <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 8 }}>
          To: {email.to.map((a) => a.name).join(', ')}{email.cc?.length ? `  ·  Cc: ${email.cc.map((a) => a.name).join(', ')}` : ''}
        </Text>

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.coolDivider, marginVertical: 16 }} />

        {/* Body — HTML via WebView, plain text otherwise */}
        <EmailBody body={email.body} bodyType={email.bodyType} />

        {/* Attachments (tap to download + open) */}
        {attachments.length ? (
          <View style={{ marginTop: 20, gap: 8 }}>
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>{attachments.length} ATTACHMENT{attachments.length > 1 ? 'S' : ''}</Text>
            {attachments.map((at) => (
              <Pressable key={at.id} onPress={() => openAttachment(at)} android_ripple={{ color: colors.coolMuted }} className="flex-row items-center" style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider }}>
                <Paperclip size={17} color={colors.coolText} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{at.name}</Text>
                  <Text style={{ color: colors.coolText, fontSize: 11.5 }}>{humanSize(at.size)}</Text>
                </View>
                <Download size={17} color={downloading === at.id ? colors.coolText3 : colors.primary} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom bar — pad the bottom by the safe-area inset so the buttons clear the Android nav bar.
          Drafts get a single "Edit draft" action (reply/forward make no sense for an unsent message). */}
      <View className="flex-row" style={{ gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderTopColor: colors.coolDivider, borderTopWidth: 1 }}>
        {isDraft ? (
          <ActionBtn icon={<Pencil size={17} color="#fff" />} label="Edit draft" primary onPress={editDraft} />
        ) : (
          <>
            <ActionBtn icon={<Reply size={17} color="#fff" />} label="Reply" primary onPress={() => reply(false)} />
            <ActionBtn icon={<ReplyAll size={17} color={colors.primary} />} label="Reply all" onPress={() => reply(true)} />
            <ActionBtn icon={<Forward size={17} color={colors.primary} />} label="Forward" onPress={forward} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const iconBtn = { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' } as const;

function ActionBtn({ icon, label, onPress, primary }: { icon: ReactNode; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} className="flex-1 flex-row items-center justify-center" style={{ gap: 6, height: 46, borderRadius: 999, backgroundColor: primary ? colors.primary : colors.card, borderWidth: primary ? 0 : 1.5, borderColor: colors.primary + '55' }}>
      {icon}
      <Text style={{ color: primary ? '#fff' : colors.primary, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

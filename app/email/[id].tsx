import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Star, Trash2, RotateCcw, MailOpen, Reply, ReplyAll, Forward, Pencil, FolderInput, Folder as FolderIcon, X } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { EmailMessageView } from '../../src/components/email';
import { colors } from '../../src/theme';
import { useEmailStore } from '../../src/store/emailStore';
import { useUiStore } from '../../src/store/uiStore';
import * as emailApi from '../../src/api/email';
import type { AttachmentMeta } from '../../src/types';

export default function EmailDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const email = useEmailStore((s) => s.byId(id ?? ''));
  const toggleRead = useEmailStore((s) => s.toggleRead);
  const toggleStar = useEmailStore((s) => s.toggleStar);
  const moveToFolder = useEmailStore((s) => s.moveToFolder);
  const moveToGraphFolder = useEmailStore((s) => s.moveToGraphFolder);
  const deleteForever = useEmailStore((s) => s.deleteForever);
  const smartFolders = useEmailStore((s) => s.smartFolders);
  const outlookFolders = useEmailStore((s) => s.outlookFolders);
  const showToast = useUiStore((s) => s.showToast);

  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  // Every folder the message can be filed into: smart folders + Outlook-created folders, de-duped
  // (a smart folder IS an Outlook folder — same graph id).
  const moveTargets = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const sf of smartFolders) if (!seen.has(sf.graphFolderId)) { seen.add(sf.graphFolderId); out.push({ id: sf.graphFolderId, name: sf.name }); }
    for (const f of outlookFolders) if (!seen.has(f.id)) { seen.add(f.id); out.push({ id: f.id, name: f.name }); }
    return out;
  }, [smartFolders, outlookFolders]);

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
  const fileInto = (folderId: string, name: string) => {
    setMoveOpen(false);
    moveToGraphFolder(email.id, folderId);
    showToast(`Moved to "${name}"`);
    router.back();
  };
  const restore = () => { moveToFolder(email.id, 'inbox'); showToast('Restored to Inbox'); router.back(); };
  const purge = () => { deleteForever(email.id); showToast('Deleted permanently'); router.back(); };

  // Attachment chip tapped inside the message WebView → download + share/open natively.
  const openAttachment = async (attId: string) => {
    const att = attachments.find((a) => a.id === attId);
    if (!att || downloading) return;
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

  // mailto: links inside a message body open OUR composer (Outlook behavior), not an external app.
  const composeTo = (address: string) => router.push({ pathname: '/email/compose', params: { to: address } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      {/* Header actions */}
      <View className="flex-row items-center px-2 py-2" style={{ gap: 2, backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={iconBtn}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => toggleStar(email.id)} style={iconBtn}><Star size={20} color={email.starred ? colors.orange : colors.ink} fill={email.starred ? colors.orange : 'transparent'} /></Pressable>
        <Pressable onPress={() => { toggleRead(email.id); showToast(email.read ? 'Marked unread' : 'Marked read'); }} style={iconBtn}><MailOpen size={20} color={colors.ink} /></Pressable>
        {!isDraft && !inTrash ? (
          <Pressable onPress={() => setMoveOpen(true)} accessibilityLabel="Move to folder" style={iconBtn}><FolderInput size={20} color={colors.ink} /></Pressable>
        ) : null}
        {inTrash ? (
          <>
            <Pressable onPress={restore} style={iconBtn}><RotateCcw size={20} color={colors.ink} /></Pressable>
            <Pressable onPress={purge} style={iconBtn}><Trash2 size={20} color={colors.danger} /></Pressable>
          </>
        ) : (
          <Pressable onPress={trash} style={iconBtn}><Trash2 size={20} color={colors.ink} /></Pressable>
        )}
      </View>

      {/* The whole message (subject, sender, attachments, body) scrolls as ONE document inside a
          WebView — native-smooth for any length of email, images render, pinch-zoom works. */}
      <EmailMessageView
        email={email}
        attachments={attachments}
        downloadingId={downloading}
        onAttachment={(attId) => void openAttachment(attId)}
        onMailto={composeTo}
      />

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

      {/* Move to folder — pick any of the user's folders (smart + Outlook-created). */}
      <Modal visible={moveOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMoveOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setMoveOpen(false)}>
          <Pressable onPress={() => undefined} style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingBottom: insets.bottom + 16, maxHeight: '60%' }}>
            <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 20, marginBottom: 8 }}>
              <View className="flex-row items-center" style={{ gap: 8 }}><FolderInput size={18} color={colors.primary} /><Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Move to folder</Text></View>
              <Pressable onPress={() => setMoveOpen(false)} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={18} color={colors.coolText} /></Pressable>
            </View>
            {moveTargets.length === 0 ? (
              <Text style={{ color: colors.coolText, fontSize: 13.5, paddingHorizontal: 20, paddingVertical: 16 }}>
                No folders yet — create one from the Email tab (the ＋ Folder chip), or in Outlook. Folders you make in Outlook show up here too.
              </Text>
            ) : (
              <ScrollView style={{ flexGrow: 0 }}>
                {moveTargets.map((t) => (
                  <Pressable key={t.id} onPress={() => fileInto(t.id, t.name)} android_ripple={{ color: colors.coolMuted }}
                    className="flex-row items-center" style={{ gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                      <FolderIcon size={17} color={colors.primary} />
                    </View>
                    <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontSize: 15, fontWeight: '600' }}>{t.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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

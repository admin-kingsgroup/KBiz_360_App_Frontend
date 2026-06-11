import type { ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Star, Trash2, RotateCcw, MailOpen, Reply, ReplyAll, Forward, Paperclip } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { useEmailStore } from '../../src/store/emailStore';
import { useUiStore } from '../../src/store/uiStore';
import { initialsOf, relativeTime } from '../../src/logic/email';
import { CURRENT_MAILBOX } from '../../src/data/emails';

export default function EmailDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const email = useEmailStore((s) => s.byId(id ?? ''));
  const toggleRead = useEmailStore((s) => s.toggleRead);
  const toggleStar = useEmailStore((s) => s.toggleStar);
  const moveToFolder = useEmailStore((s) => s.moveToFolder);
  const deleteForever = useEmailStore((s) => s.deleteForever);
  const showToast = useUiStore((s) => s.showToast);

  if (!email) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textMuted }}>Message not found</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}><Text style={{ color: colors.blue, fontWeight: '700' }}>Go back</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const inTrash = email.folder === 'deleted';
  const quote = `\n\n---------- Original message ----------\nFrom: ${email.from.name} <${email.from.email}>\nSubject: ${email.subject}\n\n${email.body}`;

  const reply = (all: boolean) => {
    const others = all ? [...email.to, ...(email.cc ?? [])].filter((a) => a.email !== CURRENT_MAILBOX.email && a.email !== email.from.email) : [];
    const to = [email.from, ...others].map((a) => a.email).join(', ');
    router.push({ pathname: '/email/compose', params: { to, subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`, body: quote } });
  };
  const forward = () => router.push({ pathname: '/email/compose', params: { to: '', subject: email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`, body: quote } });

  const trash = () => { moveToFolder(email.id, 'deleted'); showToast('Moved to Deleted'); router.back(); };
  const restore = () => { moveToFolder(email.id, 'inbox'); showToast('Restored to Inbox'); router.back(); };
  const purge = () => { deleteForever(email.id); showToast('Deleted permanently'); router.back(); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
      {/* Header actions */}
      <View className="flex-row items-center px-2 py-2" style={{ gap: 2, backgroundColor: colors.card, borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={iconBtn}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => toggleStar(email.id)} style={iconBtn}><Star size={19} color={email.starred ? colors.orange : colors.ink} fill={email.starred ? colors.orange : 'transparent'} /></Pressable>
        <Pressable onPress={() => { toggleRead(email.id); showToast(email.read ? 'Marked unread' : 'Marked read'); }} style={iconBtn}><MailOpen size={19} color={colors.ink} /></Pressable>
        {inTrash ? (
          <>
            <Pressable onPress={restore} style={iconBtn}><RotateCcw size={19} color={colors.ink} /></Pressable>
            <Pressable onPress={purge} style={iconBtn}><Trash2 size={19} color={colors.danger} /></Pressable>
          </>
        ) : (
          <Pressable onPress={trash} style={iconBtn}><Trash2 size={19} color={colors.ink} /></Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 28 }}>
        <Text style={{ color: colors.ink, fontSize: 21, fontWeight: '800', letterSpacing: -0.3, lineHeight: 28 }}>{email.subject}</Text>

        {/* Sender */}
        <View className="flex-row items-center" style={{ gap: 12, marginTop: 16 }}>
          <Avatar initials={initialsOf(email.from)} color={email.color} size={44} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14.5, fontWeight: '800' }}>{email.from.name}</Text>
            <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>{email.from.email}</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: '600' }}>{relativeTime(email.ts, Date.now())}</Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
          To: {email.to.map((a) => a.name).join(', ')}{email.cc?.length ? `  ·  Cc: ${email.cc.map((a) => a.name).join(', ')}` : ''}
        </Text>

        <View style={{ height: 1, backgroundColor: colors.cardEdge, marginVertical: 16 }} />

        {/* Body */}
        <Text style={{ color: colors.ink, fontSize: 14.5, lineHeight: 23 }}>{email.body}</Text>

        {/* Attachments */}
        {email.attachments?.length ? (
          <View style={{ marginTop: 20, gap: 8 }}>
            {email.attachments.map((at) => (
              <View key={at.id} className="flex-row items-center" style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
                <Paperclip size={16} color={colors.textMuted} />
                <Text style={{ flex: 1, color: colors.ink, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{at.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{at.sizeLabel}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Reply bar */}
      <View className="flex-row" style={{ gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 18, backgroundColor: colors.card, borderTopColor: colors.cardEdge, borderTopWidth: 1 }}>
        <ActionBtn icon={<Reply size={16} color="#fff" />} label="Reply" primary onPress={() => reply(false)} />
        <ActionBtn icon={<ReplyAll size={16} color={colors.ink} />} label="Reply all" onPress={() => reply(true)} />
        <ActionBtn icon={<Forward size={16} color={colors.ink} />} label="Forward" onPress={forward} />
      </View>
    </SafeAreaView>
  );
}

const iconBtn = { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' } as const;

function ActionBtn({ icon, label, onPress, primary }: { icon: ReactNode; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} className="flex-1 flex-row items-center justify-center" style={{ gap: 6, paddingVertical: 12, borderRadius: 13, backgroundColor: primary ? colors.ink : colors.canvas, borderWidth: 1, borderColor: primary ? colors.ink : colors.cardEdge }}>
      {icon}
      <Text style={{ color: primary ? '#fff' : colors.ink, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

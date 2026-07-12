import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { X, Send, Paperclip } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { colors } from '../../src/theme';
import { useEmailStore } from '../../src/store/emailStore';
import { useUiStore } from '../../src/store/uiStore';
import { buildReplyBody, htmlToText } from '../../src/logic/email';
import type { EmailDraft, OutAttachment } from '../../src/types';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // per-file cap
const MAX_TOTAL_BYTES = 14 * 1024 * 1024; // total across attachments (bounded by the backend body limit)
// Bytes represented by a base64 string (drives the total-size guard before send).
const b64Bytes = (b64: string): number => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

// Compose / reply / forward / resume-draft. Route params:
//   to/subject/body — prefill (new message).
//   id              — resume an existing Graph draft (load it, edit, send/update in place).
//   replyTo + mode  — quote an original message (reply | replyAll | forward); the quote is built at
//                     send time so the editor shows only the user's text (no inline tag soup).
export default function Compose() {
  const router = useRouter();
  const params = useLocalSearchParams<{ to?: string; subject?: string; body?: string; id?: string; replyTo?: string; mode?: string }>();
  const draftId = params.id;
  const replyTo = params.replyTo;
  const mode = (params.mode as 'reply' | 'replyAll' | 'forward' | undefined) ?? undefined;
  const send = useEmailStore((s) => s.send);
  const saveDraft = useEmailStore((s) => s.saveDraft);
  const showToast = useUiStore((s) => s.showToast);

  // Full original (for quoting) / draft (for editing) live in the store; the detail screen loaded the
  // body before navigating here, but fetch defensively in case we arrived from search/a smart folder.
  const original = useEmailStore((s) => (replyTo ? s.byId(replyTo) : undefined));
  const editDraft = useEmailStore((s) => (draftId ? s.byId(draftId) : undefined));

  const [to, setTo] = useState(params.to ?? '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(params.subject ?? '');
  const [body, setBody] = useState(params.body ?? '');
  const [attachments, setAttachments] = useState<OutAttachment[]>([]);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (draftId) void useEmailStore.getState().loadMessage(draftId);
    if (replyTo) void useEmailStore.getState().loadMessage(replyTo);
  }, [draftId, replyTo]);

  // Prefill once from the loaded draft (resume): recipients + subject + body (HTML drafts → plain text
  // so they're editable; saved/sent back as text).
  useEffect(() => {
    if (!draftId || !editDraft || prefilled) return;
    setTo(editDraft.to.map((a) => a.email).join(', '));
    const ccList = (editDraft.cc ?? []).map((a) => a.email);
    if (ccList.length) { setCc(ccList.join(', ')); setShowCc(true); }
    setSubject(editDraft.subject === '(no subject)' ? '' : editDraft.subject);
    setBody(editDraft.bodyType === 'html' ? htmlToText(editDraft.body) : editDraft.body);
    setPrefilled(true);
  }, [draftId, editDraft, prefilled]);

  // Assemble the outgoing draft, quoting the original for replies/forwards.
  const buildOutgoing = (): EmailDraft => {
    const atts = attachments.length ? attachments : undefined;
    if (replyTo && original) {
      const quoted = buildReplyBody({ userText: body, original, mode: mode ?? 'reply' });
      return { to, cc, bcc, subject, body: quoted.body, bodyType: quoted.bodyType, attachments: atts, id: draftId };
    }
    return { to, cc, bcc, subject, body, bodyType: 'text', attachments: atts, id: draftId };
  };

  // Worth saving as a draft on close? Require something the user actually authored — for a reply the
  // recipients/subject are pre-filled, so a bare quote alone shouldn't spawn a junk draft.
  const worthSaving = (): boolean => {
    if (body.trim() || attachments.length) return true;
    if (replyTo) return false; // only a pre-filled quote — nothing typed
    return [to, cc, bcc, subject].some((v) => v.trim());
  };

  const pickAttachment = async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    if ((a.size ?? 0) > MAX_FILE_BYTES) { showToast('Attachment too large (max 10 MB)'); return; }
    try {
      const contentBytes = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
      const total = attachments.reduce((n, x) => n + b64Bytes(x.contentBytes), 0) + b64Bytes(contentBytes);
      if (total > MAX_TOTAL_BYTES) { showToast('Attachments too large (max 14 MB total)'); return; }
      setAttachments((prev) => [...prev, { name: a.name, contentType: a.mimeType ?? 'application/octet-stream', contentBytes }]);
    } catch { showToast('Could not attach file'); }
  };

  const onClose = () => {
    if (worthSaving()) { saveDraft(buildOutgoing()); showToast('Saved to Drafts'); }
    router.back();
  };
  const onSend = () => {
    if (!to.trim()) { showToast('Add at least one recipient'); return; }
    send(buildOutgoing());
    showToast('Message sent');
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 pt-3 pb-2">
        <Pressable onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
          <X size={16} color={colors.ink} />
        </Pressable>
        <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '800' }}>{draftId ? 'Edit draft' : mode === 'forward' ? 'Forward' : mode ? 'Reply' : 'New message'}</Text>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Pressable onPress={pickAttachment} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
            <Paperclip size={16} color={colors.ink} />
          </Pressable>
          <Pressable onPress={onSend} className="flex-row items-center" style={{ gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.ink }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Send</Text>
            <Send size={14} color="#fff" />
          </Pressable>
        </View>
      </View>

      <KeyboardAwareScrollView bottomOffset={20} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        {/* To */}
        <Field label="To">
          <TextInput value={to} onChangeText={setTo} placeholder="name@company.com" placeholderTextColor={colors.textMuted}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={input} />
          <Pressable onPress={() => setShowCc((v) => !v)} hitSlop={8}><Text style={{ color: colors.blue, fontSize: 12, fontWeight: '700' }}>{showCc ? 'Hide' : 'Cc/Bcc'}</Text></Pressable>
        </Field>

        {showCc ? (
          <>
            <Field label="Cc">
              <TextInput value={cc} onChangeText={setCc} placeholder="Cc recipients" placeholderTextColor={colors.textMuted}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={input} />
            </Field>
            <Field label="Bcc">
              <TextInput value={bcc} onChangeText={setBcc} placeholder="Bcc recipients" placeholderTextColor={colors.textMuted}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={input} />
            </Field>
          </>
        ) : null}

        {/* Subject */}
        <Field label="Subject">
          <TextInput value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor={colors.textMuted} style={input} />
        </Field>

        {/* Attachments */}
        {attachments.length ? (
          <View style={{ paddingHorizontal: 18, paddingTop: 12, gap: 6 }}>
            {attachments.map((a, i) => (
              <View key={`${a.name}-${i}`} className="flex-row items-center" style={{ gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
                <Paperclip size={14} color={colors.textMuted} />
                <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontSize: 12.5, fontWeight: '600' }}>{a.name}</Text>
                <Pressable onPress={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} hitSlop={8}><X size={14} color={colors.textMuted} /></Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {/* Quoting an HTML original — let the user know the formatted original is appended below. */}
        {replyTo && original?.bodyType === 'html' ? (
          <View style={{ paddingHorizontal: 18, paddingTop: 12 }}>
            <Text style={{ color: colors.textMuted2, fontSize: 11 }}>The original message is quoted below your reply.</Text>
          </View>
        ) : null}

        {/* Body */}
        <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
          <TextInput value={body} onChangeText={setBody} placeholder="Write your message…" placeholderTextColor={colors.textMuted}
            multiline textAlignVertical="top" autoFocus={!!replyTo} style={{ color: colors.ink, fontSize: 15, lineHeight: 22, minHeight: 220 }} />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const input = { flex: 1, color: colors.ink, fontSize: 14.5, paddingVertical: 0 } as const;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row items-center" style={{ gap: 10, paddingHorizontal: 18, paddingVertical: 13, borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
      <Text style={{ width: 54, color: colors.textMuted, fontSize: 13, fontWeight: '700' }}>{label}</Text>
      {children}
    </View>
  );
}

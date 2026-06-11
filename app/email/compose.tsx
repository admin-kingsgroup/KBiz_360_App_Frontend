import { useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { X, Send } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { useEmailStore } from '../../src/store/emailStore';
import { useUiStore } from '../../src/store/uiStore';
import type { EmailDraft } from '../../src/types';

// Compose / reply / forward. Prefilled via route params (to/subject/body) from the detail screen.
// On send -> emailStore.send (maps to Graph POST /me/sendMail). Closing with content saves a draft.
export default function Compose() {
  const router = useRouter();
  const params = useLocalSearchParams<{ to?: string; subject?: string; body?: string }>();
  const send = useEmailStore((s) => s.send);
  const saveDraft = useEmailStore((s) => s.saveDraft);
  const showToast = useUiStore((s) => s.showToast);

  const [to, setTo] = useState(params.to ?? '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(params.subject ?? '');
  const [body, setBody] = useState(params.body ?? '');

  const draft = (): EmailDraft => ({ to, cc, bcc, subject, body });
  const hasContent = [to, cc, bcc, subject, body].some((v) => v.trim());

  const onClose = () => {
    if (hasContent) { saveDraft(draft()); showToast('Saved to Drafts'); }
    router.back();
  };
  const onSend = () => {
    if (!to.trim()) { showToast('Add at least one recipient'); return; }
    send(draft());
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
        <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '800' }}>New message</Text>
        <Pressable onPress={onSend} className="flex-row items-center" style={{ gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.ink }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Send</Text>
          <Send size={14} color="#fff" />
        </Pressable>
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

        {/* Body */}
        <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
          <TextInput value={body} onChangeText={setBody} placeholder="Write your message…" placeholderTextColor={colors.textMuted}
            multiline textAlignVertical="top" style={{ color: colors.ink, fontSize: 15, lineHeight: 22, minHeight: 220 }} />
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

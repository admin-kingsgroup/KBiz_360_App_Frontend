import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { FolderPlus, Pencil, X } from 'lucide-react-native';
import { colors } from '../../theme';
import { useEmailStore } from '../../store/emailStore';
import { useUiStore } from '../../store/uiStore';
import type { SmartFolder } from '../../types';

interface Props {
  visible: boolean;
  editing?: SmartFolder | null; // set = edit that folder; null/undefined = create a new one
  onClose: () => void;
  onSaved?: (sf: SmartFolder, created: boolean) => void;
}

// Create/edit dialog for a smart folder: its name + the sender domains/addresses that auto-file
// into it. Editing renames the real Outlook folder and updates its filing rule server-side.
export function SmartFolderModal({ visible, editing, onClose, onSaved }: Props) {
  const showToast = useUiStore((s) => s.showToast);
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-seed the fields each time the dialog opens (prefilled when editing, blank when creating).
  useEffect(() => {
    if (visible) { setName(editing?.name ?? ''); setFrom(editing?.from.join(', ') ?? ''); }
  }, [visible, editing]);

  const save = async () => {
    const n = name.trim();
    const matches = from.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!n) { showToast('Folder name required'); return; }
    if (!matches.length) { showToast('Add a sender domain or email to match'); return; }
    setSaving(true);
    const st = useEmailStore.getState();
    const sf = editing ? await st.updateSmartFolder(editing.id, n, matches) : await st.createSmartFolder(n, matches);
    setSaving(false);
    if (!sf) { showToast(editing ? 'Could not update folder' : 'Could not create folder'); return; }
    onClose();
    showToast(editing ? `"${sf.name}" updated` : `"${sf.name}" created — existing & new mail will file here`);
    onSaved?.(sf, !editing);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 18 }}>
          <View className="flex-row items-center justify-between" style={{ marginBottom: 4 }}>
            <View className="flex-row items-center" style={{ gap: 8 }}>
              {editing ? <Pencil size={18} color={colors.primary} /> : <FolderPlus size={18} color={colors.primary} />}
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>{editing ? 'Edit smart folder' : 'New smart folder'}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={18} color={colors.coolText} /></Pressable>
          </View>
          <Text style={{ color: colors.coolText, fontSize: 12.5, marginBottom: 12 }}>Mail from these senders is filed here automatically — existing & future.</Text>
          <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 }}>FOLDER NAME</Text>
          <TextInput value={name} onChangeText={setName} autoFocus placeholder="e.g. Travkings" placeholderTextColor={colors.coolText3} style={input} />
          <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 }}>FROM (DOMAIN OR EMAIL)</Text>
          <TextInput value={from} onChangeText={setFrom} autoCapitalize="none" autoCorrect={false} placeholder="travkings.com, accounts@travkings.com" placeholderTextColor={colors.coolText3} style={input} />
          <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 6 }}>Separate multiple with commas. A domain matches everyone from that company.</Text>
          <Pressable onPress={save} disabled={saving} style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 999, height: 48, alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create folder'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const input = { backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: colors.ink, fontWeight: '500' as const };

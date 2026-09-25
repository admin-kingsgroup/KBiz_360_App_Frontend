import { Modal, Pressable, View, Text, StyleSheet, Alert } from 'react-native';
import { BellOff, Bell, Pin, PinOff, Archive, ArchiveRestore, CheckCheck, Trash2 } from 'lucide-react-native';
import { colors } from '../../theme';
import { useMessagingStore } from '../../store/messagingStore';
import type { ChatConversation } from '../../api/chat';

// Long-press a chat row → the WhatsApp action sheet: mute (for a while or always), pin to the top,
// archive, mark read, clear stored messages. Everything here is personal to the signed-in user —
// muting a group mutes it for you, not for the group.

const MUTE_CHOICES: { label: string; hours: number | null }[] = [
  { label: '8 hours', hours: 8 },
  { label: '1 week', hours: 24 * 7 },
  { label: 'Always', hours: null },
];

export function ChatActionsSheet({ conv, onClose }: { conv: ChatConversation | null; onClose: () => void }) {
  if (!conv) return null;
  const store = useMessagingStore.getState;
  const muted = !!conv.muted;
  const pinned = !!conv.pinned;

  const act = (fn: () => void): void => { fn(); onClose(); };

  const toggleMute = (): void => {
    if (muted) { act(() => void store().setConversationSettings(conv.id, { muted: false })); return; }
    Alert.alert(`Mute ${conv.name}`, 'You will still see the messages — they just will not notify you.', [
      { text: 'Cancel', style: 'cancel', onPress: onClose },
      ...MUTE_CHOICES.map((c) => ({
        text: c.label,
        onPress: () => act(() => void store().setConversationSettings(conv.id, { muted: true, muteHours: c.hours })),
      })),
    ]);
  };

  const clearStored = (): void => {
    Alert.alert(`Clear stored messages?`, 'Frees space on this phone. The messages stay on the server and come back when you open the chat.', [
      { text: 'Cancel', style: 'cancel', onPress: onClose },
      { text: 'Clear', style: 'destructive', onPress: () => act(() => void store().clearLocalThread(conv.id)) },
    ]);
  };

  const rows = [
    { key: 'mute', label: muted ? 'Unmute notifications' : 'Mute notifications', Icon: muted ? Bell : BellOff, onPress: toggleMute },
    { key: 'pin', label: pinned ? 'Unpin chat' : 'Pin chat', Icon: pinned ? PinOff : Pin, onPress: () => act(() => void store().setConversationSettings(conv.id, { pinned: !pinned })) },
    ...(conv.unread ? [{ key: 'read', label: 'Mark as read', Icon: CheckCheck, onPress: () => act(() => void store().markRead(conv.id)) }] : []),
    { key: 'archive', label: conv.archived ? 'Unarchive chat' : 'Archive chat', Icon: conv.archived ? ArchiveRestore : Archive, onPress: () => act(() => void store().setConversationSettings(conv.id, { archived: !conv.archived })) },
    { key: 'clear', label: 'Clear from this phone', Icon: Trash2, danger: true, onPress: clearStored },
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28, paddingTop: 8 }}>
          <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.coolDivider, marginBottom: 8 }} />
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingBottom: 10 }}>{conv.name}</Text>
          {rows.map((r, i) => (
            <Pressable key={r.key} onPress={r.onPress} android_ripple={{ color: colors.coolMuted }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: i === 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.coolDivider }}>
              <r.Icon size={20} color={r.danger ? colors.danger : colors.coolText} />
              <Text style={{ color: r.danger ? colors.danger : colors.ink, fontSize: 15.5 }}>{r.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

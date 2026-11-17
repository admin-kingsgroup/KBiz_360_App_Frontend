import { useRef } from 'react';
import { Alert, useWindowDimensions } from 'react-native';
import { AnchoredMenu, MenuHeading, MenuItem, type AnchorRect } from '../ui/AnchoredMenu';
import { BellOff, Bell, Pin, PinOff, Archive, ArchiveRestore, CheckCheck, Trash2, MessageSquareX } from 'lucide-react-native';
import { colors } from '../../theme';
import { useMessagingStore } from '../../store/messagingStore';
import { useUiStore } from '../../store/uiStore';
import type { ChatConversation } from '../../api/chat';

// Long-press a chat row → the WhatsApp action sheet: mute (for a while or always), pin to the top,
// archive, mark read, clear stored messages, delete a one-to-one chat. Everything here is personal to
// the signed-in user — muting a group mutes it for you, not for the group; deleting a chat deletes it
// for you, not for the other person. (Groups: Leave / Delete group live in Group info.)
// It opens as a menu beside the pressed row, at the finger (AnchoredMenu) — it was a bottom sheet over
// a dark scrim (owner, 2026-11-17). `at` is where the row was; without it the menu opens mid-screen.

const MUTE_CHOICES: { label: string; hours: number | null }[] = [
  { label: '8 hours', hours: 8 },
  { label: '1 week', hours: 24 * 7 },
  { label: 'Always', hours: null },
];

export function ChatActionsSheet({ conv: open, at, onClose }: { conv: ChatConversation | null; at?: AnchorRect | null; onClose: () => void }) {
  const { width: winW, height: winH } = useWindowDimensions();
  // The last chat shown stays drawn while the menu fades out after it is closed.
  const last = useRef<{ conv: ChatConversation; at?: AnchorRect | null } | null>(null);
  if (open) last.current = { conv: open, at };
  if (!last.current) return null;
  const conv = last.current.conv;
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

  const deleteChat = (): void => {
    Alert.alert(`Delete chat with ${conv.name}?`, `The chat and its messages go from your chats on every device. ${conv.name} keeps their copy.`, [
      { text: 'Cancel', style: 'cancel', onPress: onClose },
      {
        text: 'Delete chat', style: 'destructive',
        onPress: () => act(() => void store().deleteChat(conv.id).then((ok) => {
          useUiStore.getState().showToast(ok ? 'Chat deleted' : 'Could not delete the chat — check your connection');
        })),
      },
    ]);
  };

  const rows = [
    { key: 'mute', label: muted ? 'Unmute notifications' : 'Mute notifications', Icon: muted ? Bell : BellOff, onPress: toggleMute },
    { key: 'pin', label: pinned ? 'Unpin chat' : 'Pin chat', Icon: pinned ? PinOff : Pin, onPress: () => act(() => void store().setConversationSettings(conv.id, { pinned: !pinned })) },
    ...(conv.unread ? [{ key: 'read', label: 'Mark as read', Icon: CheckCheck, onPress: () => act(() => void store().markRead(conv.id)) }] : []),
    { key: 'archive', label: conv.archived ? 'Unarchive chat' : 'Archive chat', Icon: conv.archived ? ArchiveRestore : Archive, onPress: () => act(() => void store().setConversationSettings(conv.id, { archived: !conv.archived })) },
    ...(conv.type === 'direct' ? [{ key: 'delete', label: 'Delete chat', Icon: MessageSquareX, danger: true, onPress: deleteChat }] : []),
    { key: 'clear', label: 'Clear from this phone', Icon: Trash2, danger: true, onPress: clearStored },
  ];

  const anchor = open ? (last.current.at ?? { x: winW / 2 - 140, y: winH / 3, width: 280, height: 0 }) : null;
  const menuColors = { text: colors.ink, mute: colors.coolText, danger: colors.danger, pressed: colors.coolMuted, divider: colors.coolDivider };
  return (
    <AnchoredMenu anchor={anchor} onClose={onClose} width={280} background={colors.card} border={colors.coolDivider} label={`Actions for ${conv.name}`}>
      <MenuHeading color={colors.coolText}>{conv.name}</MenuHeading>
      {rows.map((r, i) => (
        <MenuItem key={r.key} index={i} label={r.label} Icon={r.Icon} danger={'danger' in r && !!r.danger} onPress={r.onPress} colors={menuColors} />
      ))}
    </AnchoredMenu>
  );
}

import { memo } from 'react';
import { Pressable, View, Text } from 'react-native';
import { Check, CheckCheck, BellOff, Pin, Image as ImageIcon } from 'lucide-react-native';
import { colors, useChatListPalette } from '../../theme';
import { ChatTile } from './ChatTile';
import type { DirectChatItem } from '../../data/chats';

// WhatsApp list ticks: shown before the preview when the last message is MINE (caller sets lastStatus).
export type ChatRowItem = DirectChatItem & {
  lastStatus?: 'sent' | 'delivered' | 'read' | null;
  muted?: boolean;
  pinned?: boolean;
  /** Unsent text for this chat — replaces the preview with WhatsApp's red "Draft:" line. */
  draft?: string | null;
  /** Short code for the row's tile — branch code, else business code, else initials (chatTile.ts). */
  branchCode?: string | null;
  companyCode?: string | null;
  /** Last message was a photo/video — the approved row shows a small image glyph before the preview. */
  isImage?: boolean;
};

// Row per the approved design canvas (2026-09-28): a 48px ROUNDED-SQUARE code tile, not a circular
// avatar — the code is how people refer to these rooms. The tint is keyed on that same code, so
// every room in a group (all the KGD rooms, say) carries one colour and the list groups at a glance. An unread row is
// carried by weight and a faint tinted ground rather than by a louder badge.
// NOTE: keep the style a plain static array — a ({pressed}) => … function style on a Pressable gets
// dropped by the NativeWind interop here (the row un-cards and stacks vertically). Ripple = feedback.
function ChatListItemBase({ chat, onPress, onLongPress }: { chat: ChatRowItem; onPress: () => void; onLongPress?: () => void }) {
  const unread = !!chat.unread;
  // Painted from the global chat theme, so the list matches the conversations it opens. Read rows sit
  // on a light tint, unread rows on the full theme colour; no dividers — the two grounds separate rows.
  const p = useChatListPalette();
  const ground = unread ? p.rowUnread : p.list;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: p.line }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        minHeight: 72, paddingVertical: 12, paddingHorizontal: 20,
        backgroundColor: ground,
      }}
    >
      {/* A real photo still wins over the code — a group with an image is recognised by it. */}
      <ChatTile name={chat.name} branchCode={chat.branchCode} companyCode={chat.companyCode}
        image={chat.image} size={48} radius={14} online={chat.online}
        dotBorder={ground} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ color: p.text, fontSize: 15, fontWeight: unread ? '800' : '600', flex: 1 }}>{chat.name}</Text>
          {chat.muted ? <BellOff size={14} color={p.mute} /> : null}
          <Text style={{ color: unread ? p.unreadTime : p.mute, fontSize: 12, fontWeight: unread ? '700' : '600' }}>{chat.time}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {/* A pending draft outranks the last message in the preview slot — it is the thing the
              user left unfinished, and the red label is how WhatsApp flags it. */}
          {chat.draft ? null : chat.lastStatus ? (chat.lastStatus === 'sent'
            ? <Check size={16} color={p.mute} />
            : <CheckCheck size={16} color={chat.lastStatus === 'read' ? p.accent : p.mute} />) : null}
          {!chat.draft && chat.isImage ? <ImageIcon size={15} color={p.mute} /> : null}
          {chat.draft ? (
            <Text numberOfLines={1} style={{ fontSize: 13.5, flex: 1 }}>
              <Text style={{ color: colors.danger }}>Draft: </Text>
              <Text style={{ color: p.mute }}>{chat.draft}</Text>
            </Text>
          ) : (
            <Text numberOfLines={1} style={{ color: unread ? p.text : p.mute, fontSize: 13.5, flex: 1 }}>{chat.preview}</Text>
          )}
          {chat.pinned && !unread ? <Pin size={14} color={p.mute} /> : null}
          {unread ? (
            <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: chat.muted ? p.mute : p.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: p.onAccent, fontSize: 11, fontWeight: '700' }}>{chat.unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export const ChatListItem = memo(ChatListItemBase);

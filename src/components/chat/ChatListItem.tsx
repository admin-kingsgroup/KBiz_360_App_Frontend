import { memo } from 'react';
import { Pressable, View, Text, Image, StyleSheet } from 'react-native';
import { Check, CheckCheck, BellOff, Pin, Image as ImageIcon } from 'lucide-react-native';
import { colors } from '../../theme';
import { categoryForChat, tileCodeFor, tileColorsFor } from '../../logic/chatTile';
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

// Row per the approved design canvas (2026-09-28): a 48px ROUNDED-SQUARE code tile tinted by what
// the conversation is for (support / ticket / marketing / ERP), not a circular avatar — the code is
// how people refer to these rooms, and the tint sorts a long list at a glance. An unread row is
// carried by weight and a faint tinted ground rather than by a louder badge.
// NOTE: keep the style a plain static array — a ({pressed}) => … function style on a Pressable gets
// dropped by the NativeWind interop here (the row un-cards and stacks vertically). Ripple = feedback.
function ChatListItemBase({ chat, onPress, onLongPress, topDivider = false }: { chat: ChatRowItem; onPress: () => void; onLongPress?: () => void; topDivider?: boolean }) {
  const unread = !!chat.unread;
  const tile = tileColorsFor(categoryForChat(chat.name));
  const code = tileCodeFor({ name: chat.name, branchCode: chat.branchCode, companyCode: chat.companyCode });
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: colors.coolMuted }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        minHeight: 72, paddingVertical: 12, paddingHorizontal: 20,
        backgroundColor: unread ? colors.rowUnread : colors.card,
      }}
    >
      {topDivider ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.coolDivider }} /> : null}
      {/* A real photo still wins over the code — a group with an image is recognised by it. */}
      <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: tile.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {chat.image
          ? <Image source={{ uri: chat.image }} style={{ width: 48, height: 48, borderRadius: 14 }} />
          : <Text numberOfLines={1} style={{ color: tile.fg, fontWeight: '800', fontSize: 12, letterSpacing: 0.2 }}>{code}</Text>}
        {chat.online ? <View style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, borderWidth: 2.5, borderColor: colors.card }} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: unread ? '800' : '600', flex: 1 }}>{chat.name}</Text>
          {chat.muted ? <BellOff size={14} color={colors.coolText3} /> : null}
          <Text style={{ color: unread ? colors.primary : colors.coolText, fontSize: 12, fontWeight: '600' }}>{chat.time}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {/* A pending draft outranks the last message in the preview slot — it is the thing the
              user left unfinished, and the red label is how WhatsApp flags it. */}
          {chat.draft ? null : chat.lastStatus ? (chat.lastStatus === 'sent'
            ? <Check size={16} color={colors.coolText3} />
            : <CheckCheck size={16} color={chat.lastStatus === 'read' ? colors.tick : colors.coolText3} />) : null}
          {!chat.draft && chat.isImage ? <ImageIcon size={15} color={colors.coolText} /> : null}
          {chat.draft ? (
            <Text numberOfLines={1} style={{ fontSize: 13.5, flex: 1 }}>
              <Text style={{ color: colors.danger }}>Draft: </Text>
              <Text style={{ color: colors.coolText }}>{chat.draft}</Text>
            </Text>
          ) : (
            <Text numberOfLines={1} style={{ color: unread ? colors.ink : colors.coolText, fontSize: 13.5, flex: 1 }}>{chat.preview}</Text>
          )}
          {chat.pinned && !unread ? <Pin size={14} color={colors.coolText3} /> : null}
          {unread ? (
            <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: chat.muted ? colors.coolText3 : colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{chat.unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export const ChatListItem = memo(ChatListItemBase);

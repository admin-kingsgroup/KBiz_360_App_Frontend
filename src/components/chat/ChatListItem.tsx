import { textStyles } from '../../theme/typography';
import { memo } from 'react';
import { Pressable, View, Text, PixelRatio, type GestureResponderEvent } from 'react-native';
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
const DIVIDER_INSET = 20 + 48 + 12;
// Two physical pixels on every screen: a one-pixel hairline all but vanished on a 3x phone.
const DIVIDER_HEIGHT = 2 / PixelRatio.get();
// The open chat's leading bar in the two-pane view.
const SELECTED_BAR_WIDTH = 4;

// `selected`: the chat open beside the list in the two-pane view (iPhone Duo opened), marked the way
// WhatsApp marks it in its wide layouts. Seen on the Duo simulator (2026-11-17): the search field's
// colour, used first, is all but the read-row tint, so the open chat did not show. It now sits on an
// accent tint (palette `selected`) with an accent bar down its leading edge. The bar is what tells it
// from an unread row: in some themes any tint lands near the unread ground.
function ChatListItemBase({ chat, onPress, onLongPress, selected = false }: { chat: ChatRowItem; onPress: () => void; onLongPress?: (e: GestureResponderEvent) => void; selected?: boolean }) {
  const unread = !!chat.unread;
  // Painted from the global chat theme, so the list matches the conversations it opens. Read rows sit
  // on a light tint, unread rows on the full theme colour, and a WhatsApp hairline closes every row.
  const p = useChatListPalette();
  const ground = selected ? p.selected : unread ? p.rowUnread : p.list;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: p.line }}
      accessibilityState={selected ? { selected: true } : undefined}
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
          {/* Semibold, unread or not, as WhatsApp sets names: unread shows in the time and the badge. Bold
              also spread the name ~5 pt wider. */}
          <Text numberOfLines={1} style={{ color: p.text, ...textStyles.headline, flex: 1 }}>{chat.name}</Text>
          {chat.muted ? <BellOff size={14} color={p.mute} /> : null}
          <Text style={{ color: unread ? p.unreadTime : p.mute, ...textStyles.subheadline, fontWeight: unread ? '600' : '400' }}>{chat.time}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {/* A pending draft outranks the last message in the preview slot — it is the thing the
              user left unfinished, and the red label is how WhatsApp flags it. */}
          {chat.draft ? null : chat.lastStatus ? (chat.lastStatus === 'sent'
            ? <Check size={16} color={p.mute} />
            : <CheckCheck size={16} color={chat.lastStatus === 'read' ? p.accent : p.mute} />) : null}
          {!chat.draft && chat.isImage ? <ImageIcon size={15} color={p.mute} /> : null}
          {chat.draft ? (
            <Text numberOfLines={1} style={{ ...textStyles.subheadline, flex: 1 }}>
              <Text style={{ color: colors.danger }}>Draft: </Text>
              <Text style={{ color: p.mute }}>{chat.draft}</Text>
            </Text>
          ) : (
            <Text numberOfLines={1} style={{ color: unread ? p.text : p.mute, ...textStyles.subheadline, flex: 1 }}>{chat.preview}</Text>
          )}
          {chat.pinned && !unread ? <Pin size={14} color={p.mute} /> : null}
          {unread ? (
            <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: chat.muted ? p.mute : p.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: p.onAccent, ...textStyles.footnote, fontWeight: '600' }}>{chat.unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {/* WhatsApp's divider: one hairline under the text column (it starts where the name starts,
          past the tile) and runs to the right edge. Inset = padding 20 + tile 48 + gap 12. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: DIVIDER_INSET, right: 0, bottom: 0, height: DIVIDER_HEIGHT, backgroundColor: p.divider }} />
      {selected ? (
        <View testID="chat-row-selected-bar" pointerEvents="none"
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: SELECTED_BAR_WIDTH, backgroundColor: p.accent }} />
      ) : null}
    </Pressable>
  );
}

export const ChatListItem = memo(ChatListItemBase);

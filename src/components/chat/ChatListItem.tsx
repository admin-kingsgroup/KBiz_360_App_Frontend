import { memo } from 'react';
import { Pressable, View, Text, Image, StyleSheet } from 'react-native';
import { Check, CheckCheck } from 'lucide-react-native';
import { colors } from '../../theme';
import type { DirectChatItem } from '../../data/chats';

// WhatsApp list ticks: shown before the preview when the last message is MINE (caller sets lastStatus).
export type ChatRowItem = DirectChatItem & { lastStatus?: 'sent' | 'delivered' | 'read' | null };

// Flat WhatsApp-style row per the approved mockup: full-width white row, 54px circular avatar,
// hairline top divider between rows (topDivider), green time/ticks/badge when relevant.
// NOTE: keep the style a plain static array — a ({pressed}) => … function style on a Pressable gets
// dropped by the NativeWind interop here (the row un-cards and stacks vertically). Ripple = feedback.
function ChatListItemBase({ chat, onPress, topDivider = false }: { chat: ChatRowItem; onPress: () => void; topDivider?: boolean }) {
  const unread = !!chat.unread;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.coolMuted }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        minHeight: 80, paddingVertical: 12, paddingHorizontal: 16,
        backgroundColor: colors.card,
      }}
    >
      {topDivider ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.coolDivider }} /> : null}
      <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: chat.color, alignItems: 'center', justifyContent: 'center' }}>
        {chat.image
          ? <Image source={{ uri: chat.image }} style={{ width: 54, height: 54, borderRadius: 27 }} />
          : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 19 }}>{chat.initials}</Text>}
        {chat.online ? <View style={{ position: 'absolute', bottom: 0, right: 0, width: 15, height: 15, borderRadius: 8, backgroundColor: colors.accent, borderWidth: 2.5, borderColor: colors.card }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 17, fontWeight: unread ? '700' : '600', flex: 1 }}>{chat.name}</Text>
          <Text style={{ color: unread ? colors.primary : colors.coolText3, fontSize: 12, fontWeight: unread ? '700' : '500' }}>{chat.time}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {chat.lastStatus ? (chat.lastStatus === 'sent'
            ? <Check size={15} color={colors.primary} />
            : <CheckCheck size={15} color={chat.lastStatus === 'read' ? colors.primary : colors.coolText3} />) : null}
          <Text numberOfLines={1} style={{ color: unread ? colors.ink : colors.coolText, fontSize: 14, fontWeight: unread ? '500' : '400', flex: 1 }}>{chat.preview}</Text>
          {unread ? <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{chat.unread}</Text></View> : null}
        </View>
      </View>
    </Pressable>
  );
}

export const ChatListItem = memo(ChatListItemBase);

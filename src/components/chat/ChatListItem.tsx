import { memo } from 'react';
import { Pressable, View, Text, Image } from 'react-native';
import { Check, CheckCheck } from 'lucide-react-native';
import { colors, shadow } from '../../theme';
import type { DirectChatItem } from '../../data/chats';

// WhatsApp list ticks: shown before the preview when the last message is MINE (caller sets lastStatus).
export type ChatRowItem = DirectChatItem & { lastStatus?: 'sent' | 'delivered' | 'read' | null };

function ChatListItemBase({ chat, onPress }: { chat: ChatRowItem; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-2.5 p-2.5"
      style={[{ backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 20 }, shadow]}>
      <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: chat.color, alignItems: 'center', justifyContent: 'center' }}>
        {chat.image
          ? <Image source={{ uri: chat.image }} style={{ width: 38, height: 38, borderRadius: 14 }} />
          : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{chat.initials}</Text>}
        {chat.online ? <View style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.teal, borderWidth: 2, borderColor: colors.card }} /> : null}
      </View>
      <View className="flex-1">
        <View className="flex-row justify-between items-baseline gap-2">
          <Text numberOfLines={1} style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 14, fontWeight: '600', flex: 1 }}>{chat.name}</Text>
          <Text style={{ color: '#bdb3a0', fontSize: 10, fontWeight: '600' }}>{chat.time}</Text>
        </View>
        <View className="flex-row justify-between items-center gap-2 mt-0.5">
          {chat.lastStatus ? (chat.lastStatus === 'sent'
            ? <Check size={13} color={colors.warmMute} />
            : <CheckCheck size={13} color={chat.lastStatus === 'read' ? '#4F8BFF' : colors.warmMute} />) : null}
          <Text numberOfLines={1} style={{ color: colors.warmMute, fontSize: 11, flex: 1 }}>{chat.preview}</Text>
          {chat.unread ? <View style={{ width: 17, height: 17, borderRadius: 9, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '800' }}>{chat.unread}</Text></View> : null}
        </View>
      </View>
    </Pressable>
  );
}

export const ChatListItem = memo(ChatListItemBase);

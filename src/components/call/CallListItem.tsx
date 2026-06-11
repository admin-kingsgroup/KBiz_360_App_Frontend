import { View, Text, Pressable } from 'react-native';
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Phone, Video } from 'lucide-react-native';
import { Avatar } from '../ui';
import { colors } from '../../theme';
import type { CallRecord } from '../../types';
import { callTime } from '../../logic/call';

// One row in the call history list (WhatsApp-style): avatar, name, direction + type + time,
// and a trailing call-back button matching the call's type.
export function CallListItem({ call, onPress, onCallBack }: { call: CallRecord; onPress: () => void; onCallBack: () => void }) {
  const missed = call.direction === 'missed';
  const DirIcon = missed ? PhoneMissed : call.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;
  const dirColor = missed ? colors.danger : colors.success;
  const CallIcon = call.type === 'video' ? Video : Phone;

  return (
    <Pressable onPress={onPress} className="flex-row items-center px-4 py-3" style={{ gap: 12, backgroundColor: colors.card, borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
      <Avatar initials={call.contact.initials} color={call.contact.color} size={46} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: missed ? colors.danger : colors.ink, fontSize: 14.5, fontWeight: '700' }}>{call.contact.name}</Text>
        <View className="flex-row items-center" style={{ gap: 5, marginTop: 2 }}>
          <DirIcon size={13} color={dirColor} />
          <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>
            {call.direction === 'missed' ? 'Missed' : call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} · {callTime(call.ts, Date.now())}
          </Text>
        </View>
      </View>
      <Pressable onPress={onCallBack} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <CallIcon size={20} color={colors.ink} />
      </Pressable>
    </Pressable>
  );
}

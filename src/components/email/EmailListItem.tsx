import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Paperclip, Star } from 'lucide-react-native';
import { Avatar } from '../ui';
import { colors } from '../../theme';
import type { Email, EmailFolder } from '../../types';
import { initialsOf, relativeTime } from '../../logic/email';

// One row in the mail list. In Sent/Drafts we show the recipient instead of the sender.
export function EmailListItem({ email, folder, onPress }: { email: Email; folder: EmailFolder; onPress: () => void }) {
  const outgoing = folder === 'sent' || folder === 'drafts';
  const person = outgoing ? (email.to[0] ?? email.from) : email.from;
  const unread = !email.read && folder === 'inbox';

  return (
    <Pressable onPress={onPress} android_ripple={{ color: colors.coolMuted }} className="flex-row px-4 py-3" style={{ gap: 10, backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: StyleSheet.hairlineWidth }}>
      <View style={{ width: 8, alignItems: 'center', paddingTop: 18 }}>
        {unread ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary }} /> : null}
      </View>
      <Avatar initials={initialsOf(person)} color={email.color} size={48} />
      <View style={{ flex: 1 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontSize: 16, fontWeight: unread ? '700' : '600' }}>
            {outgoing ? `To: ${person.name}` : person.name}
          </Text>
          {email.starred ? <Star size={14} color={colors.orange} fill={colors.orange} /> : null}
          <Text style={{ color: unread ? colors.primary : colors.coolText3, fontSize: 12, fontWeight: unread ? '700' : '500' }}>{relativeTime(email.ts, Date.now())}</Text>
        </View>
        <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: unread ? '600' : '500', marginTop: 2 }}>
          {email.subject}
        </Text>
        <View className="flex-row items-center" style={{ gap: 5, marginTop: 2 }}>
          {email.hasAttachments ? <Paperclip size={13} color={colors.coolText} /> : null}
          <Text numberOfLines={1} style={{ flex: 1, color: colors.coolText, fontSize: 13 }}>{email.preview}</Text>
        </View>
      </View>
    </Pressable>
  );
}

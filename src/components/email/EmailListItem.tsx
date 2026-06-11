import { View, Text, Pressable } from 'react-native';
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
    <Pressable onPress={onPress} className="flex-row px-4 py-3" style={{ gap: 12, backgroundColor: colors.card, borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
      <View style={{ width: 8, alignItems: 'center', paddingTop: 16 }}>
        {unread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue }} /> : null}
      </View>
      <Avatar initials={initialsOf(person)} color={email.color} size={42} />
      <View style={{ flex: 1 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontSize: 14, fontWeight: unread ? '800' : '600' }}>
            {outgoing ? `To: ${person.name}` : person.name}
          </Text>
          {email.starred ? <Star size={13} color={colors.orange} fill={colors.orange} /> : null}
          <Text style={{ color: unread ? colors.blue : colors.textMuted, fontSize: 11, fontWeight: '700' }}>{relativeTime(email.ts, Date.now())}</Text>
        </View>
        <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13, fontWeight: unread ? '700' : '500', marginTop: 2 }}>
          {email.subject}
        </Text>
        <View className="flex-row items-center" style={{ gap: 5, marginTop: 1 }}>
          {email.hasAttachments ? <Paperclip size={12} color={colors.textMuted} /> : null}
          <Text numberOfLines={1} style={{ flex: 1, color: colors.textMuted, fontSize: 12 }}>{email.preview}</Text>
        </View>
      </View>
    </Pressable>
  );
}

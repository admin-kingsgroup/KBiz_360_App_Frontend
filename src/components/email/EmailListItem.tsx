import { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Paperclip, Star, Trash2 } from 'lucide-react-native';
import { Avatar } from '../ui';
import { colors } from '../../theme';
import type { Email, EmailFolder } from '../../types';
import { initialsOf, relativeTime } from '../../logic/email';

// One row in the mail list. In Sent/Drafts we show the recipient instead of the sender.
//
// memo + stable callbacks: the list re-renders on every store change (search keystrokes, the 30s
// background refresh, read/star updates) — rows must only repaint when THEIR email object changes.
// The store's merges preserve object identity for unchanged messages, so this memo actually holds.
// onOpen/onDelete receive the email (instead of per-row closures) so the parent can pass the same
// function reference to every row.
export const EmailListItem = memo(function EmailListItem({ email, folder, onOpen, onDelete }: {
  email: Email;
  folder: EmailFolder;
  onOpen: (e: Email) => void;
  onDelete?: (e: Email) => void; // when set, swiping left reveals Delete
}) {
  const outgoing = folder === 'sent' || folder === 'drafts';
  const person = outgoing ? (email.to[0] ?? email.from) : email.from;
  const unread = !email.read && folder === 'inbox';

  const row = (
    <Pressable onPress={() => onOpen(email)} android_ripple={{ color: colors.coolMuted }} className="flex-row px-4 py-3" style={{ gap: 10, backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: StyleSheet.hairlineWidth }}>
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

  if (!onDelete) return row;
  return (
    <Swipeable
      overshootRight={false}
      renderRightActions={() => (
        <Pressable onPress={() => onDelete(email)} style={{ width: 84, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger }}>
          <Trash2 size={20} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 4 }}>Delete</Text>
        </Pressable>
      )}
    >
      {row}
    </Swipeable>
  );
});

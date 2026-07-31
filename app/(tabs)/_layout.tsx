import { Tabs } from 'expo-router';
import { View, Text, Image, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, Bell, Mail, type LucideIcon } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useEmailStore } from '../../src/store/emailStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useReminderBadgeStore } from '../../src/store/reminderBadgeStore';

// Pill that highlights behind the active tab's icon (WhatsApp-style bottom bar).
function TabPill({ Icon, color, focused }: { Icon: LucideIcon; color: ColorValue; focused: boolean }) {
  return (
    <View style={{ width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.primarySoft : 'transparent' }}>
      <Icon color={color as string} size={24} />
    </View>
  );
}

// Finalized bottom tab shell. Chats badge = live sum of conversation unread counts (updates in
// real time as messages arrive over the socket and as conversations are read).
function ProfileTabIcon({ focused }: { focused: boolean }) {
  const user = useAccessStore((s) => s.user);
  return (
    <View style={{ width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.primarySoft : 'transparent' }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', borderWidth: focused ? 2 : 0, borderColor: colors.primary, overflow: 'hidden' }}>
        {user?.avatar
          ? <Image source={{ uri: user.avatar }} style={{ width: 26, height: 26, borderRadius: 13 }} />
          : <Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '800' }}>{user?.initials ?? '–'}</Text>}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const chatsBadge = useMessagingStore((s) => s.conversations.reduce((n, c) => n + (c.unread || 0), 0));
  const reminderBadge = useReminderBadgeStore((s) => s.count);
  const emailBadge = useEmailStore((s) => s.inboxUnread); // real Graph inbox unread count
  // Reserve room for the system navigation bar (3-button nav) so the icons + labels never sit under
  // it. We set the height explicitly, which disables React Navigation's auto safe-area, so we add
  // insets.bottom back into both the height and the bottom padding ourselves.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 0,
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          height: 62 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          shadowColor: '#0b1220', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: -2 },
          elevation: 16,
        },
        tabBarItemStyle: { paddingTop: 2 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Chats', tabBarIcon: ({ color, focused }) => <TabPill Icon={MessageCircle} color={color} focused={focused} />, tabBarBadge: chatsBadge > 0 ? (chatsBadge > 9 ? '9+' : chatsBadge) : undefined }} />
      <Tabs.Screen name="reminders" options={{ title: 'Reminders', tabBarIcon: ({ color, focused }) => <TabPill Icon={Bell} color={color} focused={focused} />, tabBarBadge: reminderBadge > 0 ? (reminderBadge > 9 ? '9+' : reminderBadge) : undefined }} />
      <Tabs.Screen name="email" options={{ title: 'Email', tabBarIcon: ({ color, focused }) => <TabPill Icon={Mail} color={color} focused={focused} />, tabBarBadge: emailBadge > 0 ? (emailBadge > 9 ? '9+' : emailBadge) : undefined }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} /> }} />
    </Tabs>
  );
}

import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { MessageCircle, Bell, Phone, Mail } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { businesses } from '../../src/data/businesses';
import { useAccessStore } from '../../src/store/accessStore';
import { useEmailStore } from '../../src/store/emailStore';
import { unreadCount } from '../../src/logic/email';

// Finalized bottom tab shell. Chats badge = sum of business unread (source behavior).
function ProfileTabIcon({ focused }: { focused: boolean }) {
  const user = useAccessStore((s) => s.user);
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', borderWidth: focused ? 2 : 0, borderColor: colors.orange }}>
      <Text style={{ color: '#fff', fontSize: 8.5, fontWeight: '800' }}>{user?.initials ?? '–'}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const chatsBadge = businesses.reduce((s, b) => s + (b.unread || 0), 0);
  const emailBadge = useEmailStore((s) => unreadCount(s.emails, 'inbox'));
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: '#bdb3a0',
        tabBarStyle: { borderTopColor: colors.cardEdge, backgroundColor: '#fff' },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Chats', tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size ?? 20} />, tabBarBadge: chatsBadge > 0 ? (chatsBadge > 9 ? '9+' : chatsBadge) : undefined }} />
      <Tabs.Screen name="reminders" options={{ title: 'Reminders', tabBarIcon: ({ color, size }) => <Bell color={color} size={size ?? 20} /> }} />
      <Tabs.Screen name="call" options={{ title: 'Call', tabBarIcon: ({ color, size }) => <Phone color={color} size={size ?? 20} /> }} />
      <Tabs.Screen name="email" options={{ title: 'Email', tabBarIcon: ({ color, size }) => <Mail color={color} size={size ?? 20} />, tabBarBadge: emailBadge > 0 ? (emailBadge > 9 ? '9+' : emailBadge) : undefined }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} /> }} />
    </Tabs>
  );
}

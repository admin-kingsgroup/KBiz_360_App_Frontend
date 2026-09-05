import { Tabs } from 'expo-router';
import { View, Text, Image, Pressable, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, Users, Bell, Mail, RefreshCw, type LucideIcon } from 'lucide-react-native';
import { useOtaUpdate } from '../../src/hooks/useOtaUpdate';
import { colors } from '../../src/theme';
import { useAccessStore } from '../../src/store/accessStore';
import { useEmailStore } from '../../src/store/emailStore';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useReminderBadgeStore } from '../../src/store/reminderBadgeStore';
import { usePulseStore } from '../../src/store/pulseStore';
import { isVisibleAlertChannel } from '../../src/data/pulse';

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
  // Tab badges count CHATS with unread, not unread messages — the same unit as the segment badges
  // inside the Groups tab and the app-icon badge (chatNotifications.ts), so all three always agree.
  // Chats = direct conversations, Groups = group conversations + unread system-alert events (same
  // visible-channel gate as the Alerts pane). Archived conversations are hidden from the lists, so
  // they don't count here either.
  const chatsBadge = useMessagingStore((s) => s.conversations.reduce((n, c) => n + (c.type === 'direct' && !c.archived && (c.unread || 0) > 0 ? 1 : 0), 0));
  const groupUnread = useMessagingStore((s) => s.conversations.reduce((n, c) => n + (c.type === 'group' && !c.archived && (c.unread || 0) > 0 ? 1 : 0), 0));
  const alertUnread = usePulseStore((s) => s.events.reduce((n, e) => n + (!e.read && isVisibleAlertChannel(e.channelId) ? 1 : 0), 0));
  const groupsBadge = groupUnread + alertUnread;
  const reminderBadge = useReminderBadgeStore((s) => s.count);
  const emailBadge = useEmailStore((s) => s.inboxUnread); // real Graph inbox unread count
  // Reserve room for the system navigation bar (3-button nav) so the icons + labels never sit under
  // it. We set the height explicitly, which disables React Navigation's auto safe-area, so we add
  // insets.bottom back into both the height and the bottom padding ourselves.
  const insets = useSafeAreaInsets();
  // OTA updates: check on launch + every foreground, then offer a one-tap in-place restart. Without
  // this, updates only land on a cold start — which Android may not do for days.
  const { updateReady, applyUpdate } = useOtaUpdate();
  return (
    <View style={{ flex: 1 }}>
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
      <Tabs.Screen name="groups" options={{ title: 'Groups', tabBarIcon: ({ color, focused }) => <TabPill Icon={Users} color={color} focused={focused} />, tabBarBadge: groupsBadge > 0 ? (groupsBadge > 9 ? '9+' : groupsBadge) : undefined }} />
      <Tabs.Screen name="reminders" options={{ title: 'Reminders', tabBarIcon: ({ color, focused }) => <TabPill Icon={Bell} color={color} focused={focused} />, tabBarBadge: reminderBadge > 0 ? (reminderBadge > 9 ? '9+' : reminderBadge) : undefined }} />
      <Tabs.Screen name="email" options={{ title: 'Email', tabBarIcon: ({ color, focused }) => <TabPill Icon={Mail} color={color} focused={focused} />, tabBarBadge: emailBadge > 0 ? (emailBadge > 9 ? '9+' : emailBadge) : undefined }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} /> }} />
    </Tabs>
    {/* Floating "update ready" pill above the tab bar — tapping swaps to the new version in place. */}
    {updateReady ? (
      <Pressable onPress={applyUpdate} className="flex-row items-center"
        style={{ position: 'absolute', alignSelf: 'center', bottom: 62 + insets.bottom + 14, height: 40, paddingHorizontal: 18, borderRadius: 999, gap: 8, backgroundColor: colors.ink, shadowColor: '#0b1220', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}>
        <RefreshCw size={15} color="#fff" strokeWidth={2.4} />
        <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '700' }}>Update ready — tap to restart</Text>
      </Pressable>
    ) : null}
    </View>
  );
}

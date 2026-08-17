import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, Switch, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, Ban, Eye, CheckCheck } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useAccessStore } from '../../src/store/accessStore';
import { useUiStore } from '../../src/store/uiStore';
import { refreshDirectoryUsers } from '../../src/store/directoryStore';

// Chat privacy — WhatsApp's Privacy screen: who can see when you were last online, whether you send
// read receipts, and the list of people you have blocked.

export default function ChatPrivacy() {
  const router = useRouter();
  const privacy = useMessagingStore((s) => s.privacy);
  const users = useAccessStore((s) => s.users);
  const showToast = useUiStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    void useMessagingStore.getState().loadPrivacy();
    void refreshDirectoryUsers(); // throttled — names stay current without an app restart
  }, []));

  const set = async (patch: { readReceipts?: boolean; lastSeen?: 'everyone' | 'nobody' }): Promise<void> => {
    setBusy(true);
    try { await useMessagingStore.getState().updatePrivacy(patch); } finally { setBusy(false); }
  };

  const unblock = (userId: string, name: string): void => {
    Alert.alert(`Unblock ${name}?`, 'They will be able to message you again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unblock', onPress: () => void useMessagingStore.getState().setBlocked(userId, false).then(() => showToast(`${name} unblocked`)) },
    ]);
  };

  const blocked = privacy.blocked.map((id) => ({ id, user: users.find((u) => u.id === id) }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      <View className="flex-row items-center gap-2 px-2" style={{ backgroundColor: colors.card, height: 56, borderBottomColor: colors.coolDivider, borderBottomWidth: StyleSheet.hairlineWidth }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' }}>Chat privacy</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="mx-5 mt-5 mb-1.5" style={{ color: colors.coolText, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>WHO CAN SEE</Text>
        <View className="mx-4" style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>
          <View className="flex-row items-center gap-3 px-4 py-3.5">
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: `${colors.blue}1A`, alignItems: 'center', justifyContent: 'center' }}>
              <Eye size={19} color={colors.blue} />
            </View>
            <View className="flex-1">
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>Last seen</Text>
              <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 1 }}>
                {privacy.lastSeen === 'everyone' ? 'Anyone you chat with can see it' : 'Hidden — you also stop seeing theirs'}
              </Text>
            </View>
            <Switch
              value={privacy.lastSeen === 'everyone'} disabled={busy}
              onValueChange={(on) => void set({ lastSeen: on ? 'everyone' : 'nobody' })}
              trackColor={{ true: colors.primary, false: colors.coolDivider }} thumbColor="#fff"
            />
          </View>
          <View className="flex-row items-center gap-3 px-4 py-3.5" style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.coolDivider }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: `${colors.primary}1A`, alignItems: 'center', justifyContent: 'center' }}>
              <CheckCheck size={19} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>Read receipts</Text>
              <Text style={{ color: colors.coolText, fontSize: 12.5, marginTop: 1 }}>
                {privacy.readReceipts ? 'Senders see when you have read' : "Off — you also won't see when others read yours"}
              </Text>
            </View>
            <Switch
              value={privacy.readReceipts} disabled={busy}
              onValueChange={(on) => void set({ readReceipts: on })}
              trackColor={{ true: colors.primary, false: colors.coolDivider }} thumbColor="#fff"
            />
          </View>
        </View>
        {/* Said plainly, because it surprises people: both switches cut both ways, and neither one
            applies inside groups. */}
        <Text className="mx-5 mt-2" style={{ color: colors.coolText3, fontSize: 11.5, lineHeight: 16 }}>
          Turning either off hides the same information from you as well. Read receipts in groups are always sent.
        </Text>

        <Text className="mx-5 mt-6 mb-1.5" style={{ color: colors.coolText, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>BLOCKED</Text>
        <View className="mx-4" style={{ borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider, overflow: 'hidden' }}>
          {blocked.length === 0 ? (
            <View className="items-center" style={{ paddingVertical: 26, paddingHorizontal: 24 }}>
              <Ban size={26} color={colors.coolText3} />
              <Text style={{ color: colors.coolText, fontSize: 13.5, marginTop: 8, textAlign: 'center' }}>
                No one is blocked. Block someone from their chat menu.
              </Text>
            </View>
          ) : blocked.map((b, i) => (
            <Pressable key={b.id} onPress={() => unblock(b.id, b.user?.name ?? 'this contact')} android_ripple={{ color: colors.coolMuted }}
              className="flex-row items-center gap-3 px-4 py-3" style={{ borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.coolDivider }}>
              <Avatar initials={b.user?.initials ?? '?'} color={b.user?.color ?? colors.coolText3} size={38} uri={b.user?.avatar} />
              <View className="flex-1">
                <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{b.user?.name ?? 'Unknown contact'}</Text>
                {b.user?.position || b.user?.roleName ? (
                  <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12.5 }}>{b.user?.position ?? b.user?.roleName}</Text>
                ) : null}
              </View>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>Unblock</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

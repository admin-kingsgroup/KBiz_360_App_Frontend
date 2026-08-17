import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check, Archive as ArchiveIcon } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { useMessagingStore } from '../../src/store/messagingStore';
import { listReminders } from '../../src/api/reminders';
import { useRefreshOnFocus } from '../../src/hooks/useRefreshOnFocus';
import type { ReminderRecord } from '../../src/data/reminders';

// Reminder archive — approved reminders the user is part of, from the Mongo reminders API.
// Flat white rows with hairline dividers on the cool canvas (matches the redesigned Reminders tab).
export default function ReminderArchive() {
  const router = useRouter();
  const meId = useMessagingStore((s) => s.myUserId) ?? '';
  const [archived, setArchived] = useState<ReminderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Reload on every focus (not just mount) so newly approved reminders appear on return.
  useRefreshOnFocus(() => {
    let active = true;
    listReminders('archive')
      .then((r) => { if (active) setArchived(r.visible); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top', 'bottom']}>
      {/* White header bar (standard chrome) */}
      <View className="flex-row items-center gap-2 px-2" style={{ backgroundColor: colors.card, height: 60, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Archive</Text>
          <Text style={{ color: colors.coolText, fontSize: 12.5 }}>{archived.length} approved</Text>
        </View>
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}>
          {archived.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8" style={{ paddingVertical: 64 }}>
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <ArchiveIcon size={40} color={colors.primary} />
              </View>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 16 }}>Archive is empty</Text>
              <Text style={{ color: colors.coolText, fontSize: 13.5, marginTop: 5, textAlign: 'center' }}>Approved reminders appear here</Text>
            </View>
          ) : archived.map((r, i) => {
            const personal = r.forId === meId && r.byId === meId;
            return (
              <View key={r.id} style={{ backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 12 }}>
                {i > 0 ? <View style={{ position: 'absolute', top: 0, left: 16, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.coolDivider }} /> : null}
                <View className="flex-row items-start gap-3">
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}><Check size={13} color="#fff" strokeWidth={3} /></View>
                  <View className="flex-1">
                    <Text style={{ color: colors.coolText, fontSize: 15, fontWeight: '500', lineHeight: 21, textDecorationLine: 'line-through' }}>{r.text}</Text>
                    <View className="flex-row items-center gap-1.5" style={{ marginTop: 4, flexWrap: 'wrap' }}>
                      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: r.forColor || colors.ink, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{(r.forInitials || '').charAt(0)}</Text></View>
                      <Text style={{ color: colors.coolText3, fontSize: 12.5, fontWeight: '600' }}>{personal ? 'Personal' : `${r.forName} → ${r.byName}`}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

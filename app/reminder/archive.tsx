import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check, Archive as ArchiveIcon } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { useMessagingStore } from '../../src/store/messagingStore';
import { listReminders } from '../../src/api/reminders';
import type { ReminderRecord } from '../../src/data/reminders';

// Reminder archive — approved reminders the user is part of, from the Mongo reminders API.
export default function ReminderArchive() {
  const router = useRouter();
  const meId = useMessagingStore((s) => s.myUserId) ?? '';
  const [archived, setArchived] = useState<ReminderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listReminders('archive')
      .then((r) => { if (active) setArchived(r.visible); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View className="flex-1"><Text style={{ color: colors.ink, fontSize: 14, fontWeight: '800' }}>Archive</Text><Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{archived.length} approved</Text></View>
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.ink} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {archived.length === 0 ? (
            <View className="items-center px-6" style={{ paddingVertical: 80 }}>
              <ArchiveIcon size={36} color={colors.textMuted2} />
              <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '700', marginTop: 12 }}>Archive is empty</Text>
              <Text style={{ color: colors.textMuted2, fontSize: 11.5, marginTop: 4, textAlign: 'center' }}>Approved reminders appear here</Text>
            </View>
          ) : archived.map((r) => {
            const personal = r.forId === meId && r.byId === meId;
            return (
              <View key={r.id} style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
                <View className="flex-row items-start gap-2.5">
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}><Check size={10} color="#fff" strokeWidth={3} /></View>
                  <View className="flex-1">
                    <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'line-through' }}>{r.text}</Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5" style={{ flexWrap: 'wrap' }}>
                      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: r.forColor || colors.ink, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>{(r.forInitials || '').charAt(0)}</Text></View>
                      <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '600' }}>{personal ? 'Personal' : `${r.forName} → ${r.byName}`}</Text>
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

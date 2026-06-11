import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, MessageSquare, Users, Image as ImageIcon, FileText, Mic, Video, Activity } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { getChatAnalytics, type ChatAnalytics } from '../../src/api/chat';

const Stat = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
  <View style={{ flex: 1, backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 16, padding: 14 }}>
    <Text style={{ color, fontSize: 22, fontWeight: '800' }}>{value}</Text>
    <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '700', marginTop: 2 }}>{label}</Text>
  </View>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={{ marginTop: 18 }}>
    <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 14, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
    {children}
  </View>
);

const MEDIA_META: { key: string; label: string; Icon: typeof ImageIcon; color: string }[] = [
  { key: 'image', label: 'Images', Icon: ImageIcon, color: colors.blue },
  { key: 'video', label: 'Videos', Icon: Video, color: colors.purple },
  { key: 'document', label: 'Docs', Icon: FileText, color: colors.orange },
  { key: 'voice', label: 'Voice', Icon: Mic, color: colors.teal },
];

export default function ChatAnalyticsScreen() {
  const router = useRouter();
  const [data, setData] = useState<ChatAnalytics | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getChatAnalytics().then(setData).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  const maxDay = data ? Math.max(1, ...data.messagesPerDay.map((d) => d.count)) : 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ backgroundColor: '#fff', borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View className="flex-row items-center gap-2">
          <Activity size={16} color={colors.ink} />
          <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600' }}>Chat Analytics</Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.ink} /></View>
      ) : error || !data ? (
        <View className="flex-1 items-center justify-center px-8"><Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>Could not load analytics. Super-Admin access is required.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View className="flex-row gap-2.5">
            <Stat label="Messages (total)" value={data.messagesSent.toLocaleString()} color={colors.ink} />
            <Stat label="Today" value={data.messagesToday.toLocaleString()} color={colors.blue} />
          </View>
          <View className="flex-row gap-2.5" style={{ marginTop: 10 }}>
            <Stat label="Active today (DAU)" value={data.dau} color={colors.teal} />
            <Stat label="Active 30d (MAU)" value={data.mau} color={colors.purple} />
          </View>
          <View className="flex-row gap-2.5" style={{ marginTop: 10 }}>
            <Stat label="Direct chats" value={data.conversations.direct} color={colors.ink} />
            <Stat label="Groups" value={data.conversations.group} color={colors.orange} />
          </View>

          <Section title="Messages · last 7 days">
            <View className="flex-row items-end gap-1.5" style={{ height: 90, backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 16, padding: 12 }}>
              {data.messagesPerDay.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>No activity yet</Text> : data.messagesPerDay.map((d) => (
                <View key={d.date} className="flex-1 items-center justify-end" style={{ height: '100%' }}>
                  <Text style={{ color: colors.textMuted2, fontSize: 8, fontWeight: '700' }}>{d.count}</Text>
                  <View style={{ width: '70%', height: `${(d.count / maxDay) * 80}%`, backgroundColor: colors.ink, borderRadius: 4, marginTop: 2, minHeight: 2 }} />
                  <Text style={{ color: colors.textMuted2, fontSize: 7.5, marginTop: 2 }}>{d.date.slice(5)}</Text>
                </View>
              ))}
            </View>
          </Section>

          <Section title="Media usage">
            <View className="flex-row gap-2.5">
              {MEDIA_META.map((m) => (
                <View key={m.key} style={{ flex: 1, backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 14, padding: 10, alignItems: 'center' }}>
                  <m.Icon size={18} color={m.color} />
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 4 }}>{data.mediaUsage[m.key] ?? 0}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 9.5, fontWeight: '600' }}>{m.label}</Text>
                </View>
              ))}
            </View>
          </Section>

          <Section title="Most active users">
            <View style={{ backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }}>
              {data.mostActiveUsers.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 11, padding: 14 }}>No data yet</Text> : data.mostActiveUsers.map((u, i) => (
                <View key={u.userId} className="flex-row items-center gap-3 px-3 py-2.5" style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.cardEdge }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{i + 1}</Text></View>
                  <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 12.5, fontWeight: '600', flex: 1 }}>{u.name}</Text>
                  <View className="flex-row items-center gap-1"><MessageSquare size={12} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: '700' }}>{u.count}</Text></View>
                </View>
              ))}
            </View>
          </Section>

          <Section title="Most active groups">
            <View style={{ backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }}>
              {data.mostActiveGroups.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 11, padding: 14 }}>No groups yet</Text> : data.mostActiveGroups.map((g, i) => (
                <View key={g.conversationId} className="flex-row items-center gap-3 px-3 py-2.5" style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.cardEdge }}>
                  <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' }}><Users size={12} color="#fff" /></View>
                  <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 12.5, fontWeight: '600', flex: 1 }}>{g.name}</Text>
                  <View className="flex-row items-center gap-1"><MessageSquare size={12} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: '700' }}>{g.count}</Text></View>
                </View>
              ))}
            </View>
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

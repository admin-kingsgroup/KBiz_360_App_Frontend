import { useEffect, useRef, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, MoreVertical } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { pulseChannels } from '../../src/data/pulse';
import { businesses } from '../../src/data/businesses';
import { reminderPeople } from '../../src/data/reminders';
import { usePulseStore } from '../../src/store/pulseStore';
import { useUiStore } from '../../src/store/uiStore';
import { timeAgo } from '../../src/utils/time';

// Alert detail — port of source PulseChannelScreen. Opening the channel marks ALL its events read
// (Home's unread badge clears, like a chat thread); the events that were unread on entry keep their
// "new" highlight for this visit so the user can still see what just arrived.
export default function AlertDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const channel = pulseChannels.find((c) => c.id === id);
  const events = usePulseStore((s) => s.events).filter((e) => e.channelId === id).sort((a, b) => b.time - a.time);
  const markEventRead = usePulseStore((s) => s.markEventRead);
  const markChannelRead = usePulseStore((s) => s.markChannelRead);
  const showToast = useUiStore((s) => s.showToast);

  // Mark read once the channel's events are actually loaded (a deep link can land here before the
  // first /api/alerts fetch resolves); later events arriving mid-visit stay unread until tapped.
  const newOnEntry = useRef<Set<string>>(new Set());
  const markedOnEntry = useRef(false);
  useEffect(() => {
    if (markedOnEntry.current || !channel || events.length === 0) return;
    markedOnEntry.current = true;
    const unread = events.filter((e) => !e.read);
    if (unread.length === 0) return;
    newOnEntry.current = new Set(unread.map((e) => e.id));
    markChannelRead(channel.id);
  }, [channel, events, markChannelRead]);
  const isNew = (e: { id: string; read: boolean }): boolean => !e.read || newOnEntry.current.has(e.id);

  if (!channel) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <Header title="Alert" onBack={() => router.back()} />
        <View className="items-center" style={{ paddingVertical: 64 }}><Text style={{ color: colors.textMuted }}>Channel not found</Text></View>
      </SafeAreaView>
    );
  }

  const biz = channel.bizId ? businesses.find((b) => b.id === channel.bizId) : null;
  const memberObjs = channel.members.map((mid) => reminderPeople.find((p) => p.id === mid) || { id: mid, name: mid, initials: mid.slice(0, 2).toUpperCase(), color: colors.textMuted2 });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top', 'bottom']}>
      <Header title={channel.name} subtitle={channel.members.length ? `${biz?.name || 'System'} · ${channel.members.length} member${channel.members.length === 1 ? '' : 's'}` : `${biz?.name || 'System'}${channel.branch ? ` · ${channel.branch} branch` : ''}`}
        onBack={() => router.back()} right={<Pressable onPress={() => { markChannelRead(channel.id); showToast('Marked all read'); }} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><MoreVertical size={18} color={colors.ink} /></Pressable>} />

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Channel banner */}
        <View style={{ margin: 14, padding: 16, borderRadius: 16, backgroundColor: channel.color + '18' }}>
          <View className="flex-row items-center gap-3">
            <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: channel.color + '30', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 26 }}>{channel.icon}</Text></View>
            <View className="flex-1">
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '800', letterSpacing: -0.4 }}>{channel.name}</Text>
              <Text style={{ color: colors.ink, opacity: 0.7, fontSize: 11, marginTop: 2 }}>{channel.description}</Text>
            </View>
          </View>
          {memberObjs.length > 0 ? <View className="flex-row items-center gap-1.5 mt-3" style={{ flexWrap: 'wrap' }}>
            <Text style={{ color: channel.color, fontSize: 9.5, fontWeight: '800', letterSpacing: 1 }}>VISIBLE TO</Text>
            {memberObjs.slice(0, 6).map((m) => (
              <View key={m.id} className="flex-row items-center gap-1" style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.6)' }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: m.color, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>{m.initials.charAt(0)}</Text></View>
                <Text style={{ color: colors.ink, fontSize: 10, fontWeight: '700' }}>{m.name.split(' ')[0]}</Text>
              </View>
            ))}
          </View> : null}
        </View>

        <Text style={{ color: colors.textMuted2, fontSize: 10, fontWeight: '800', letterSpacing: 1.3, paddingHorizontal: 16, paddingBottom: 8 }}>{events.length} {events.length === 1 ? 'EVENT' : 'EVENTS'}</Text>

        {events.length === 0 ? (
          <View className="items-center px-6" style={{ paddingVertical: 48 }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🛌</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700' }}>No events yet</Text>
          </View>
        ) : events.map((e) => (
          <Pressable key={e.id} onPress={() => { if (!e.read) markEventRead(e.id); }} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: colors.cardEdge, borderBottomWidth: 1, backgroundColor: isNew(e) ? '#FAFBFF' : 'transparent' }}>
            {isNew(e) ? <View style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: channel.color }} /> : null}
            <View className="flex-row items-baseline justify-between gap-2">
              <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', flex: 1 }}>{e.source}</Text>
              <Text style={{ color: colors.textMuted2, fontSize: 10, fontWeight: '700' }}>{timeAgo(e.time)}</Text>
            </View>
            <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '800', marginTop: 2 }}>{e.title}</Text>
            {e.body ? <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{e.body}</Text> : null}
            {e.context ? <View style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#F4F2EC' }}><Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>{e.context}</Text></View> : null}
            {e.actions && e.actions.length > 0 ? (
              <View className="flex-row gap-1.5 mt-2" style={{ flexWrap: 'wrap' }}>
                {e.actions.map((a, i) => (
                  <Pressable key={i} onPress={() => { markEventRead(e.id); showToast(a.label); }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: a.primary ? colors.ink : '#F4F2EC' }}>
                    <Text style={{ color: a.primary ? '#fff' : colors.ink, fontSize: 10.5, fontWeight: '800' }}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View className="flex-row items-center gap-2 px-2 py-2" style={{ backgroundColor: '#fff', borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
      <Pressable onPress={onBack} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
      <View className="flex-1"><Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: '800' }}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5 }}>{subtitle}</Text> : null}</View>
      {right}
    </View>
  );
}

import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react-native';
import { Avatar } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { durationLabel } from '../../src/logic/call';
import { callManager } from '../../src/services/rtc/CallManager';
import { getCall, type CallLogDTO } from '../../src/api/calls';

const PALETTE = [colors.purple, colors.blue, colors.teal, colors.orange, colors.coral, colors.ink];
const colorFor = (seed: string): string => PALETTE[[...seed].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
const fullWhen = (ts: number): string => new Date(ts).toLocaleString();

// Call details — a single call_log entry fetched from the backend (participant-only on the server).
export default function CallDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [call, setCall] = useState<CallLogDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getCall(id ?? '')
      .then((c) => { if (active) setCall(c); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Could not load call'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const missed = call?.status === 'missed';
  const DirIcon = missed ? PhoneMissed : call?.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      <View className="flex-row items-center px-2" style={{ minHeight: 60, paddingVertical: 8, backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Call details</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.primary} /></View>
      ) : error || !call ? (
        <View className="flex-1 items-center justify-center" style={{ padding: 24 }}>
          <Text style={{ color: colors.coolText, fontSize: 14 }}>{error ?? 'Call not found'}</Text>
        </View>
      ) : (
        <View style={{ padding: 20 }}>
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <Avatar initials={initialsOf(call.peer.name)} color={colorFor(call.peer.id)} size={88} />
            <Text style={{ color: colors.ink, fontSize: 21, fontWeight: '700', marginTop: 14 }}>{call.peer.name}</Text>
            <View className="flex-row items-center" style={{ gap: 6, marginTop: 6 }}>
              <DirIcon size={15} color={missed ? colors.danger : colors.primary} />
              <Text style={{ color: missed ? colors.danger : colors.coolText, fontSize: 14, fontWeight: '600' }}>
                {missed ? 'Missed' : call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} {call.type === 'video' ? 'video' : 'voice'} call
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider }}>
            <Row label="Status" value={call.status[0].toUpperCase() + call.status.slice(1)} />
            <Row label="Started" value={fullWhen(call.startedAt)} />
            {call.durationSec > 0 ? <Row label="Duration" value={durationLabel(call.durationSec)} /> : null}
            <Row label="Ended" value={fullWhen(call.endedAt)} last />
          </View>

          <Pressable onPress={() => callManager.startOutgoing({ id: call.peer.id, name: call.peer.name }, call.type)}
            className="flex-row items-center justify-center" style={{ gap: 8, marginTop: 20, height: 52, borderRadius: 999, backgroundColor: colors.primary }}>
            <Phone size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Call back</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomColor: colors.coolDivider, borderBottomWidth: last ? 0 : 1 }}>
      <Text style={{ color: colors.coolText, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

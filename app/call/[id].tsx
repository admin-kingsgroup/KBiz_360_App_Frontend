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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
      <View className="flex-row items-center px-2 py-2" style={{ backgroundColor: colors.card, borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>Call details</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.ink} /></View>
      ) : error || !call ? (
        <View className="flex-1 items-center justify-center" style={{ padding: 24 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{error ?? 'Call not found'}</Text>
        </View>
      ) : (
        <View style={{ padding: 20 }}>
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <Avatar initials={initialsOf(call.peer.name)} color={colorFor(call.peer.id)} size={84} />
            <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '800', marginTop: 14 }}>{call.peer.name}</Text>
            <View className="flex-row items-center" style={{ gap: 6, marginTop: 6 }}>
              <DirIcon size={14} color={missed ? colors.danger : colors.success} />
              <Text style={{ color: missed ? colors.danger : colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                {missed ? 'Missed' : call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} {call.type === 'video' ? 'video' : 'voice'} call
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
            <Row label="Status" value={call.status[0].toUpperCase() + call.status.slice(1)} />
            <Row label="Started" value={fullWhen(call.startedAt)} />
            {call.durationSec > 0 ? <Row label="Duration" value={durationLabel(call.durationSec)} /> : null}
            <Row label="Ended" value={fullWhen(call.endedAt)} last />
          </View>

          <Pressable onPress={() => callManager.startOutgoing({ id: call.peer.id, name: call.peer.name }, call.type)}
            className="flex-row items-center justify-center" style={{ gap: 8, marginTop: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.ink }}>
            <Phone size={17} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>Call back</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomColor: colors.cardEdge, borderBottomWidth: last ? 0 : 1 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

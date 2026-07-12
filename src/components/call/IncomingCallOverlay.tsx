import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { Phone, PhoneOff } from 'lucide-react-native';
import { Avatar } from '../ui';
import { colors } from '../../theme';
import { useCallSessionStore } from '../../store/callSessionStore';
import { callManager } from '../../services/rtc/CallManager';
import { isCallKitActive } from '../../services/iosCallKeep';

const PALETTE = [colors.purple, colors.blue, colors.teal, colors.orange, colors.coral, colors.ink];
const colorFor = (seed: string): string => PALETTE[[...seed].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

// Full-screen incoming-call UI, rendered globally in app/_layout so it appears over ANY screen the
// moment a call:incoming arrives. Reads the live store; no navigation needed.
export function IncomingCallOverlay() {
  const incoming = useCallSessionStore((s) => s.incoming);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!incoming) return null;
  // On iOS the native CallKit screen is the incoming-call UI — don't draw the in-app overlay on top.
  if (isCallKitActive()) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.ink, zIndex: 1000, elevation: 1000 }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="ic1" cx="50%" cy="24%" r="65%">
            <Stop offset="0" stopColor={colors.purple} stopOpacity="0.30" />
            <Stop offset="1" stopColor={colors.purple} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill={colors.ink} />
        <Rect width={width} height={height} fill="url(#ic1)" />
      </Svg>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingTop: insets.top + 64, paddingBottom: insets.bottom + 48 }}>
        <View style={{ alignItems: 'center' }}>
          <Avatar initials={initialsOf(incoming.caller.name)} color={colorFor(incoming.caller.id)} size={128} />
          <Text style={{ color: colors.paper, fontSize: 26, fontWeight: '800', letterSpacing: -0.4, marginTop: 24 }}>{incoming.caller.name}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 15, fontWeight: '600', marginTop: 8 }}>
            Incoming {incoming.type === 'video' ? 'video' : 'voice'} call…
          </Text>
        </View>

        <View className="flex-row" style={{ gap: 80 }}>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => void callManager.reject()} style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
              <PhoneOff size={28} color="#fff" />
            </Pressable>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' }}>Decline</Text>
          </View>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => void callManager.acceptIncoming()} style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
              <Phone size={28} color="#fff" />
            </Pressable>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' }}>Accept</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

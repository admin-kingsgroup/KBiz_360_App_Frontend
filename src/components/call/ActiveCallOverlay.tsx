import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { Mic, MicOff, Volume2, PhoneOff } from 'lucide-react-native';
import { Avatar } from '../ui';
import { colors } from '../../theme';
import { durationLabel } from '../../logic/call';
import { useCallSessionStore } from '../../store/callSessionStore';
import { callManager } from '../../services/rtc/CallManager';

const PALETTE = [colors.purple, colors.blue, colors.teal, colors.orange, colors.coral, colors.ink];
const colorFor = (seed: string): string => PALETTE[[...seed].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

// Full-screen active-call UI, rendered globally in app/_layout so it stays mounted (and the call
// keeps running) across navigation. Reads the live store; all actions go through CallManager.
export function ActiveCallOverlay() {
  const active = useCallSessionStore((s) => s.active);
  const muted = useCallSessionStore((s) => s.muted);
  const speaker = useCallSessionStore((s) => s.speaker);
  const quality = useCallSessionStore((s) => s.quality);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [elapsed, setElapsed] = useState(0);
  const connectedAt = active?.connectedAt ?? null;
  useEffect(() => {
    if (!connectedAt) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [connectedAt]);

  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.out(Easing.ease) }), -1, false);
  }, [pulse]);
  const ripple = useAnimatedStyle(() => ({
    opacity: active?.phase === 'active' ? 0 : 0.4 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.7 }],
  }));

  if (!active) return null;

  const status =
    active.phase === 'active' ? durationLabel(elapsed)
      : active.phase === 'connecting' ? 'Connecting…'
        : active.phase === 'reconnecting' ? 'Reconnecting…'
          : active.phase === 'ended' ? (active.endReason ?? 'Call ended')
            : active.direction === 'outgoing' ? 'Calling…' : 'Ringing…';

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.ink, zIndex: 900, elevation: 900 }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="ac1" cx="50%" cy="22%" r="65%">
            <Stop offset="0" stopColor={colors.purple} stopOpacity="0.30" />
            <Stop offset="1" stopColor={colors.purple} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="ac2" cx="50%" cy="100%" r="70%">
            <Stop offset="0" stopColor={colors.blue} stopOpacity="0.22" />
            <Stop offset="1" stopColor={colors.blue} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill={colors.ink} />
        <Rect width={width} height={height} fill="url(#ac1)" />
        <Rect width={width} height={height} fill="url(#ac2)" />
      </Svg>

      <View style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}>
        <View style={{ alignItems: 'center', paddingTop: 6 }}>
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontWeight: '700' }}>
            {active.type === 'video' ? 'Video call' : 'Voice call'}{quality === 'poor' ? ' · weak signal' : ''}
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={[{ position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: colors.purple }, ripple]} />
            <Avatar initials={initialsOf(active.peer.name)} color={colorFor(active.peer.id)} size={132} />
          </View>
          <Text style={{ color: colors.paper, fontSize: 27, fontWeight: '800', letterSpacing: -0.4, marginTop: 24 }}>{active.peer.name}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 15, fontWeight: '600', marginTop: 8 }}>{status}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 14 }}>🔒 End-to-end encrypted</Text>
        </View>

        <View style={{ paddingHorizontal: 40 }}>
          <View className="flex-row items-center justify-center" style={{ gap: 36, marginBottom: 26 }}>
            <Ctrl label={muted ? 'Unmute' : 'Mute'} active={muted} onPress={() => callManager.toggleMute()} icon={muted ? <MicOff size={24} color={colors.ink} /> : <Mic size={24} color="#fff" />} />
            <Ctrl label="Speaker" active={speaker} onPress={() => callManager.toggleSpeaker()} icon={<Volume2 size={24} color={speaker ? colors.ink : '#fff'} />} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <Pressable onPress={() => void callManager.end()} style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
              <PhoneOff size={28} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function Ctrl({ icon, label, onPress, active }: { icon: ReactNode; label: string; onPress: () => void; active?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 7 }}>
      <Pressable onPress={onPress} style={{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? '#fff' : 'rgba(255,255,255,0.14)' }}>
        {icon}
      </Pressable>
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

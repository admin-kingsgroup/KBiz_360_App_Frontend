import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Play, Pause } from 'lucide-react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors } from '../../theme';

const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(Math.max(0, s) % 60).toString().padStart(2, '0')}`;

// A single voice-note bubble: play/pause + progress track + remaining time. Each instance owns
// its own player (one per message), so threads with a few notes are fine.
export function VoiceMessage({ uri, durationSec, outgoing }: { uri: string; durationSec: number; outgoing: boolean }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  const fg = outgoing ? '#fff' : colors.ink;
  const track = outgoing ? 'rgba(255,255,255,0.3)' : colors.cardEdge;

  // Reset to the start once playback completes so it can be replayed.
  useEffect(() => {
    if (status.didJustFinish) { player.seekTo(0); player.pause(); }
  }, [status.didJustFinish, player]);

  const total = status.duration && status.duration > 0 ? status.duration : durationSec;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;
  const remaining = status.currentTime > 0 ? Math.max(0, total - status.currentTime) : total;
  const toggle = () => { if (status.playing) player.pause(); else player.play(); };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 168 }}>
      <Pressable onPress={toggle} hitSlop={8}>
        {status.playing ? <Pause size={20} color={fg} /> : <Play size={20} color={fg} />}
      </Pressable>
      <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: track }}>
        <View style={{ width: `${progress * 100}%`, height: 3, borderRadius: 2, backgroundColor: fg }} />
      </View>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '700', minWidth: 32, textAlign: 'right' }}>{fmt(remaining)}</Text>
    </View>
  );
}

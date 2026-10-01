import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, G, Circle } from 'react-native-svg';
import { colors } from '../../theme';
import type { ChatTheme } from '../../theme/chatThemes';

// Blade geometry straight from scripts/gen-icons.js, which generates the launcher icons:
// 210x300 blades offset ox 70 / oy 150 from centre, six at 60 degrees, hub r95. Colours run
// clockwise from the up-right blade. Corners are square here to match the supplied artwork —
// gen-icons rounds them at rx 46 for the app icon, the original drawing does not.
const BLADE = { w: 210, h: 300, ox: 70, oy: 150 };
const C = 512;
const BLADES = [colors.cream, colors.blue, colors.teal, colors.orange, colors.coral, colors.purple];

function Pinwheel({ size, hub }: { size: number; hub: string }) {
  const x = C + BLADE.ox - BLADE.w / 2;
  const y = C - BLADE.oy - BLADE.h / 2;
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      {BLADES.map((c, i) => (
        <G key={i} rotation={i * 60} origin={`${C}, ${C}`}>
          <Rect x={x} y={y} width={BLADE.w} height={BLADE.h} fill={c} />
        </G>
      ))}
      <Circle cx={C} cy={C} r={95} fill={hub} />
    </Svg>
  );
}

// The brand lockup behind a conversation: one centred mark, the way the splash draws it, rather
// than a repeating tile. Drawn with the real brand palette — nothing substituted — so brand cream
// stays faint on the pale canvases (it is only 3.2 ΔE from them, which no amount of opacity fixes).
// Dark canvases carry more opacity because colour loses presence against near-black.
//
// Purely decorative: pointerEvents none, and no accessibility label — a screen reader announcing
// the brand name between every message would be noise.
export function ChatWatermark({ theme, size = 128 }: { theme: ChatTheme; size?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap, { opacity: theme.dark ? 0.3 : 0.22 }]}>
      <Pinwheel size={size} hub={theme.watermarkHub} />
      <Text style={[styles.wordmark, { color: theme.watermarkHub, fontSize: size * 0.3 }]}>KBiz360</Text>
      <Text style={[styles.tagline, { color: theme.watermarkHub, fontSize: size * 0.088 }]}>THE BUSINESS ENGINE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  wordmark: { fontWeight: '800', letterSpacing: -0.5 },
  tagline: { fontWeight: '600', letterSpacing: 3.4, marginTop: -4 },
});

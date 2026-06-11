import Svg, { Rect, G, Circle } from 'react-native-svg';
import { colors } from '../../theme';

export interface KBLogoProps { size?: number; }

// Brand mark: a six-blade pinwheel in the KBiz 360 palette with a dark hub. Vector only, no
// business logic. Mirrors the launcher icon (see scripts/gen-icons.js). The hub uses `ink`, so it
// reads as a dark dot on light surfaces and blends into the dark login background.
const BLADES = [colors.cream, colors.blue, colors.teal, colors.orange, colors.coral, colors.purple];

export function KBLogo({ size = 22 }: KBLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      {BLADES.map((c, i) => (
        <G key={i} rotation={i * 60} origin="512, 512">
          <Rect x={477} y={212} width={210} height={300} rx={46} fill={c} />
        </G>
      ))}
      <Circle cx={512} cy={512} r={95} fill={colors.ink} />
    </Svg>
  );
}

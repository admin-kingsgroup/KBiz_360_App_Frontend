import { Pressable, Text } from 'react-native';
import { shadowSm } from '../../theme';
import { Badge } from './Badge';

export interface PillProps {
  label: string;
  color: string;        // active fill / accent (from data)
  active?: boolean;
  unread?: number;
  borderColor?: string;
  onPress?: () => void;
}

// Generic selectable chip (used by business pills, branch chips, etc.). Theme/data-driven.
export function Pill({ label, color, active = false, unread = 0, borderColor = '#EBE4D6', onPress }: PillProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-1.5 rounded-full px-3.5 py-2 border"
      style={[{ backgroundColor: active ? color : '#FFFFFF', borderColor: active ? color : borderColor }, active ? shadowSm : null]}
    >
      <Text style={{ color: active ? '#FFFFFF' : '#0C0E14', fontSize: 13, fontWeight: '800' }}>{label}</Text>
      {unread > 0 ? <Badge count={unread} color={active ? 'rgba(255,255,255,0.28)' : '#E3674E'} /> : null}
    </Pressable>
  );
}

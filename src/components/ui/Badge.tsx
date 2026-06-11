import { View, Text } from 'react-native';
import { colors } from '../../theme';

export interface BadgeProps {
  count?: number;       // numeric badge (e.g. unread); 99+ cap
  text?: string;        // text badge (e.g. role)
  color?: string;       // background
  textColor?: string;
}

// Small count/text pill. No business logic — caller decides what the number means.
export function Badge({ count, text, color = colors.coral, textColor = '#FFFFFF' }: BadgeProps) {
  const label = text ?? (count != null ? (count > 99 ? '99+' : String(count)) : '');
  if (!label) return null;
  return (
    <View className="items-center justify-center rounded-full px-1.5" style={{ minWidth: 18, height: 18, backgroundColor: color }}>
      <Text style={{ color: textColor, fontSize: 10, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

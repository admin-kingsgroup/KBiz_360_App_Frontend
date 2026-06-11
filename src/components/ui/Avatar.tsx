import { View, Text } from 'react-native';

export interface AvatarProps {
  initials: string;
  color: string;        // background color (from data, not hardcoded)
  size?: number;        // px diameter
  textColor?: string;
}

// Initials-in-a-circle. Pure presentational; caller supplies initials + color.
export function Avatar({ initials, color, size = 40, textColor = '#FFFFFF' }: AvatarProps) {
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: color }}
    >
      <Text style={{ color: textColor, fontSize: size * 0.4, fontWeight: '800' }}>{initials}</Text>
    </View>
  );
}

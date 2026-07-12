import { View, Text, Image } from 'react-native';

export interface AvatarProps {
  initials: string;
  color: string;        // background color (from data, not hardcoded)
  size?: number;        // px diameter
  textColor?: string;
  uri?: string | null;  // profile picture (absolute url); falls back to initials when absent
}

// Avatar: a profile picture when `uri` is set, otherwise initials-in-a-circle. Caller supplies a
// resolved (absolute) uri — see api/directory.toUser / convToItem which resolve via mediaUrl.
export function Avatar({ initials, color, size = 40, textColor = '#FFFFFF', uri }: AvatarProps) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
  }
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: color }}
    >
      <Text style={{ color: textColor, fontSize: size * 0.4, fontWeight: '800' }}>{initials}</Text>
    </View>
  );
}

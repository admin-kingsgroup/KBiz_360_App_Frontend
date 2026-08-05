import { View, Text, Image } from 'react-native';

export interface AvatarProps {
  initials: string;
  color: string;        // background color (from data, not hardcoded)
  size?: number;        // px diameter
  textColor?: string;
  uri?: string | null;  // profile picture (absolute url); falls back to initials when absent
  /** Status ring colour (WhatsApp's story ring) — bright for unseen updates, muted once watched. */
  ring?: string;
}

// Avatar: a profile picture when `uri` is set, otherwise initials-in-a-circle. Caller supplies a
// resolved (absolute) uri — see api/directory.toUser / convToItem which resolve via mediaUrl.
export function Avatar({ initials, color, size = 40, textColor = '#FFFFFF', uri, ring }: AvatarProps) {
  // With a ring the face shrinks inside a bordered circle of the requested size, so a caller gets the
  // footprint it asked for whether or not a status is being advertised.
  const inner = ring ? size - 7 : size;
  const face = uri
    ? <Image source={{ uri }} style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: color }} />
    : (
      <View
        className="items-center justify-center rounded-full"
        style={{ width: inner, height: inner, backgroundColor: color }}
      >
        <Text style={{ color: textColor, fontSize: inner * 0.4, fontWeight: '800' }}>{initials}</Text>
      </View>
    );

  if (!ring) return face;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2.5, borderColor: ring, alignItems: 'center', justifyContent: 'center' }}>
      {face}
    </View>
  );
}

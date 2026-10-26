import { View, Text, Image } from 'react-native';
import { colors } from '../../theme';
import { tileCodeFor, tintForCode } from '../../logic/chatTile';
import { branchLogoFor } from '../../logic/groupsStrip';
import { BrandMark } from '../ui/BrandMark';

export interface ChatTileProps {
  name: string;
  branchCode?: string | null;
  companyCode?: string | null;
  /** Resolved absolute url. A real photo always wins over the code. */
  image?: string | null;
  size?: number;
  /** Corner radius; defaults to a rounded square proportional to the size. */
  radius?: number;
  online?: boolean;
  /** Ground the presence dot is cut out of — the surface the tile sits on. */
  dotBorder?: string;
}

// The conversation's identity tile: a rounded square carrying the branch/business short code on a
// tint keyed to that code, per the approved design canvas (2026-09-28).
//
// This is a component rather than two call sites because it was two call sites: the Chats list drew
// the code tile while the chat header still drew a generic purple circle with one initial, so the
// same room looked like two different rooms depending on which screen you were on. Deriving it in
// one place is what stops that recurring — the rules themselves live in logic/chatTile.ts.
// KBiz360's desk (KGD) wears the KBiz logo instead of its code (owner, 2026-10-10).
export function ChatTile({
  name, branchCode, companyCode, image, size = 48, radius, online, dotBorder = colors.card,
}: ChatTileProps) {
  const code = tileCodeFor({ name, branchCode, companyCode });
  const tint = tintForCode(code);
  const logo = image ? null : branchLogoFor(code);
  const r = radius ?? Math.round(size * 0.29);
  const dot = Math.max(10, Math.round(size * 0.29));
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: logo ? 'transparent' : tint.bg, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
      {image
        ? <Image source={{ uri: image }} style={{ width: size, height: size, borderRadius: r }} />
        : logo ? <BrandMark logo={logo} size={size} radius={r} border={colors.cardEdge} /> : (
          <Text numberOfLines={1} style={{ color: tint.fg, fontWeight: '800', fontSize: Math.max(10, size * 0.25), letterSpacing: 0.2 }}>
            {code}
          </Text>
        )}
      {online ? (
        <View style={{ position: 'absolute', bottom: 0, right: 0, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: colors.accent, borderWidth: 2.5, borderColor: dotBorder }} />
      ) : null}
    </View>
  );
}

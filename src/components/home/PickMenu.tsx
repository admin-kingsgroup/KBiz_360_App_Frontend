import { useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { Check, ChevronDown, LayoutGrid } from 'lucide-react-native';
import { menuRowIn } from '../ui/AnchoredMenu';
import { tintForCode } from '../../logic/chatTile';
import { textStyles } from '../../theme/typography';
import type { ChatListPalette } from '../../theme';

// The Groups view's two pickers, business and branch, are built from these parts so they look and
// behave the same: a dropdown chip in the compact strip (the iPhone Duo, an iPhone SE) that opens an
// AnchoredMenu of PickRows. The branches were a scrolling row of chips beside the business dropdown
// until the owner asked for them to be a dropdown too (2026-11-17: "just like all business make drop
// down for branches also").

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * A dropdown chip: an icon, the current pick, a chevron. `dot` marks new messages outside the pick
 * (another business, another branch), so narrowing the list never hides them. 34 pt tall; hitSlop
 * makes the target 44. `showIcon` false drops the icon where two chips share a narrow row, so the
 * labels fit whole; past that, the label truncates.
 */
export function PickChip({ pal, Icon, label, a11y, dot, onPress, onLongPress, showIcon = true }: {
  pal: ChatListPalette; Icon: ComponentType<{ size?: number; color?: string }>;
  label: string; a11y: string; dot: boolean; showIcon?: boolean;
  onPress: (e: GestureResponderEvent) => void; onLongPress?: (e: GestureResponderEvent) => void;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} hitSlop={{ top: 5, bottom: 5 }} accessibilityRole="button" accessibilityLabel={a11y}
      style={{ flexShrink: 1, minWidth: 0, height: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 10, paddingRight: 8,
        borderRadius: 17, borderWidth: 1, borderColor: pal.line, backgroundColor: pal.bar }}>
      {showIcon ? <Icon size={14} color={pal.text} /> : null}
      <Text numberOfLines={1} style={{ flexShrink: 1, maxWidth: 140, color: pal.text, ...textStyles.footnote, fontWeight: '700' }}>{label}</Text>
      <ChevronDown size={14} color={pal.accent} />
      {dot ? (
        <View style={{ position: 'absolute', top: -1, right: -1, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: pal.bar, backgroundColor: pal.accent }} />
      ) : null}
    </Pressable>
  );
}

/** A PickRow's square: the code on its code-keyed tint (as the chat rows' tiles), or a grid for "All". */
export function PickTile({ pal, code, Icon = LayoutGrid }: {
  pal: ChatListPalette; code?: string; Icon?: ComponentType<{ size?: number; color?: string }>;
}) {
  const tint = code ? tintForCode(code) : null;
  return (
    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: tint ? tint.bg : pal.field, alignItems: 'center', justifyContent: 'center' }}>
      {tint && code
        // A four-letter code (MHUB, HNBO) is wider than the tile at this size: it shrinks to fit
        // rather than truncate to "MH…".
        ? <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ paddingHorizontal: 3, color: tint.fg, ...textStyles.caption1, fontWeight: '700' }}>{code.slice(0, 4)}</Text>
        : <Icon size={17} color={pal.text} />}
    </View>
  );
}

/**
 * One choice in a picker menu: its tile, a name with a line of counts under it, how many of its
 * groups have new messages, and a check on the current pick. 56 pt tall. Darkens under the finger
 * (a plain style: this app's Pressable drops style functions) and eases in after the row above it.
 */
export function PickRow({ pal, index, animate, on, tile, title, sub, unread, a11y, onPress }: {
  pal: ChatListPalette; index: number; animate: boolean; on: boolean;
  tile: ReactNode; title: string; sub: string; unread: number; a11y: string; onPress: () => void;
}) {
  const reduce = useReducedMotion();
  const [down, setDown] = useState(false);
  return (
    <Animated.View entering={animate ? menuRowIn(index, reduce) : undefined}>
      <Pressable onPress={onPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)}
        accessibilityRole="menuitem" accessibilityState={{ selected: on }} accessibilityLabel={a11y}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 6, marginHorizontal: 6, marginBottom: 2, borderRadius: 12,
          backgroundColor: down ? pal.line : on ? pal.field : 'transparent' }}>
        {tile}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: pal.text, ...textStyles.body, fontWeight: on ? '600' : '500' }}>{title}</Text>
          <Text numberOfLines={1} style={{ color: pal.mute, ...textStyles.footnote }}>{sub}</Text>
        </View>
        {unread > 0 ? (
          <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: pal.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: pal.onAccent, ...textStyles.caption1, fontWeight: '600' }}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
        <View style={{ width: 22, alignItems: 'center' }}>{on ? <Check size={18} color={pal.accent} strokeWidth={2.6} /> : null}</View>
      </Pressable>
    </Animated.View>
  );
}

import { useEffect, useState, type ComponentType, type ReactNode, type RefObject } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { textStyles } from '../../theme/typography';
import Animated, { Easing, Keyframe, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Modal } from './Modal';
import { useSideInsets } from '../layout/SideSafeArea';

export interface AnchorRect { x: number; y: number; width: number; height: number }

/** Anything rendered natively that can say where it is — a View or Pressable instance. */
export interface Measurable { measureInWindow(cb: (x: number, y: number, width: number, height: number) => void): void }

/** Where a view sits in the window — the anchor a menu opens from. */
export function measureAnchor(ref: RefObject<Measurable | null>): Promise<AnchorRect | null> {
  return new Promise((resolve) => {
    const node = ref.current;
    if (!node) { resolve(null); return; }
    node.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
}

/**
 * The anchor for a menu opened by a press: the pressed control's frame. With `atFinger` (a long-pressed
 * list row, as wide as the list) the menu lines up with the finger instead of the row's left edge,
 * just below the row — or above it near the bottom of the screen.
 */
export function anchorOfPress(e: GestureResponderEvent, opts: { atFinger?: boolean } = {}): Promise<AnchorRect> {
  const { pageX, pageY } = e.nativeEvent;
  const target = e.currentTarget as unknown as Partial<Measurable> | null;
  const point: AnchorRect = { x: pageX - 1, y: pageY - 1, width: 2, height: 2 };
  return new Promise((resolve) => {
    if (!target || typeof target.measureInWindow !== 'function') { resolve(point); return; }
    target.measureInWindow((x, y, width, height) => {
      if (!(width > 0 && height > 0)) { resolve(point); return; }
      resolve(opts.atFinger ? { x: Math.max(x, pageX - 60), y, width: 120, height } : { x, y, width, height });
    });
  });
}

const GAP = 6;     // between the trigger and the menu
const MARGIN = 12; // the menu never comes closer than this to the window's edges

/**
 * A menu that grows out of the control that opened it (iOS pull-down style) — for pickers that
 * used to be bottom sheets. No dimmed backdrop: the screen behind stays as it is, and a tap
 * anywhere outside the menu closes it (owner, 2026-11-17: the sheet's dark scrim slid up with the
 * sheet as a black block). Opens with a spring — a slight scale up from the trigger plus a fade —
 * and its rows ease in one after another (MenuRowIn); closes with a quick fade. With Reduce Motion
 * on, both are plain fades.
 *
 * Opens below the trigger, or above it when there is no room below. `anchor` null = closed; the
 * menu stays mounted through its closing animation.
 */
export function AnchoredMenu({ anchor, onClose, width = 320, background, border, label, children }: {
  anchor: AnchorRect | null; onClose: () => void; width?: number; background: string; border: string;
  /** Read out by VoiceOver for the menu as a whole. */
  label: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const { width: winW, height: winH } = useWindowDimensions();
  const side = useSideInsets(); // our Modal pads its content off the Duo's side strip
  const [shown, setShown] = useState<AnchorRect | null>(anchor);
  const progress = useSharedValue(0);

  // Keyed on the anchor's VALUE: a caller may build a fresh (equal) rect on every render, and that
  // must not replay the opening animation.
  const anchorKey = anchor ? `${anchor.x},${anchor.y},${anchor.width},${anchor.height}` : '';
  useEffect(() => {
    if (anchor) {
      setShown(anchor);
      progress.value = 0;
      progress.value = reduce
        ? withTiming(1, { duration: 160 })
        : withSpring(1, { damping: 22, stiffness: 340, mass: 0.7 });
    } else {
      progress.value = withTiming(0, { duration: reduce ? 120 : 150, easing: Easing.in(Easing.quad) }, (done) => {
        if (done) runOnJS(setShown)(null);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- anchorKey stands for anchor
  }, [anchorKey, reduce, progress]);

  const areaW = winW - side.left - side.right;
  const w = Math.min(width, areaW - MARGIN * 2);
  const a = shown ?? { x: 0, y: 0, width: 0, height: 0 };
  const ax = a.x - side.left; // the anchor, in the padded area the menu is laid out in
  const left = Math.min(Math.max(ax, MARGIN), areaW - w - MARGIN);
  const below = winH - (a.y + a.height + GAP) - MARGIN;
  const above = a.y - GAP - MARGIN;
  const up = below < 260 && above > below; // not enough room under the trigger: open upwards
  const maxH = Math.max(160, up ? above : below);
  // Grow from the trigger's centre, at the edge of the menu that touches it.
  const originX = Math.min(Math.max(ax + a.width / 2 - left, 0), w);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: Math.min(1, Math.max(0, t)),
      transform: [
        { translateY: (1 - t) * (up ? 8 : -8) },
        { scale: reduce ? 1 : 0.9 + 0.1 * t },
      ],
    };
  });

  return (
    <Modal visible={!!shown} transparent animationType="none" onRequestClose={onClose}>
      {/* Catches a tap outside the menu. Transparent on purpose — no dim. */}
      <Pressable onPress={onClose} accessible={false} style={{ flex: 1 }}>
        <Animated.View
          accessibilityRole="menu" accessibilityLabel={label} accessibilityViewIsModal onAccessibilityEscape={onClose}
          onStartShouldSetResponder={() => true} // a tap on the menu's own padding does not close it
          style={[{
            position: 'absolute', left, width: w, maxHeight: maxH,
            ...(up ? { bottom: winH - a.y + GAP } : { top: a.y + a.height + GAP }),
            transformOrigin: `${Math.round(originX)}px ${up ? '100%' : '0px'}`,
            backgroundColor: background, borderRadius: 18, borderWidth: 0.5, borderColor: border, overflow: 'hidden',
            shadowColor: '#0B1220', shadowOpacity: 0.2, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 16,
          }, style]}>
          {children}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/** The entrance for a menu's row `index`: a short fade-and-drop, each row a beat after the last. */
export function menuRowIn(index: number, reduce: boolean) {
  if (reduce) return undefined;
  return new Keyframe({
    0: { opacity: 0, transform: [{ translateY: -6 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: Easing.out(Easing.cubic) },
  }).delay(50 + index * 28).duration(240);
}

/** Colours for MenuItem — a menu is painted from the screen's palette. */
export interface MenuColors { text: string; mute: string; danger: string; pressed: string; divider: string }

/**
 * One row of an AnchoredMenu, iOS pull-down style: the label, its icon at the trailing end, a hairline
 * between rows; red for a destructive action. 48 pt tall. Darkens under the finger (a plain style:
 * this app's Pressable drops style functions) and eases in after the row above it (menuRowIn).
 */
export function MenuItem({ index, label, Icon, danger, onPress, colors: c, first }: {
  index: number; label: string; Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  danger?: boolean; onPress: () => void; colors: MenuColors; first?: boolean;
}) {
  const reduce = useReducedMotion();
  const [down, setDown] = useState(false);
  const ink = danger ? c.danger : c.text;
  return (
    <Animated.View entering={menuRowIn(index, reduce)}>
      <Pressable onPress={onPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)}
        accessibilityRole="menuitem" accessibilityLabel={label}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 16, backgroundColor: down ? c.pressed : 'transparent',
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: c.divider }}>
        <Text numberOfLines={1} style={{ flex: 1, color: ink, ...textStyles.body }}>{label}</Text>
        <Icon size={19} color={danger ? c.danger : c.mute} strokeWidth={2} />
      </Pressable>
    </Animated.View>
  );
}

/** A menu's small heading line (what the menu is about — a chat's name, "Show groups of"). */
export function MenuHeading({ children, color }: { children: ReactNode; color: string }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
      <Text numberOfLines={1} style={{ color, ...textStyles.footnote, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Modal } from './Modal';

/**
 * A bottom sheet with no dimmed backdrop — for the longer pickers (forward to…, message info, the
 * emoji picker) that are too big to open from a button like AnchoredMenu. The screen behind stays as
 * it is; a soft shadow along the sheet's top edge sets it apart, and a tap above it closes it. It
 * springs up and eases back down (a plain fade with Reduce Motion on). The old sheets slid a 40%
 * black backdrop up with them (owner, 2026-11-17: "remove that black thing").
 *
 * On a wide window (the iPhone Duo opened) it is a centred card no wider than MAX_WIDTH instead of
 * running across both panes. Stays mounted through its closing animation.
 */
const MAX_WIDTH = 600;

export function Sheet({ visible, onClose, background, maxHeight = '80%', children }: {
  visible: boolean; onClose: () => void; background: string;
  maxHeight?: number | `${number}%`;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const { width: winW, height: winH } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [height, setHeight] = useState(winH);
  const t = useSharedValue(0); // 0 = hidden below the screen, 1 = up

  useEffect(() => {
    if (visible) {
      setMounted(true);
      t.value = reduce ? withTiming(1, { duration: 180 }) : withSpring(1, { damping: 26, stiffness: 260, mass: 0.9 });
    } else if (mounted) {
      t.value = withTiming(0, { duration: reduce ? 150 : 220, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [visible, reduce, t, mounted]);

  const style = useAnimatedStyle(() => ({
    opacity: reduce ? t.value : Math.min(1, t.value * 3),
    transform: [{ translateY: reduce ? 0 : (1 - t.value) * (height + 24) }],
  }));

  const w = Math.min(winW, MAX_WIDTH);
  const wide = winW > MAX_WIDTH;
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      {/* Catches a tap above the sheet. Transparent on purpose — no dim. */}
      <Pressable onPress={onClose} accessible={false} style={{ flex: 1 }} />
      <Animated.View
        accessibilityViewIsModal onAccessibilityEscape={onClose}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        style={[{
          position: 'absolute', bottom: wide ? 12 : 0, width: w, left: (winW - w) / 2, maxHeight,
          backgroundColor: background, borderTopLeftRadius: 22, borderTopRightRadius: 22,
          borderBottomLeftRadius: wide ? 22 : 0, borderBottomRightRadius: wide ? 22 : 0, overflow: 'hidden',
          shadowColor: '#0B1220', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 18,
        }, style]}>
        <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 2 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(134,150,160,0.45)' }} />
        </View>
        {children}
      </Animated.View>
    </Modal>
  );
}

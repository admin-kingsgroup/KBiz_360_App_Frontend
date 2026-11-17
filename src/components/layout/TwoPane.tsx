import { useEffect, useState, type ReactNode } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { ReservedRegionsProvider, useReservedRegions } from 'react-native-reserved-regions';
import { listRange, snapListWidth, splitPanes } from '../../logic/wideLayout';
import { usePaneSizeStore } from '../../store/paneSizeStore';

// List | detail, side by side, for a wide window (the iPhone Duo opened). Half-folded, the two panes
// meet exactly on the hinge, which the system reports as a "division" region: nothing straddles the
// crease. Flat (no fold reported), the person sets the split: drag the handle on the divider, and the
// width is kept for next time; double-tap it to go back to the default. See logic/wideLayout.ts.
export function TwoPane({ left, right, divider, background, grip, accent }: {
  left: ReactNode; right: ReactNode; divider: string; background: string; grip: string; accent: string;
}) {
  return (
    <ReservedRegionsProvider style={{ flex: 1, backgroundColor: background }}>
      <Split left={left} right={right} divider={divider} grip={grip} accent={accent} />
    </ReservedRegionsProvider>
  );
}

function Split({ left, right, divider, grip, accent }: { left: ReactNode; right: ReactNode; divider: string; grip: string; accent: string }) {
  const regions = useReservedRegions();
  // The provider's own width (the window less any side strip), from layout; the window width is
  // only the first-frame guess.
  const { width: windowW } = useWindowDimensions();
  const [width, setWidth] = useState(windowW);
  const fraction = usePaneSizeStore((s) => s.listFraction);
  const setFraction = usePaneSizeStore((s) => s.setListFraction);
  const { list, gap, onFold } = splitPanes(width, regions, fraction);
  return (
    <View style={{ flex: 1, flexDirection: 'row' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ width: list }}>{left}</View>
      {/* On the fold the gap is the hinge's own width (often 0 on iOS): a hairline marks the seam. */}
      <View style={{ width: Math.max(gap, StyleSheet.hairlineWidth), backgroundColor: divider }} />
      <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
      {onFold ? null : (
        <SplitHandle list={list} width={width} grip={grip} accent={accent}
          onChange={(next) => setFraction(next / width)} onReset={() => setFraction(null)} />
      )}
    </View>
  );
}

// Wide enough for a thumb, narrow enough to stay inside both panes' margins (rows and bubbles start
// 16–20 pt in), so it never covers a button.
const HIT = 24;
const STEP = 0.05; // VoiceOver: each swipe up/down widens/narrows the list by 5% of the window

// The divider's handle: a grip pill on the seam. While dragging, an accent line follows the finger
// and the panes take the new width when it is let go (re-laying out both lists every frame would
// stutter); it snaps to the middle when let go near it.
function SplitHandle({ list, width, grip, accent, onChange, onReset }: {
  list: number; width: number; grip: string; accent: string; onChange: (list: number) => void; onReset: () => void;
}) {
  const { min, max } = listRange(width);
  const dx = useSharedValue(0);
  const active = useSharedValue(0);
  // The panes moved to the new width: the handle is already there, so drop the drag offset.
  useEffect(() => { dx.value = 0; }, [list, dx]);

  const commit = (x: number): void => {
    const next = snapListWidth(x, width);
    if (next === list) dx.value = 0; else onChange(next);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onBegin(() => { active.value = 1; })
    .onUpdate((e) => { dx.value = Math.min(max - list, Math.max(min - list, e.translationX)); })
    .onEnd(() => { runOnJS(commit)(list + dx.value); })
    .onFinalize((_, success) => { active.value = 0; if (!success) dx.value = 0; });
  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => { runOnJS(onReset)(); });

  const follow = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));
  const line = useAnimatedStyle(() => ({ opacity: active.value }));
  const pill = useAnimatedStyle(() => ({ opacity: active.value ? 1 : 0.55, backgroundColor: active.value ? accent : grip }));

  return (
    <GestureDetector gesture={Gesture.Race(pan, doubleTap)}>
      <Animated.View
        testID="two-pane-divider"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Chat list width"
        accessibilityHint="Drag sideways to resize the list and the chat. Double-tap to reset."
        accessibilityValue={{ text: `${Math.round((list / width) * 100)} percent` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => commit(list + (e.nativeEvent.actionName === 'increment' ? 1 : -1) * width * STEP)}
        style={[{ position: 'absolute', top: 0, bottom: 0, left: list - HIT / 2, width: HIT, alignItems: 'center', justifyContent: 'center' }, follow]}>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: accent }, line]} />
        <Animated.View pointerEvents="none" style={[{ width: 5, height: 44, borderRadius: 3 }, pill]} />
      </Animated.View>
    </GestureDetector>
  );
}

import { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, cancelAnimation } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// Full-screen zoomable image (WhatsApp-style viewer): pinch to zoom around the fingers, drag to
// pan while zoomed (clamped to the image bounds), double-tap to zoom in at that spot / back out,
// single tap = `onSingleTap` (the viewer uses it to close). Runs entirely on the UI thread.
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

interface Props {
  uri: string;
  onSingleTap?: () => void;
}

export function ZoomableImage({ uri, onSingleTap }: Props) {
  // Container (the whole viewer area) and the image's rendered "contain" size within it — the
  // latter bounds panning so the picture can't be dragged off-screen.
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let alive = true;
    Image.getSize(uri, (w, h) => { if (alive && w > 0 && h > 0) setNatural({ w, h }); }, () => undefined);
    return () => { alive = false; };
  }, [uri]);
  const fitW = useSharedValue(0);
  const fitH = useSharedValue(0);
  useEffect(() => {
    if (!box.w || !box.h) return;
    if (!natural) { fitW.value = box.w; fitH.value = box.h; return; }
    const r = Math.min(box.w / natural.w, box.h / natural.h);
    fitW.value = natural.w * r;
    fitH.value = natural.h * r;
  }, [box, natural, fitW, fitH]);
  const boxW = useSharedValue(0);
  const boxH = useSharedValue(0);
  const onLayout = (e: LayoutChangeEvent): void => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
    boxW.value = width;
    boxH.value = height;
  };

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const focal0X = useSharedValue(0); // pinch focal point at gesture start (relative to centre)
  const focal0Y = useSharedValue(0);
  const pinching = useSharedValue(false); // while true the pinch owns tx/ty (it follows the fingers itself)
  const panOffX = useSharedValue(0); // pan translation already "spent" while a pinch was active
  const panOffY = useSharedValue(0);

  // Largest allowed |translate| for a given scale so the image edges never leave the viewport
  // (0 when the scaled image is smaller than the box on that axis → it stays centred).
  const maxTx = (s: number): number => {
    'worklet';
    return Math.max(0, (fitW.value * s - boxW.value) / 2);
  };
  const maxTy = (s: number): number => {
    'worklet';
    return Math.max(0, (fitH.value * s - boxH.value) / 2);
  };
  const clamp = (v: number, lo: number, hi: number): number => {
    'worklet';
    return Math.min(hi, Math.max(lo, v));
  };
  const settle = (): void => {
    'worklet';
    if (scale.value <= MIN_SCALE) {
      scale.value = withTiming(MIN_SCALE); tx.value = withTiming(0); ty.value = withTiming(0);
      savedScale.value = MIN_SCALE; savedTx.value = 0; savedTy.value = 0;
      return;
    }
    const s = Math.min(scale.value, MAX_SCALE);
    const cx = clamp(tx.value, -maxTx(s), maxTx(s));
    const cy = clamp(ty.value, -maxTy(s), maxTy(s));
    scale.value = withTiming(s); tx.value = withTiming(cx); ty.value = withTiming(cy);
    savedScale.value = s; savedTx.value = cx; savedTy.value = cy;
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      cancelAnimation(scale); cancelAnimation(tx); cancelAnimation(ty);
      pinching.value = true;
      savedScale.value = scale.value; savedTx.value = tx.value; savedTy.value = ty.value;
      focal0X.value = e.focalX - boxW.value / 2;
      focal0Y.value = e.focalY - boxH.value / 2;
    })
    .onUpdate((e) => {
      // Zoom about the fingers: keep the content point under the initial focal point fixed
      // (tx' = r·tx + f·(1−r)), then follow the fingers as they drift (two-finger pan).
      const next = clamp(savedScale.value * e.scale, MIN_SCALE * 0.7, MAX_SCALE * 1.3); // soft over-zoom, springs back
      const r = next / savedScale.value;
      const fx = e.focalX - boxW.value / 2;
      const fy = e.focalY - boxH.value / 2;
      scale.value = next;
      tx.value = savedTx.value * r + focal0X.value * (1 - r) + (fx - focal0X.value);
      ty.value = savedTy.value * r + focal0Y.value * (1 - r) + (fy - focal0Y.value);
    })
    .onEnd(() => { pinching.value = false; settle(); });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      cancelAnimation(tx); cancelAnimation(ty);
      savedTx.value = tx.value; savedTy.value = ty.value;
      panOffX.value = 0; panOffY.value = 0;
    })
    .onUpdate((e) => {
      // While pinching, the pinch handler already follows the fingers — just remember how much of
      // this pan's translation happened under it, so a one-finger continuation doesn't jump.
      if (pinching.value) { panOffX.value = e.translationX; panOffY.value = e.translationY; return; }
      if (scale.value <= MIN_SCALE) return; // nothing to pan when the whole image already fits
      const s = scale.value;
      // Slight resistance past the edges (feels native), settle() snaps back inside on release.
      const rawX = savedTx.value + (e.translationX - panOffX.value);
      const rawY = savedTy.value + (e.translationY - panOffY.value);
      const mx = maxTx(s), my = maxTy(s);
      tx.value = rawX > mx ? mx + (rawX - mx) * 0.3 : rawX < -mx ? -mx + (rawX + mx) * 0.3 : rawX;
      ty.value = rawY > my ? my + (rawY - my) * 0.3 : rawY < -my ? -my + (rawY + my) * 0.3 : rawY;
    })
    .onEnd(() => { if (!pinching.value) settle(); });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .onStart((e) => { // (Tap.onEnd also fires on failure — onStart = recognised)
      cancelAnimation(scale); cancelAnimation(tx); cancelAnimation(ty);
      if (scale.value > MIN_SCALE) {
        scale.value = withTiming(MIN_SCALE); tx.value = withTiming(0); ty.value = withTiming(0);
        savedScale.value = MIN_SCALE; savedTx.value = 0; savedTy.value = 0;
        return;
      }
      // Zoom in centred on the tapped point (same focal maths as the pinch, from scale 1 / no offset).
      const s = DOUBLE_TAP_SCALE;
      const fx = e.x - boxW.value / 2;
      const fy = e.y - boxH.value / 2;
      const nx = clamp(fx * (1 - s), -maxTx(s), maxTx(s));
      const ny = clamp(fy * (1 - s), -maxTy(s), maxTy(s));
      scale.value = withTiming(s); tx.value = withTiming(nx); ty.value = withTiming(ny);
      savedScale.value = s; savedTx.value = nx; savedTy.value = ny;
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    // Only when not zoomed in — a stray tap while inspecting a zoomed image must not close the
    // viewer (double-tap zooms back out first, exactly like WhatsApp).
    .onStart(() => { if (scale.value <= MIN_SCALE && onSingleTap) runOnJS(onSingleTap)(); });

  // Pinch + pan run together (zoom while dragging); double-tap takes priority over single-tap.
  const gesture = Gesture.Race(Gesture.Simultaneous(pinch, pan), Gesture.Exclusive(doubleTap, singleTap));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <View style={styles.fill} onLayout={onLayout} collapsable={false}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.fill, styles.center, style]}>
          <Image source={{ uri }} style={styles.fill} resizeMode="contain" />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  center: { alignItems: 'center', justifyContent: 'center' },
});

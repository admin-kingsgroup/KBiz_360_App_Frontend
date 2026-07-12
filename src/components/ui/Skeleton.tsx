import { useEffect } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { colors } from '../../theme';

// A single shimmering placeholder block. Compose these into row/card skeletons while data loads.
export function Skeleton({ w, h, r = 8, style }: { w?: DimensionValue; h: number; r?: number; style?: object }) {
  const o = useSharedValue(0.55);
  useEffect(() => {
    o.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0.55, { duration: 650 })), -1, false);
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: colors.cardEdge }, anim, style]} />;
}

// A card-shaped placeholder row: avatar + two text lines (mimics a group/department/chat item).
export function SkeletonRow() {
  return (
    <View className="flex-row items-center gap-3 p-3" style={{ backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: 16 }}>
      <Skeleton w={40} h={40} r={13} />
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton w="62%" h={12} />
        <Skeleton w="40%" h={10} />
      </View>
    </View>
  );
}

// A list of placeholder rows for a loading segment.
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <View className="px-4 pt-3" style={{ gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
    </View>
  );
}

import { useState, type ReactNode } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { ReservedRegionsProvider, useReservedRegions } from 'react-native-reserved-regions';
import { splitPanes } from '../../logic/wideLayout';

// List | detail, side by side, for a wide window (the iPhone Duo opened). On the Duo the two panes
// meet exactly on the hinge, which the system reports as a "division" region: each pane is one half
// of the screen and nothing straddles the crease. Without a reported fold (older iOS, an Android
// tablet) the list takes ~40%. See logic/wideLayout.ts for the split rule.
export function TwoPane({ left, right, divider, background }: {
  left: ReactNode; right: ReactNode; divider: string; background: string;
}) {
  return (
    <ReservedRegionsProvider style={{ flex: 1, backgroundColor: background }}>
      <Split left={left} right={right} divider={divider} />
    </ReservedRegionsProvider>
  );
}

function Split({ left, right, divider }: { left: ReactNode; right: ReactNode; divider: string }) {
  const regions = useReservedRegions();
  // The provider's own width (the window less any side strip), from layout; the window width is
  // only the first-frame guess.
  const { width: windowW } = useWindowDimensions();
  const [width, setWidth] = useState(windowW);
  const { list, gap } = splitPanes(width, regions);
  return (
    <View style={{ flex: 1, flexDirection: 'row' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ width: list }}>{left}</View>
      {/* On the fold the gap is the hinge's own width (often 0 on iOS): a hairline marks the seam. */}
      <View style={{ width: Math.max(gap, StyleSheet.hairlineWidth), backgroundColor: divider }} />
      <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
    </View>
  );
}

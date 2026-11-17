import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSideStripStore } from '../../store/sideStripStore';

// The real left/right insets, for what renders OUTSIDE this padded root: a react-native Modal opens
// its own native window, so it is not inside SideSafeArea and pads itself (components/ui/Modal).
const SideInsetsContext = createContext<{ left: number; right: number }>({ left: 0, right: 0 });
export const useSideInsets = (): { left: number; right: number } => useContext(SideInsetsContext);

// iPhone Duo keeps the status bar, camera and system buttons in a vertical strip down one side of
// the closed (outer) screen. UIKit reports that strip as a left/right safe-area inset. Every screen
// here draws its own header and tab bar and only ever pads top/bottom, so without this the whole
// app would run under the strip (the "UI not proper" on the Duo).
//
// One fix for every screen: pad the app root away from the strip, paint the strip in the colour of
// the screen in front (sideStripStore), and open a NESTED SafeAreaProvider inside the padding. It
// measures its own native view, which no longer touches the strip, so everything below sees side
// insets of 0: useSafeAreaInsets() AND the native SafeAreaView, which resolves its insets from
// the nearest provider rather than from its own frame (with the window's provider it would pad the
// strip a second time — seen on the permissions screen). Top/bottom insets are unchanged.
// On every other iPhone held upright both side insets are 0 and the extra provider is inert.
export function SideSafeArea({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  const strip = useSideStripStore((s) => s.color);
  const sides = useMemo(() => ({ left: insets.left, right: insets.right }), [insets.left, insets.right]);
  // First-frame metrics for the inner provider (it renders nothing until it has some): the window's,
  // minus the strip. The native measurement replaces them on the next frame.
  const initial = useMemo(() => ({
    insets: { ...insets, left: 0, right: 0 },
    frame: { x: frame.x + insets.left, y: frame.y, width: frame.width - insets.left - insets.right, height: frame.height },
  }), [insets, frame]);
  const hasStrip = insets.left > 0 || insets.right > 0;
  return (
    <SideInsetsContext.Provider value={sides}>
      <View style={{ flex: 1, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: hasStrip ? strip : undefined }}>
        <SafeAreaProvider initialMetrics={initial}>{children}</SafeAreaProvider>
      </View>
    </SideInsetsContext.Provider>
  );
}

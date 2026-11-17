import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useVerticalBarEdgeIOS } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSideStripStore } from '../../store/sideStripStore';
import { railEdgeOf, type RailEdge } from '../../logic/sideRail';

export type { RailEdge } from '../../logic/sideRail';

// The real left/right insets, for what renders OUTSIDE this padded root: a react-native Modal opens
// its own native window, so it is not inside SideSafeArea and pads itself (components/ui/Modal).
const SideInsetsContext = createContext<{ left: number; right: number }>({ left: 0, right: 0 });
export const useSideInsets = (): { left: number; right: number } => useContext(SideInsetsContext);

// The strip as a place to put the app's own controls. On the Duo, iOS fills that strip with an app's
// NATIVE bars: WhatsApp's back and call buttons sit there under the clock. This app draws its bars
// in JS, which iOS leaves where they are, so the strip held only the clock and read as an empty
// column (owner, 2026-11-17: "why in right side it is empty"). A screen hands its controls to
// useRail and they render here, in the strip, over the strip's colour. `edge` is null on every
// phone without the vertical bar, and then nothing renders.
type RailOwner = object;
interface SideRail {
  edge: RailEdge | null;
  width: number;
  showRail: (owner: RailOwner, node: ReactNode) => void;
  hideRail: (owner: RailOwner) => void;
}
const SideRailContext = createContext<SideRail>({ edge: null, width: 0, showRail: () => {}, hideRail: () => {} });
export const useSideRail = (): Pick<SideRail, 'edge' | 'width'> => useContext(SideRailContext);

/**
 * Shows `node` in the side strip while `active` (pass the screen's focus) and returns the strip's
 * edge, or null when there is no strip and the screen keeps its normal bars. Several screens can
 * hold the strip (the tabs under a pushed chat); the one that showed it last is drawn.
 */
export function useRail(node: ReactNode, active: boolean): RailEdge | null {
  const { edge, showRail, hideRail } = useContext(SideRailContext);
  const owner = useRef<RailOwner>({}).current;
  const on = edge !== null && active;
  useEffect(() => { if (on) showRail(owner, node); else hideRail(owner); });
  useEffect(() => () => hideRail(owner), [hideRail, owner]);
  return edge;
}


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
export function SideSafeArea({ children, fallbackRail }: { children: ReactNode; fallbackRail?: ReactNode }) {
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
  const barEdge = useVerticalBarEdgeIOS();
  const [rails, setRails] = useState<{ owner: RailOwner; node: ReactNode }[]>([]);
  const showRail = useCallback((owner: RailOwner, node: ReactNode) => setRails((list) => {
    const i = list.findIndex((r) => r.owner === owner);
    if (i < 0) return [...list, { owner, node }];
    const next = list.slice();
    next[i] = { owner, node };
    return next;
  }), []);
  const hideRail = useCallback((owner: RailOwner) => setRails((list) => (list.some((r) => r.owner === owner) ? list.filter((r) => r.owner !== owner) : list)), []);
  const edge = railEdgeOf(barEdge, insets);
  const width = edge === 'right' ? insets.right : edge === 'left' ? insets.left : 0;
  const railCtx = useMemo<SideRail>(() => ({ edge, width, showRail, hideRail }), [edge, width, showRail, hideRail]);
  const rail = rails.length ? rails[rails.length - 1].node : fallbackRail ?? null;
  return (
    <SideInsetsContext.Provider value={sides}>
      <SideRailContext.Provider value={railCtx}>
        <View style={{ flex: 1, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: hasStrip ? strip : undefined }}>
          <SafeAreaProvider initialMetrics={initial}>{children}</SafeAreaProvider>
          {edge && rail ? (
            <View style={{ position: 'absolute', top: 0, bottom: 0, [edge]: 0, width }}>{rail}</View>
          ) : null}
        </View>
      </SideRailContext.Provider>
    </SideInsetsContext.Provider>
  );
}

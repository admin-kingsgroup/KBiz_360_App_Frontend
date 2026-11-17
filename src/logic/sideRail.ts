// iPhone Duo side strip (see components/layout/SideSafeArea). Kept free of React Native so it tests in node.

export type RailEdge = 'left' | 'right';

// The strip is the side whose inset iOS reports; the vertical-bar trait says it holds the system bar
// (a plain iPhone on its side also has side insets, for the notch, and gets no rail).
export function railEdgeOf(barEdge: string | null, insets: { left: number; right: number }): RailEdge | null {
  if (!barEdge) return null;
  if (insets.right > 0 && insets.right >= insets.left) return 'right';
  return insets.left > 0 ? 'left' : null;
}

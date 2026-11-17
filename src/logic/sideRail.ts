// iPhone Duo side strip (see components/layout/SideSafeArea). Kept free of React Native so it tests in node.

export type RailEdge = 'left' | 'right';

// The strip is the side whose inset iOS reports; the vertical-bar trait says it holds the system bar
// (a plain iPhone on its side also has side insets, for the notch, and gets no rail).
export function railEdgeOf(barEdge: string | null, insets: { left: number; right: number }): RailEdge | null {
  if (!barEdge) return null;
  if (insets.right > 0 && insets.right >= insets.left) return 'right';
  return insets.left > 0 ? 'left' : null;
}

// Where a pushed screen's buttons (back, search, ⋮) start in the strip: at the TOP, right under iOS's
// own column of camera, clock, Wi-Fi and battery, as WhatsApp's back button sits on the Duo (Afshin,
// 2026-11-17: "WhatsApp mein back ka button upar aata hai, neeche nahi"). iOS doesn't say how tall
// that column is (the status-bar frame reads 2 pt in this mode), so this is measured: it ends about
// 150 pt down on the simulator, and about 190 pt on Afshin's Duo while screen recording stretched the
// camera into a pill (a call does the same). The buttons start below the longer one, so they never
// sit under the clock. The tab rail stays at the bottom, by the thumb, where iOS puts a tab bar.
export const RAIL_ACTIONS_TOP = 184;

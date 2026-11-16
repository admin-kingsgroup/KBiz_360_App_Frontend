// Layout maths for the two-pane Chats view (list | conversation) on wide windows — the iPhone Duo
// opened. Pure, so it is unit-tested without a device.

/**
 * Narrowest window that gets two panes, in points. The Duo's outer screen and every other iPhone
 * held upright are well under it (≤ 440); the Duo opened is ~626. Two 300-pt columns is also the
 * least WhatsApp-style rows and bubbles still read well in.
 */
export const WIDE_MIN_WIDTH = 600;

export const isWideWidth = (width: number): boolean => width >= WIDE_MIN_WIDTH;

/** A reserved region as react-native-reserved-regions reports it (frame relative to its provider). */
export interface RegionLike {
  kind: 'division' | 'occlusion';
  frame: { x: number; y: number; width: number; height: number };
}

export interface PaneSplit {
  /** Width of the left (list) pane. */
  list: number;
  /** Width of the gap between the panes — the fold itself when the display reports one. */
  gap: number;
  /** True when the split sits on a real fold the system reported. */
  onFold: boolean;
}

/**
 * Where to split a wide window. If the display reports an upright division (the Duo's hinge), the
 * panes meet exactly on it, as Apple asks: nothing straddles the crease. Otherwise (no fold
 * reported, e.g. an older iOS) the list takes 40% of the width, held between 300 and 420 points.
 */
export function splitPanes(width: number, regions: readonly RegionLike[]): PaneSplit {
  const fold = regions.find((r) => r.kind === 'division' && r.frame.height > r.frame.width
    && r.frame.x > 0 && r.frame.x < width);
  if (fold) {
    return { list: Math.round(fold.frame.x), gap: Math.max(0, Math.round(fold.frame.width)), onFold: true };
  }
  return { list: Math.round(Math.min(420, Math.max(300, width * 0.4))), gap: 0, onFold: false };
}

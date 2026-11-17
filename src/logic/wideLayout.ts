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

// The person can drag the divider (TwoPane) — owner, 2026-11-17: the list was crowded at 40%. The list
// keeps at least LIST_MIN (its rows and filter tabs stop fitting below that), the chat at least
// DETAIL_MIN (a bubble and the composer's buttons). A window too narrow for both is simply halved.
export const LIST_MIN = 320;
export const DETAIL_MIN = 360;
/** Default list share when nothing was chosen, capped so a big tablet's list does not sprawl. */
export const LIST_DEFAULT_FRACTION = 0.42;
export const LIST_DEFAULT_MAX = 460;
/** Let go within this distance of the middle and the divider settles exactly on it. */
export const SNAP_TO_HALF = 16;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** How narrow and how wide the list may be dragged in a window this wide. */
export function listRange(width: number): { min: number; max: number } {
  const min = Math.round(Math.min(LIST_MIN, width / 2));
  return { min, max: Math.max(min, Math.round(width - DETAIL_MIN)) };
}

/** Where the divider settles when let go at `x`: inside the range, and on the middle when close to it. */
export function snapListWidth(x: number, width: number): number {
  const { min, max } = listRange(width);
  const half = Math.round(width / 2);
  const at = Math.abs(x - width / 2) <= SNAP_TO_HALF ? half : Math.round(x);
  return clamp(at, min, max);
}

/**
 * Where to split a wide window. If the display reports an upright division (the Duo's hinge, when
 * half-folded), the panes meet exactly on it, as Apple asks: nothing straddles the crease. Otherwise
 * the list takes the share the person dragged the divider to (`fraction` of the width), or by default
 * 42% held between 320 and 460 points — always within listRange.
 */
export function splitPanes(width: number, regions: readonly RegionLike[], fraction?: number | null): PaneSplit {
  const fold = regions.find((r) => r.kind === 'division' && r.frame.height > r.frame.width
    && r.frame.x > 0 && r.frame.x < width);
  if (fold) {
    return { list: Math.round(fold.frame.x), gap: Math.max(0, Math.round(fold.frame.width)), onFold: true };
  }
  const { min, max } = listRange(width);
  const want = fraction != null && fraction > 0 && fraction < 1
    ? fraction * width
    : clamp(width * LIST_DEFAULT_FRACTION, LIST_MIN, LIST_DEFAULT_MAX);
  return { list: Math.round(clamp(want, min, max)), gap: 0, onFold: false };
}

/**
 * Below this window height the tab screens use their compact chrome (one-line title, slimmer search
 * and filter rows, one row of chips instead of the branch tiles). Both iPhone Duo screens are ~670 pt
 * tall (the inner one is held sideways) and so is an iPhone SE; every other iPhone is 840+. On the
 * Duo opened, the full chrome took over half the list's height (owner, 2026-11-17).
 */
export const COMPACT_MAX_HEIGHT = 720;
export const isCompactHeight = (height: number): boolean => height < COMPACT_MAX_HEIGHT;

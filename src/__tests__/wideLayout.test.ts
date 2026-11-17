import { isCompactHeight, isWideWidth, listRange, snapListWidth, splitPanes, WIDE_MIN_WIDTH, type RegionLike } from '../logic/wideLayout';

// The two-pane Chats view (list | conversation) on a wide window — the iPhone Duo opened.

const fold = (x: number, width = 0, height = 890): RegionLike => ({ kind: 'division', frame: { x, y: 0, width, height } });

describe('isWideWidth', () => {
  it('keeps every phone held upright, and the Duo closed, on one pane', () => {
    expect(isWideWidth(375)).toBe(false); // iPhone SE-class
    expect(isWideWidth(440)).toBe(false); // the largest Pro Max
    expect(isWideWidth(466)).toBe(false); // iPhone Duo, outer screen
  });

  it('gives the Duo opened two panes', () => {
    expect(isWideWidth(626)).toBe(true); // iPhone Duo, inner screen
    expect(isWideWidth(WIDE_MIN_WIDTH)).toBe(true);
    expect(isWideWidth(WIDE_MIN_WIDTH - 1)).toBe(false);
  });
});

describe('splitPanes', () => {
  it('meets exactly on the hinge when the display reports one', () => {
    expect(splitPanes(626, [fold(313)])).toEqual({ list: 313, gap: 0, onFold: true });
  });

  it('keeps the hinge width as the gap when the fold has width', () => {
    expect(splitPanes(640, [fold(312, 16)])).toEqual({ list: 312, gap: 16, onFold: true });
  });

  it('ignores a sideways division (not a fold between left and right panes)', () => {
    const horizontal: RegionLike = { kind: 'division', frame: { x: 0, y: 445, width: 626, height: 0 } };
    expect(splitPanes(626, [horizontal]).onFold).toBe(false);
  });

  it('ignores occlusions such as a camera cutout', () => {
    const camera: RegionLike = { kind: 'occlusion', frame: { x: 560, y: 20, width: 40, height: 40 } };
    expect(splitPanes(626, [camera]).onFold).toBe(false);
  });

  it('ignores a fold outside the pane area (the provider can be inset)', () => {
    expect(splitPanes(626, [fold(700)]).onFold).toBe(false);
    expect(splitPanes(626, [fold(0)]).onFold).toBe(false);
  });

  it('without a reported fold, gives the list 42%, at least 320 and at most 460 points', () => {
    expect(splitPanes(867, [])).toEqual({ list: 364, gap: 0, onFold: false }); // the Duo opened, less the side strip
    expect(splitPanes(900, [])).toEqual({ list: 378, gap: 0, onFold: false });
    expect(splitPanes(1366, [])).toEqual({ list: 460, gap: 0, onFold: false }); // 574 → 460
    expect(splitPanes(626, [])).toEqual({ list: 313, gap: 0, onFold: false }); // too narrow for both minimums: halves
  });

  it('uses the width the person dragged the divider to, kept as a share of the window', () => {
    expect(splitPanes(867, [], 0.5).list).toBe(434);
    expect(splitPanes(1000, [], 0.5).list).toBe(500); // the same share on a wider window
  });

  it('still meets on the hinge when half-folded, whatever width was chosen flat', () => {
    expect(splitPanes(626, [fold(313)], 0.7)).toEqual({ list: 313, gap: 0, onFold: true });
  });
});

describe('dragging the divider', () => {
  it('keeps the list at least 320 points and the chat at least 360', () => {
    expect(listRange(867)).toEqual({ min: 320, max: 507 });
    expect(snapListWidth(100, 867)).toBe(320);
    expect(snapListWidth(800, 867)).toBe(507);
  });

  it('snaps to the middle when let go near it', () => {
    expect(snapListWidth(440, 867)).toBe(434); // within 16 pt of 433.5
    expect(snapListWidth(400, 867)).toBe(400); // too far: stays where it was let go
  });

  it('halves a window too narrow for both minimums', () => {
    expect(listRange(626)).toEqual({ min: 313, max: 313 });
  });
});

describe('isCompactHeight', () => {
  it('gives both iPhone Duo screens and an iPhone SE the compact chrome', () => {
    expect(isCompactHeight(669)).toBe(true); // Duo opened, held sideways
    expect(isCompactHeight(678)).toBe(true); // Duo closed
    expect(isCompactHeight(667)).toBe(true); // iPhone SE
  });

  it('keeps the full header and branch tiles on every other iPhone', () => {
    expect(isCompactHeight(844)).toBe(false);
    expect(isCompactHeight(956)).toBe(false);
  });
});

import { isWideWidth, splitPanes, WIDE_MIN_WIDTH, type RegionLike } from '../logic/wideLayout';

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

  it('without a reported fold, gives the list 40% held between 300 and 420 points', () => {
    expect(splitPanes(626, [])).toEqual({ list: 300, gap: 0, onFold: false }); // 250 → 300
    expect(splitPanes(900, [])).toEqual({ list: 360, gap: 0, onFold: false });
    expect(splitPanes(1366, [])).toEqual({ list: 420, gap: 0, onFold: false }); // 546 → 420
  });
});

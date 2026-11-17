import { railEdgeOf } from '../logic/sideRail';

// iPhone Duo: the tab bar and a pushed screen's buttons move into the side strip only where iOS
// reports a vertical bar AND pads that side. A plain iPhone on its side has side insets for the
// notch but no vertical bar, and must keep its bottom tab bar.
describe('railEdgeOf', () => {
  it('puts the rail on the right strip the Duo reports (closed screen, and open held sideways)', () => {
    expect(railEdgeOf('trailing', { left: 0, right: 84 })).toBe('right');
  });

  it('follows the strip to the left when iOS puts it there', () => {
    expect(railEdgeOf('leading', { left: 84, right: 0 })).toBe('left');
  });

  it('gives no rail without the vertical bar, even with side insets (iPhone on its side)', () => {
    expect(railEdgeOf(null, { left: 59, right: 59 })).toBeNull();
    expect(railEdgeOf(null, { left: 0, right: 84 })).toBeNull();
  });

  it('gives no rail when no side is padded (open screen held upright: bars stay horizontal)', () => {
    expect(railEdgeOf('trailing', { left: 0, right: 0 })).toBeNull();
  });
});

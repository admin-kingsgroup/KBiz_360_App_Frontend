import { applyBranchOrder, moveCode } from '../logic/branchOrder';

const subs = (...codes: string[]) => codes.map((code) => ({ code }));

describe('applyBranchOrder', () => {
  it('keeps the natural directory order when nothing was saved', () => {
    expect(applyBranchOrder(subs('BOM', 'NBO', 'DAR'), undefined).map((s) => s.code)).toEqual(['BOM', 'NBO', 'DAR']);
    expect(applyBranchOrder(subs('BOM', 'NBO'), []).map((s) => s.code)).toEqual(['BOM', 'NBO']);
  });

  it('applies the personal arrangement', () => {
    expect(applyBranchOrder(subs('BOM', 'NBO', 'DAR', 'MHUB'), ['MHUB', 'BOM', 'DAR', 'NBO']).map((s) => s.code))
      .toEqual(['MHUB', 'BOM', 'DAR', 'NBO']);
  });

  it('appends branches unknown to the saved order instead of dropping them', () => {
    // FBM gained its first group after the user arranged — it must still show up.
    expect(applyBranchOrder(subs('BOM', 'FBM', 'NBO'), ['NBO', 'BOM']).map((s) => s.code))
      .toEqual(['NBO', 'BOM', 'FBM']);
  });

  it('ignores saved codes whose branch has no groups right now', () => {
    expect(applyBranchOrder(subs('BOM'), ['DAR', 'BOM']).map((s) => s.code)).toEqual(['BOM']);
  });
});

describe('moveCode', () => {
  it('swaps with the neighbour in the given direction', () => {
    expect(moveCode(['A', 'B', 'C'], 'B', -1)).toEqual(['B', 'A', 'C']);
    expect(moveCode(['A', 'B', 'C'], 'B', 1)).toEqual(['A', 'C', 'B']);
  });

  it('is a no-op at the ends and for unknown codes', () => {
    expect(moveCode(['A', 'B'], 'A', -1)).toEqual(['A', 'B']);
    expect(moveCode(['A', 'B'], 'B', 1)).toEqual(['A', 'B']);
    expect(moveCode(['A', 'B'], 'Z', 1)).toEqual(['A', 'B']);
  });
});

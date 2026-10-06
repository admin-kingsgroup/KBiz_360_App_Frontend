import { mergeBranchChips, resolveSelectedChip } from '../logic/branchChips';

const sub = (code: string, ...items: string[]) => ({ code, city: '', items });

describe('mergeBranchChips', () => {
  const tk = { subs: [sub('MHUB', 'a'), sub('BOM', 'b', 'c'), sub('OTHER', 'd')] };
  const qa = { subs: [sub('OTHER', 'e')] };
  const kgd = { subs: [sub('KGD', 'f', 'g')] };

  it('is one row for every business, in first-seen order', () => {
    expect(mergeBranchChips([tk, qa, kgd]).map((c) => c.code)).toEqual(['MHUB', 'BOM', 'OTHER', 'KGD']);
  });

  it('folds a code shared by several businesses into one chip holding all their groups', () => {
    const other = mergeBranchChips([tk, qa, kgd]).find((c) => c.code === 'OTHER');
    expect(other?.items).toEqual(['d', 'e']);
  });

  it('does not mutate the per-business subs it reads', () => {
    mergeBranchChips([tk, qa]);
    expect(tk.subs[2].items).toEqual(['d']);
  });

  it('is the business\'s own row when only one business is shown', () => {
    expect(mergeBranchChips([tk])).toEqual(tk.subs);
  });
});

describe('resolveSelectedChip', () => {
  const chips = [sub('MHUB'), sub('BOM'), sub('KGD')];
  it('keeps the remembered pick', () => expect(resolveSelectedChip(chips, 'BOM')?.code).toBe('BOM'));
  it('falls back to the first chip when nothing is remembered or the pick is gone', () => {
    expect(resolveSelectedChip(chips)?.code).toBe('MHUB');
    expect(resolveSelectedChip(chips, 'INB')?.code).toBe('MHUB');
  });
  it('is null for an empty row', () => expect(resolveSelectedChip([], 'BOM')).toBeNull());
});

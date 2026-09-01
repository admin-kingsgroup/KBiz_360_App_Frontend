import { OTHER_CHIP, splitUnfiledGroups } from '../logic/groupFiling';

describe('splitUnfiledGroups', () => {
  const groups = [
    { id: 'g1', branchId: 'bom' },
    { id: 'g2', branchId: 'inb' }, // branch row deleted from the shared collection
    { id: 'g3', branchId: null },
    { id: 'g4' },
    { id: 'g5', branchId: 'amd' },
  ];

  it('files groups whose branch the directory returns, and keeps the rest instead of dropping them', () => {
    const { filed, unfiled } = splitUnfiledGroups(groups, ['bom', 'amd']);
    expect(filed.map((g) => g.id)).toEqual(['g1', 'g5']);
    expect(unfiled.map((g) => g.id)).toEqual(['g2', 'g3', 'g4']);
  });

  it('never loses a group: filed + unfiled is the input', () => {
    const { filed, unfiled } = splitUnfiledGroups(groups, []);
    expect(filed).toEqual([]);
    expect(unfiled).toHaveLength(groups.length);
  });

  it('accepts any iterable of ids', () => {
    const { filed } = splitUnfiledGroups(groups, new Set(['inb']));
    expect(filed.map((g) => g.id)).toEqual(['g2']);
  });

  it('uses a chip code that cannot collide with a real branch code', () => {
    expect(OTHER_CHIP).toBe('OTHER');
  });
});

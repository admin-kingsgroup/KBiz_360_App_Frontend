import { mergeSearchHits } from '../logic/searchHits';

const msg = (id: string, text: string, createdAt: string, deletedForEveryone = false) =>
  ({ id, text, createdAt, deletedForEveryone });

describe('mergeSearchHits', () => {
  it('merges memory, device and server sources newest-first, deduped by id', () => {
    const memory = [msg('m3', 'invoice three', '2026-08-07T10:00:00Z')];
    const device = [msg('m3', 'invoice three', '2026-08-07T10:00:00Z'), msg('m1', 'invoice one', '2026-08-01T10:00:00Z')];
    const server = [msg('m2', 'invoice two', '2026-08-03T10:00:00Z'), msg('m1', 'invoice one', '2026-08-01T10:00:00Z')];

    expect(mergeSearchHits('invoice', memory, device, server).map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
  });

  it('is case-insensitive substring matching, like the rest of the app', () => {
    const rows = [msg('a', 'The Invoice #4411', '2026-08-07T10:00:00Z'), msg('b', 'inv only partial', '2026-08-07T11:00:00Z')];
    expect(mergeSearchHits('invo', rows).map((m) => m.id)).toEqual(['a']);
  });

  it('drops stale async results that no longer match the current query', () => {
    // The debounced device/server lookups can resolve after the user kept typing; anything that
    // does not match what is in the box NOW must not appear as a hit.
    const staleServer = [msg('s', 'budget review', '2026-08-05T10:00:00Z')];
    expect(mergeSearchHits('budget review q3', staleServer)).toEqual([]);
  });

  it('never surfaces deleted-for-everyone messages and returns nothing for a blank query', () => {
    const rows = [msg('a', 'needle', '2026-08-07T10:00:00Z', true)];
    expect(mergeSearchHits('needle', rows)).toEqual([]);
    expect(mergeSearchHits('   ', [msg('b', 'anything', '2026-08-07T10:00:00Z')])).toEqual([]);
  });

  it('breaks created-at ties by id so stepping order is stable', () => {
    const t = '2026-08-07T10:00:00.000Z';
    const rows = [msg('aaa', 'tie', t), msg('bbb', 'tie', t)];
    expect(mergeSearchHits('tie', rows).map((m) => m.id)).toEqual(['bbb', 'aaa']);
  });
});

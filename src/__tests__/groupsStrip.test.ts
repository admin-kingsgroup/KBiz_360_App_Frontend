import {
  ALL_BRANCHES, resolveStripPick, stripBranchPrefix, withSender, orderGroups, groupBizId, scopeCounts,
} from '../logic/groupsStrip';

describe('resolveStripPick', () => {
  const codes = ['MHUB', 'BOM', 'KGD'];
  it('opens on All when nothing is remembered', () => expect(resolveStripPick(codes)).toBe(ALL_BRANCHES));
  it('keeps the remembered branch while it still has a tile', () => expect(resolveStripPick(codes, 'BOM')).toBe('BOM'));
  it('falls back to All when the remembered branch is gone', () => expect(resolveStripPick(codes, 'INB')).toBe(ALL_BRANCHES));
  it('keeps an explicit All pick', () => expect(resolveStripPick(codes, ALL_BRANCHES)).toBe(ALL_BRANCHES));
  it('is never a real code', () => expect(codes).not.toContain(ALL_BRANCHES));
});

describe('stripBranchPrefix', () => {
  it('drops the code and its separator', () => {
    expect(stripBranchPrefix('MHUB - Marketing TK', 'MHUB')).toBe('Marketing TK');
    expect(stripBranchPrefix('KGD- ERP KBiz360', 'KGD')).toBe('ERP KBiz360');
    expect(stripBranchPrefix('BOM – Holidays', 'BOM')).toBe('Holidays');
    expect(stripBranchPrefix('bom: Accounts', 'BOM')).toBe('Accounts');
  });
  it('leaves names that only start with the same letters', () => {
    expect(stripBranchPrefix('BOMBAY Team', 'BOM')).toBe('BOMBAY Team');
    expect(stripBranchPrefix('BOM Ticketing', 'BOM')).toBe('BOM Ticketing');
  });
  it('leaves names whose code is elsewhere', () => {
    expect(stripBranchPrefix('Ticketing DAR/FBM CRM', 'HDAR')).toBe('Ticketing DAR/FBM CRM');
  });
  it('understands the pre-H Africa codes', () => {
    expect(stripBranchPrefix('NBO - Sales Team', 'HNBO')).toBe('Sales Team');
    expect(stripBranchPrefix('HNBO - Sales Team', 'HNBO')).toBe('Sales Team');
  });
  it('never empties a name', () => expect(stripBranchPrefix('BOM - ', 'BOM')).toBe('BOM - '));
  it('treats the code literally', () => expect(stripBranchPrefix('A.B - x', 'A*B')).toBe('A.B - x'));
});

describe('withSender', () => {
  it('leads with the first name', () => expect(withSender('Will do the needful', 'Sana Shaikh')).toBe('Sana: Will do the needful'));
  it('is the text alone with no name', () => {
    expect(withSender('Hi', null)).toBe('Hi');
    expect(withSender('Hi', '   ')).toBe('Hi');
  });
});

describe('orderGroups', () => {
  const rows = [
    { id: 'a', ts: 10 },
    { id: 'b', ts: 30 },
    { id: 'c', ts: 5, pinned: true },
    { id: 'd' },
  ];
  it('puts pinned first, then newest', () => expect(orderGroups(rows).map((r) => r.id)).toEqual(['c', 'b', 'a', 'd']));
  it('does not reorder its input', () => {
    orderGroups(rows);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('groupBizId', () => {
  const branchBiz = new Map([['br-bom', 'tk'], ['br-kgd', 'kbi']]);
  it('follows the branch', () => expect(groupBizId({ branchId: 'br-kgd', companyId: 'tk' }, branchBiz, 'tk')).toBe('kbi'));
  it('falls back to the group\'s own business when its branch is unknown', () => {
    expect(groupBizId({ branchId: 'br-gone', companyId: 'qa' }, branchBiz, 'tk')).toBe('qa');
  });
  it('falls back to the first business when nothing else is known', () => expect(groupBizId({}, branchBiz, 'tk')).toBe('tk'));
});

describe('scopeCounts', () => {
  const groups = [
    { bizId: 'tk', branchId: 'bom', unread: 3 },
    { bizId: 'tk', branchId: 'bom', unread: 0 },
    { bizId: 'tk', branchId: 'mhub', unread: 1 },
    { bizId: 'qa', branchId: null, unread: 1 },
    { bizId: 'kbi', branchId: 'kgd', unread: 2 },
  ];
  it('covers everything for all', () => {
    expect(scopeCounts(groups, 'all')).toEqual({ groups: 5, branches: 4, unread: 4, unreadElsewhere: 0 });
  });
  it('counts unread groups in the other businesses', () => {
    expect(scopeCounts(groups, 'tk')).toEqual({ groups: 3, branches: 2, unread: 2, unreadElsewhere: 2 });
    expect(scopeCounts(groups, 'qa')).toEqual({ groups: 1, branches: 1, unread: 1, unreadElsewhere: 3 });
  });
});

import {
  stripBranchPrefix, withSender, orderGroups, groupBizId, scopeCounts,
  brandLogoFor, branchLogoFor, resolveCompanyPick, foldKey, isSectionOpen, setAllSections,
} from '../logic/groupsStrip';

describe('brandLogoFor', () => {
  it('knows the three companies by name', () => {
    expect(brandLogoFor({ name: 'Travkings' })).toBe('travkings');
    expect(brandLogoFor({ name: 'Travkings Tours and Travels' })).toBe('travkings');
    expect(brandLogoFor({ name: 'Quin Aliza' })).toBe('quinaliza');
    expect(brandLogoFor({ name: 'QuinAliza' })).toBe('quinaliza');
    expect(brandLogoFor({ name: 'KBiz360' })).toBe('kbiz');
    expect(brandLogoFor({ name: 'KBiz 360 Technologies' })).toBe('kbiz');
  });
  it('falls back to the short code', () => {
    expect(brandLogoFor({ name: 'Kings Travel', code: 'TK' })).toBe('travkings');
    expect(brandLogoFor({ name: 'Q.A. Ltd', code: 'QA' })).toBe('quinaliza');
  });
  it('gives the company that owns KGD the KBiz logo, whatever it is called', () => {
    expect(brandLogoFor({ name: 'KGD', code: 'KGD' }, ['KGD'])).toBe('kbiz');
  });
  it('leaves other companies on their code tile', () => {
    expect(brandLogoFor({ name: 'Hotel Kings Palace', code: 'HK' }, ['HKP'])).toBeNull();
  });
});

describe('branchLogoFor', () => {
  it('puts the KBiz logo on the KBiz360 desk only', () => {
    expect(branchLogoFor('KGD')).toBe('kbiz');
    expect(branchLogoFor('KBIZ')).toBe('kbiz');
    expect(branchLogoFor('BOM')).toBeNull();
    expect(branchLogoFor('OTHER')).toBeNull();
  });
});

describe('resolveCompanyPick', () => {
  it('keeps the remembered tile', () => expect(resolveCompanyPick(['all', 'tk', 'qa'], 'qa')).toBe('qa'));
  it('falls back to All when the remembered one is gone', () => expect(resolveCompanyPick(['all', 'tk'], 'gone')).toBe('all'));
  it('falls back to the first company when there is no All tile', () => expect(resolveCompanyPick(['tk', 'qa'], 'all')).toBe('tk'));
  it('leaves the pick alone when there are no tiles', () => expect(resolveCompanyPick([], 'all')).toBe('all'));
});

describe('branch section folds', () => {
  it('start folded when there are several sections', () => expect(isSectionOpen({}, 'tk', 'BOM', 6)).toBe(false));
  it('start open when there is only one', () => expect(isSectionOpen({}, 'kbiz', 'KGD', 1)).toBe(true));
  it('follow what the person chose, per company tile', () => {
    const open = { [foldKey('tk', 'BOM')]: true, [foldKey('kbiz', 'KGD')]: false };
    expect(isSectionOpen(open, 'tk', 'BOM', 6)).toBe(true);
    expect(isSectionOpen(open, 'all', 'BOM', 6)).toBe(false);
    expect(isSectionOpen(open, 'kbiz', 'KGD', 1)).toBe(false);
  });
  it('open or fold every section of one tile, leaving other tiles and the input alone', () => {
    const before = { [foldKey('qa', 'X')]: true };
    const after = setAllSections(before, 'tk', ['BOM', 'MHUB'], true);
    expect(after).toEqual({ 'qa:X': true, 'tk:BOM': true, 'tk:MHUB': true });
    expect(setAllSections(after, 'tk', ['BOM', 'MHUB'], false)).toEqual({ 'qa:X': true, 'tk:BOM': false, 'tk:MHUB': false });
    expect(before).toEqual({ 'qa:X': true });
  });
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

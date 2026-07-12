import { buildDirectory, codeFromName, iconForName, countryInfo } from '../logic/directory';
import type { DirectoryCompany, DirectoryBranch, DirectoryDepartment } from '../api/directory';

describe('directory adapters', () => {
  it('codeFromName derives a short code', () => {
    expect(codeFromName('Travkings')).toBe('TK'); // override for the known company
    expect(codeFromName('KB Developers')).toBe('KD'); // multi-word → first letters
    expect(codeFromName('Hotel Kings Palace')).toBe('HK');
    expect(codeFromName('Acme Corp')).toBe('AC'); // generic multi-word
    expect(codeFromName('Solo')).toBe('SOL'); // generic single word → 3 letters
    expect(codeFromName('')).toBe('?');
  });

  it('iconForName + countryInfo', () => {
    expect(iconForName('Accounts')).toBe('A');
    expect(countryInfo('India')).toEqual({ flag: '🇮🇳', tz: 'Asia/Kolkata' });
    expect(countryInfo('Kenya').tz).toBe('Africa/Nairobi');
    expect(countryInfo(null)).toEqual({ flag: '🏳️', tz: 'UTC' });
  });

  const companies: DirectoryCompany[] = [
    { id: 'c1', name: 'Travkings', status: 'active' },
    { id: 'c2', name: 'KB Developers', status: 'setup' },
  ];
  const branches: DirectoryBranch[] = [
    { id: 'b1', code: 'AMD', name: 'Ahmedabad', city: 'Ahmedabad', country: 'India', isHO: true, companyId: 'c1' },
    { id: 'b2', code: 'NBO', name: 'Nairobi', city: 'Nairobi', country: 'Kenya', isHO: false, companyId: 'c1' },
  ];
  const departments: DirectoryDepartment[] = [
    { id: 'd1', name: 'Accounts', code: 'ACC', branchId: 'b1' },
    { id: 'd2', name: 'Ticketing', code: 'TKT', branchId: 'b1' },
    { id: 'd3', name: 'Accounts', code: 'ACC', branchId: 'b2' }, // same dept name in another branch
  ];

  it('builds businesses with derived code/colour + branch counts', () => {
    const { businesses } = buildDirectory(companies, branches, departments);
    expect(businesses).toHaveLength(2);
    expect(businesses[0]).toMatchObject({ id: 'c1', code: 'TK', name: 'Travkings', branches: 2, status: 'active' });
    expect(businesses[1]).toMatchObject({ id: 'c2', code: 'KD', branches: 0, status: 'setup' });
    expect(businesses[0].color).toMatch(/^#/);
  });

  it('branches carry companyId + groups built from their departments', () => {
    const { branches: out } = buildDirectory(companies, branches, departments);
    const amd = out.find((b) => b.id === 'b1')!;
    expect(amd.companyId).toBe('c1');
    expect(amd.flag).toBe('🇮🇳');
    expect(amd.groups.map((g) => g.name).sort()).toEqual(['Accounts', 'Ticketing']);
  });

  it('businessDepts groups departments per company, de-duped by name', () => {
    const { businessDepts } = buildDirectory(companies, branches, departments);
    // c1 has Accounts (twice across branches) + Ticketing → deduped to 2 unique names
    expect(businessDepts.c1.map((d) => d.name).sort()).toEqual(['Accounts', 'Ticketing']);
    expect(businessDepts.c2).toEqual([]);
  });
});

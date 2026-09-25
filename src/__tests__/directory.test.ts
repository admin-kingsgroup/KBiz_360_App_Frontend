import { buildDirectory, codeFromName, iconForName, countryInfo } from '../logic/directory';
import type { DirectoryCompany, DirectoryBranch } from '../api/directory';

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
  it('builds businesses with derived code/colour + branch counts', () => {
    const { businesses } = buildDirectory(companies, branches);
    expect(businesses).toHaveLength(2);
    expect(businesses[0]).toMatchObject({ id: 'c1', code: 'TK', name: 'Travkings', branches: 2, status: 'active' });
    expect(businesses[1]).toMatchObject({ id: 'c2', code: 'KD', branches: 0, status: 'setup' });
    expect(businesses[0].color).toMatch(/^#/);
  });

  it('branches carry companyId + country info', () => {
    const { branches: out } = buildDirectory(companies, branches);
    const amd = out.find((b) => b.id === 'b1')!;
    expect(amd.companyId).toBe('c1');
    expect(amd.flag).toBe('🇮🇳');
  });
});

import type { Business, Branch, BizStatus } from '../types';
import type { DirectoryCompany, DirectoryBranch } from '../api/directory';

// Pure adapters: turn the access-scoped CRM directory (companies / branches) into the
// display shapes the Home segments already render. The CRM has no per-org colour/icon/flag, so we
// derive them deterministically. Tested in src/__tests__/directory.test.ts.

const PALETTE = ['#9A6CF0', '#37B6A4', '#4F8BFF', '#E8A13A', '#E3674E', '#2FB36B', '#DB2777', '#0C0E14'];
export const colorForIndex = (i: number): string => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
// Stable colour from an id (so a given company/branch keeps the same colour regardless of
// list position or filtering — positional index drifts as the access-scoped set changes).
export function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return colorForIndex(Math.abs(h));
}

// Preferred short codes for the real Kings Group companies (overrides the derived code so e.g.
// 'Travkings' shows as 'TK' rather than 'TRA'). Keyed by lowercased company name.
const CODE_OVERRIDES: Record<string, string> = {
  travkings: 'TK',
  'quin aliza': 'QA',
  'hotel kings palace': 'HK',
  'kb developers': 'KD',
  'kings logistics': 'KL',
  adb: 'ADB',
  ndb: 'NDB',
};

// Override first (exact OR by leading word, so 'Travkings Tours and Travels' → 'TK'), else: 2-letter
// from a multi-word name, else first 3 alphanumerics.
export function codeFromName(name: string): string {
  const key = (name ?? '').trim().toLowerCase();
  const hit = Object.keys(CODE_OVERRIDES).find((k) => key === k || key.startsWith(`${k} `));
  if (hit) return CODE_OVERRIDES[hit];
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return ((words[0] ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 3) || '?').toUpperCase();
}

export const iconForName = (name: string): string => ((name ?? '').trim()[0] ?? '•').toUpperCase();

// Country → flag + IANA tz for the regions the group operates in; safe fallback otherwise.
const COUNTRY: Record<string, { flag: string; tz: string }> = {
  india: { flag: '🇮🇳', tz: 'Asia/Kolkata' },
  kenya: { flag: '🇰🇪', tz: 'Africa/Nairobi' },
  tanzania: { flag: '🇹🇿', tz: 'Africa/Dar_es_Salaam' },
  uganda: { flag: '🇺🇬', tz: 'Africa/Kampala' },
  uae: { flag: '🇦🇪', tz: 'Asia/Dubai' },
  'united arab emirates': { flag: '🇦🇪', tz: 'Asia/Dubai' },
  drc: { flag: '🇨🇩', tz: 'Africa/Lubumbashi' },
  'dr congo': { flag: '🇨🇩', tz: 'Africa/Lubumbashi' },
  'democratic republic of the congo': { flag: '🇨🇩', tz: 'Africa/Lubumbashi' },
};
export const countryInfo = (country: string | null): { flag: string; tz: string } =>
  COUNTRY[(country ?? '').trim().toLowerCase()] ?? { flag: '🏳️', tz: 'UTC' };

const coerceStatus = (s: string | null): BizStatus => (s === 'setup' ? 'setup' : 'active');

export interface Directory {
  businesses: Business[];
  branches: Branch[]; // each carries companyId so segments can group by business
}

export function buildDirectory(
  companies: DirectoryCompany[],
  branches: DirectoryBranch[],
): Directory {
  const branchCountByCompany = new Map<string, number>();
  branches.forEach((b) => {
    if (!b.companyId) return;
    branchCountByCompany.set(b.companyId, (branchCountByCompany.get(b.companyId) ?? 0) + 1);
  });

  const businesses: Business[] = companies.map((c) => ({
    id: c.id,
    code: codeFromName(c.name),
    name: c.name,
    color: colorForId(c.id),
    branches: branchCountByCompany.get(c.id) ?? 0,
    status: coerceStatus(c.status),
    unread: 0,
    active: true,
  }));

  const outBranches: Branch[] = branches.map((b) => {
    const info = countryInfo(b.country);
    return {
      id: b.id,
      companyId: b.companyId ?? undefined,
      code: b.code ?? codeFromName(b.name ?? b.city ?? 'BR'),
      city: b.city ?? b.name ?? '',
      country: b.country ?? '',
      flag: info.flag,
      tz: info.tz,
      lat: 0,
      lng: 0,
      radius: 150,
      wifi: '',
      color: colorForId(b.id),
      groups: [],
    };
  });

  return { businesses, branches: outBranches };
}

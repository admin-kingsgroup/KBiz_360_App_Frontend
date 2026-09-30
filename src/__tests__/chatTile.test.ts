import { categoryForChat, initialsFor, tileCodeFor, tileColorsFor, tintForCode } from '../logic/chatTile';

describe('categoryForChat', () => {
  it('reads the four kinds off real group names', () => {
    expect(categoryForChat('DAR CRM Support')).toBe('crm');
    expect(categoryForChat('Ticketing DAR/FBM')).toBe('ticket');
    expect(categoryForChat('Marketing TK')).toBe('marketing');
    expect(categoryForChat('KGD ERP')).toBe('erp');
  });

  it('falls back to neutral rather than guessing', () => {
    expect(categoryForChat('Travkings Universal')).toBe('neutral');
    expect(categoryForChat('')).toBe('neutral');
  });

  it('prefers the ticket queue when a name carries two kinds', () => {
    expect(categoryForChat('Ticketing BOM CRM')).toBe('ticket');
  });

  it('needs a whole word, so an unrelated name keeps the neutral tint', () => {
    expect(categoryForChat('Kerpen Logistics')).toBe('neutral'); // not ERP
    expect(categoryForChat('Supported Housing Co')).toBe('neutral'); // not CRM support
  });

  it('gives every category a tint pair', () => {
    (['crm', 'ticket', 'marketing', 'erp', 'neutral'] as const).forEach((c) => {
      const { bg, fg } = tileColorsFor(c);
      expect(bg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(fg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(bg).not.toBe(fg);
    });
  });
});

describe('tileCodeFor', () => {
  it('uses the branch code — what people actually call the room', () => {
    expect(tileCodeFor({ name: 'DAR CRM Support', branchCode: 'dar' })).toBe('DAR');
  });

  it('falls back to the business code when the branch is unknown', () => {
    expect(tileCodeFor({ name: 'Marketing TK', branchCode: null, companyCode: 'MHUB' })).toBe('MHUB');
  });

  it('still labels a row when neither code exists (retired branch, or a direct chat)', () => {
    expect(tileCodeFor({ name: 'Anubhav Nigam' })).toBe('AN');
    expect(tileCodeFor({ name: 'Travkings Universal', branchCode: '' })).toBe('TU');
  });

  it('caps the code so it cannot overflow the 48px tile', () => {
    expect(tileCodeFor({ name: 'x', branchCode: 'LONGBRANCH' })).toHaveLength(4);
  });

  it('never returns an empty label', () => {
    expect(tileCodeFor({ name: '' })).toBe('?');
    expect(initialsFor('   ')).toBe('?');
    expect(initialsFor('#### ????')).toBe('?');
  });
});

// Relative luminance / WCAG contrast — so "every pair clears 4.5:1" is checked, not just asserted
// in a comment next to the palette.
const luminance = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
};
const contrast = (a: string, b: string): number => {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

describe('tintForCode', () => {
  it('gives every room with the same code one tint — the reported bug', () => {
    // Both are KGD rooms; one name carries "ERP" and used to be pulled onto a different tint.
    const erp = tintForCode(tileCodeFor({ name: 'KGD- ERP KBiz360', branchCode: 'KGD' }));
    const wfh = tintForCode(tileCodeFor({ name: 'KGD - WFH Team', branchCode: 'KGD' }));
    const acc = tintForCode(tileCodeFor({ name: 'KGD - Accounts', branchCode: 'KGD' }));
    expect(erp).toEqual(wfh);
    expect(erp).toEqual(acc);
  });

  it('separates different groups', () => {
    expect(tintForCode('KGD')).not.toEqual(tintForCode('TK'));
    expect(tintForCode('BOM')).not.toEqual(tintForCode('DAR'));
  });

  it('ignores case and surrounding space, so a code is one identity', () => {
    expect(tintForCode(' kgd ')).toEqual(tintForCode('KGD'));
  });

  it('is stable across calls and list position', () => {
    expect(tintForCode('MHUB')).toEqual(tintForCode('MHUB'));
  });

  it('falls back rather than crashing on an empty code', () => {
    expect(tintForCode('').bg).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('never hands a real code the near-white fallback — that reads as no tile at all', () => {
    const fallback = tintForCode('').bg;
    ['KGD', 'TK', 'BOM', 'DAR', 'MHUB', 'INB', 'QA', 'HK', 'KD', 'NDB', 'KL', 'ADB', 'AN', 'RS', 'SS']
      .forEach((c) => expect(tintForCode(c).bg).not.toBe(fallback));
  });

  it('every tint it can return clears 4.5:1', () => {
    const codes = ['KGD', 'TK', 'BOM', 'DAR', 'MHUB', 'INB', 'QA', 'HK', 'KD', 'NDB', 'KL', 'ADB', '?', 'AN'];
    const seen = new Set<string>();
    codes.forEach((c) => {
      const { bg, fg } = tintForCode(c);
      seen.add(`${bg}/${fg}`);
      expect(contrast(bg, fg)).toBeGreaterThanOrEqual(4.5);
    });
    expect(seen.size).toBeGreaterThan(1); // the palette is actually being spread, not one colour
  });
});

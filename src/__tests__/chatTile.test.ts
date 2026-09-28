import { categoryForChat, initialsFor, tileCodeFor, tileColorsFor } from '../logic/chatTile';

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

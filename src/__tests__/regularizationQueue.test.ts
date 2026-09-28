import { ageLabel, daysAgo, groupByPerson, isStale, monthLabel, monthsOf, STALE_AFTER_DAYS } from '../logic/regularizationQueue';

const row = (id: string, userId: string, date: string, appliedAt = '2026-09-01T00:00:00Z', extra?: { name?: string; branch?: string }) =>
  ({ id, userId, date, appliedAt, ...extra });

describe('groupByPerson', () => {
  const rows = [
    row('r1', 'u1', '2026-09-12', '2026-09-12T09:00:00Z', { name: 'Ujjwal Singh', branch: 'KGD' }),
    row('r2', 'u2', '2026-09-14', '2026-09-14T09:00:00Z', { name: 'Shadab Ansari', branch: 'HDAR' }),
    row('r3', 'u2', '2026-09-19', '2026-09-19T09:00:00Z', { name: 'Shadab Ansari', branch: 'HDAR' }),
  ];

  it('collects each person into one block', () => {
    const groups = groupByPerson(rows);
    expect(groups.map((g) => g.userId)).toEqual(['u1', 'u2']);
    expect(groups[1].rows.map((r) => r.id)).toEqual(['r2', 'r3']);
    expect(groups[1].branch).toBe('HDAR');
  });

  it('keeps the server order, so the longest-waiting person stays on top', () => {
    const groups = groupByPerson([rows[1], rows[0]]);
    expect(groups.map((g) => g.userId)).toEqual(['u2', 'u1']);
  });

  it('loses nothing', () => {
    expect(groupByPerson(rows).reduce((n, g) => n + g.rows.length, 0)).toBe(rows.length);
    expect(groupByPerson([])).toEqual([]);
  });

  it('labels a person the server could not name', () => {
    const [g] = groupByPerson([row('r9', 'u9', '2026-09-02')]);
    expect(g.name).toBe('Unknown');
    expect(g.branch).toBe('');
  });
});

describe('ageing', () => {
  const now = new Date('2026-09-28T10:00:00Z');

  it('counts whole days waited', () => {
    expect(daysAgo('2026-09-12T09:00:00Z', now)).toBe(16);
    expect(daysAgo('2026-09-21T09:00:00Z', now)).toBe(7);
  });

  it('reads naturally at the near end', () => {
    expect(ageLabel('2026-09-28T09:00:00Z', now)).toBe('today');
    expect(ageLabel('2026-09-27T09:00:00Z', now)).toBe('yesterday');
    expect(ageLabel('2026-09-12T09:00:00Z', now)).toBe('16 days ago');
  });

  it('never goes negative when a device clock runs behind the server', () => {
    expect(daysAgo('2026-09-30T00:00:00Z', now)).toBe(0);
    expect(ageLabel('2026-09-30T00:00:00Z', now)).toBe('today');
  });

  it('survives a timestamp it cannot parse', () => {
    expect(daysAgo('not a date', now)).toBe(0);
  });

  it('turns the chip amber only once a request has really waited', () => {
    expect(isStale('2026-09-21T09:00:00Z', now)).toBe(false); // 7 days
    expect(isStale('2026-09-12T09:00:00Z', now)).toBe(true); // 16 days
    expect(STALE_AFTER_DAYS).toBe(10);
  });
});

describe('month filter', () => {
  it('offers each month present, newest first', () => {
    expect(monthsOf([row('a', 'u', '2026-09-12'), row('b', 'u', '2026-08-30'), row('c', 'u', '2026-09-19')]))
      .toEqual(['2026-09', '2026-08']);
  });

  it('ignores a malformed date rather than offering a junk month', () => {
    expect(monthsOf([row('a', 'u', ''), row('b', 'u', '2026-09-01')])).toEqual(['2026-09']);
  });

  it('labels a month the way the button reads', () => {
    expect(monthLabel('2026-09')).toBe('Sep 2026');
    expect(monthLabel('2026-01')).toBe('Jan 2026');
  });
});

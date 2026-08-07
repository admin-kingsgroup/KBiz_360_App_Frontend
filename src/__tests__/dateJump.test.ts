import { objectIdForTime, firstOnOrAfter, earlierCandidate } from '../logic/dateJump';

describe('objectIdForTime', () => {
  it('builds a valid 24-hex ObjectId whose leading 4 bytes are the unix second', () => {
    const ms = Date.UTC(2026, 0, 1); // 2026-01-01T00:00:00Z
    const id = objectIdForTime(ms);
    expect(id).toHaveLength(24);
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(parseInt(id.slice(0, 8), 16)).toBe(Math.floor(ms / 1000));
    expect(id.slice(8)).toBe('0000000000000000');
  });

  it('orders like time — a later date makes a lexicographically greater id', () => {
    const a = objectIdForTime(Date.UTC(2026, 0, 1));
    const b = objectIdForTime(Date.UTC(2026, 5, 15));
    expect(b > a).toBe(true);
  });

  it('clamps negative input instead of producing a malformed id', () => {
    expect(objectIdForTime(-5000)).toBe('000000000000000000000000');
  });
});

describe('firstOnOrAfter', () => {
  const msg = (id: string, createdAt: string) => ({ id, createdAt });
  const list = [
    msg('a', '2026-08-01T09:00:00Z'),
    msg('b', '2026-08-03T09:00:00Z'),
    msg('c', '2026-08-05T09:00:00Z'),
  ];

  it('returns the first message of the target day when one exists', () => {
    expect(firstOnOrAfter(list, Date.parse('2026-08-03T00:00:00Z'))?.id).toBe('b');
  });

  it('falls forward to the next message when the day itself is empty (WhatsApp behavior)', () => {
    expect(firstOnOrAfter(list, Date.parse('2026-08-04T00:00:00Z'))?.id).toBe('c');
  });

  it('returns null when the date is after everything', () => {
    expect(firstOnOrAfter(list, Date.parse('2026-08-06T00:00:00Z'))).toBeNull();
  });
});

describe('earlierCandidate', () => {
  const a = { id: 'a', createdAt: '2026-08-03T09:00:00Z' };
  const b = { id: 'b', createdAt: '2026-08-04T09:00:00Z' };

  it('prefers the earlier of two candidates (closest to the picked day)', () => {
    expect(earlierCandidate(a, b)?.id).toBe('a');
    expect(earlierCandidate(b, a)?.id).toBe('a');
  });

  it('tolerates either side missing', () => {
    expect(earlierCandidate(a, null)?.id).toBe('a');
    expect(earlierCandidate(null, b)?.id).toBe('b');
    expect(earlierCandidate<{ createdAt: string }>(null, null)).toBeNull();
  });
});

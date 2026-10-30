import type { ErpDirectorDecision } from '../api/erp';
import { REVIEW_FIRST_LOOK_DAYS, decidedAgo, decisionAmount, decisionTitle, isNewDecision, newDecisions, seenFrom, sortDecisions, widgetReviewItems } from '../logic/ownerReview';
import { reviewNewCount } from '../store/ownerReviewStore';

// THE OWNER'S REVIEW (owner, 2026-10-30): what the Director approved — the count is what is new since the Owner last
// opened Review; the widget shows it where everyone else sees Late.
const NOW = Date.parse('2026-10-30T08:00:00.000Z');
const H = 3_600_000;
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * H).toISOString();
const row = (over: Partial<ErpDirectorDecision>): ErpDirectorDecision => ({
  key: 'cr:1', what: 'Payment', subject: 'Dream Holidays · advance', branch: 'HFBM', amount: 5000, currency: 'USD', decidedAt: at(2), maker: 'accounts.drc@travkings.com', ...over,
});

describe('the Owner’s Review', () => {
  const rows = [
    row({ key: 'cr:old', decidedAt: at(10 * 24) }),
    row({ key: 'cr:new', decidedAt: at(1) }),
    row({ key: 'lv:1', what: 'Leave', subject: 'Nandini · 2026-11-02', amount: null, currency: '', decidedAt: at(30) }),
    row({ key: 'cr:notime', decidedAt: null }),
  ];

  it('newest first; a row without a time last', () => {
    expect(sortDecisions(rows).map((r) => r.key)).toEqual(['cr:new', 'lv:1', 'cr:old', 'cr:notime']);
  });

  it('new = approved after the last look; never looked → the last week', () => {
    expect(seenFrom(null, NOW)).toBe(NOW - REVIEW_FIRST_LOOK_DAYS * 24 * H);
    expect(newDecisions(rows, seenFrom(null, NOW)).map((r) => r.key)).toEqual(['cr:new', 'lv:1']);
    expect(newDecisions(rows, NOW - 5 * H).map((r) => r.key)).toEqual(['cr:new']);
    expect(isNewDecision(row({ decidedAt: null }), 0)).toBe(false);
  });

  it('the count is the Owner’s only, and 0 once Review was opened now', () => {
    expect(reviewNewCount({ owner: true, rows, lastSeen: null }, NOW)).toBe(2);
    expect(reviewNewCount({ owner: true, rows, lastSeen: NOW }, NOW)).toBe(0);
    expect(reviewNewCount({ owner: false, rows, lastSeen: null }, NOW)).toBe(0);
  });

  it('what a card and the widget say: title, amount in its currency, how long ago', () => {
    expect(decisionTitle(row({}))).toBe('Payment · Dream Holidays · advance');
    expect(decisionTitle(row({ what: '', subject: '' }))).toBe('Approved by the Director');
    expect(decisionAmount(row({}))).toBe('$5,000');
    expect(decisionAmount(row({ amount: 120000, currency: 'INR' }))).toBe('₹1,20,000');
    expect(decisionAmount(row({ amount: null }))).toBe('');
    expect(decidedAgo(row({ decidedAt: at(3) }), NOW)).toBe('3h ago');
    expect(decidedAgo(row({ decidedAt: at(72) }), NOW)).toBe('3d ago');
  });

  it('the widget carries the new ones only, newest first, at most four', () => {
    const many = Array.from({ length: 6 }, (_, i) => row({ key: `cr:${i}`, decidedAt: at(i + 1) }));
    const items = widgetReviewItems(many, NOW - 24 * H);
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({ id: 'cr:0', title: 'Payment · Dream Holidays · advance', branch: 'HFBM', amount: '$5,000', at: NOW - H });
    expect(widgetReviewItems(many, NOW)).toEqual([]);
  });
});

import type { ErpDirectorDecision } from '../api/erp';
import { erpText, money } from './erpApprovals';

// THE OWNER'S REVIEW (owner, 2026-10-30): "when the Director approves a request, voucher or entry, the Owner had no
// approval in it — make a review section for the Owner so he knows what these people approved; on the widget, Review
// instead of Late". The list is the ERP's "Approved by the Director" (every request whose last signature was the
// Director's). The count is what is NEW since the Owner last opened Review on this phone — opening it sets it back to 0;
// nothing is written to the ERP. The first time, the last 7 days count as new.

/** How far back the list reads (the ERP allows up to 90). */
export const REVIEW_DAYS = 30;
/** Never opened yet: the last week counts as new, not the whole month. */
export const REVIEW_FIRST_LOOK_DAYS = 7;
/** Rows the home-screen widget carries. */
export const REVIEW_WIDGET_CAP = 4;

const DAY = 86_400_000;
const ms = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/** The moment "new" counts from: the last look, or a week ago on a phone that never looked. */
export const seenFrom = (lastSeen: number | null, now: number): number => lastSeen ?? now - REVIEW_FIRST_LOOK_DAYS * DAY;

/** Newest first; a row with no time goes last. */
export function sortDecisions(rows: ErpDirectorDecision[]): ErpDirectorDecision[] {
  return [...rows].sort((a, b) => (ms(b.decidedAt) ?? -Infinity) - (ms(a.decidedAt) ?? -Infinity));
}

/** Approved after `from` (seenFrom) — the Review count. */
export const isNewDecision = (r: ErpDirectorDecision, from: number): boolean => {
  const t = ms(r.decidedAt);
  return t != null && t > from;
};
export const newDecisions = (rows: ErpDirectorDecision[], from: number): ErpDirectorDecision[] =>
  sortDecisions(rows).filter((r) => isNewDecision(r, from));

/** "₹1,20,000" / "$5,000" — '' when the decision carries no amount (an HR change, a leave). */
export const decisionAmount = (r: ErpDirectorDecision): string =>
  r.amount == null || !Number(r.amount) ? '' : money(Number(r.amount), erpText(r.currency));

/** "Payment · Dream Holidays · advance" — what it was, then on whom. */
export const decisionTitle = (r: ErpDirectorDecision): string =>
  [erpText(r.what), erpText(r.subject)].filter(Boolean).join(' · ') || 'Approved by the Director';

/** "3h ago" / "2d ago" from the Director's signature. */
export function decidedAgo(r: ErpDirectorDecision, now: number): string {
  const t = ms(r.decidedAt);
  if (t == null) return '';
  const h = Math.max(0, Math.floor((now - t) / 3_600_000));
  return h < 1 ? 'just now' : h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** A row the widget draws. Kept small: the widget re-reads nothing. */
export interface WidgetReviewItem {
  id: string;
  title: string;
  branch: string;
  amount: string;
  /** The Director's signature, epoch ms. */
  at: number | null;
}

export function widgetReviewItems(rows: ErpDirectorDecision[], from: number, cap = REVIEW_WIDGET_CAP): WidgetReviewItem[] {
  return newDecisions(rows, from).slice(0, cap).map((r) => ({
    id: erpText(r.key) || erpText(r.id),
    title: decisionTitle(r).slice(0, 120),
    branch: erpText(r.branch),
    amount: decisionAmount(r),
    at: ms(r.decidedAt),
  }));
}

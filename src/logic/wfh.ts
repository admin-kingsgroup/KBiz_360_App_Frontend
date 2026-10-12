import type { WfhApplication } from '../api/hr';
import { DAY_RE, MAX_AHEAD_DAYS, MAX_BACK_DAYS, MAX_SPAN_DAYS, shiftDay, spanCount } from './leave';

// Pure helpers behind the work-from-home screen (app/hr/wfh.tsx). An approved WFH day counts as a
// full present day with no check-in (owner, 2026-10-12). The bounds are the leave form's — the
// server applies the same ones, so the form explains a problem instead of bouncing off a 400.

/** Why this WFH draft can't be sent yet — or null when it can. Mirrors the server's leave bounds. */
export function wfhDraftError(draft: { from: string; to: string; reason: string }, today: string): string | null {
  if (!DAY_RE.test(draft.from)) return 'Pick the first day';
  if (!DAY_RE.test(draft.to)) return 'Pick the last day';
  if (draft.to < draft.from) return 'The last day can’t be before the first';
  if (!draft.reason.trim()) return 'Say why — the reason goes to the approvers';
  if (spanCount(draft.from, draft.to) > MAX_SPAN_DAYS) return `One application covers at most ${MAX_SPAN_DAYS} days`;
  if (draft.from < shiftDay(today, -MAX_BACK_DAYS)) return 'That is too far back — ask HR to record it';
  if (draft.to > shiftDay(today, MAX_AHEAD_DAYS)) return 'That is more than a year ahead';
  return null;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Waiting on Review (FM) · FM ✓" — the pending line shared by WFH and swaps ('' when nothing waits). */
export function waitingLine(r: { status: string; waitingOn?: string; signedBy?: string[] }): string {
  if (r.status !== 'pending') return '';
  const signed = (r.signedBy ?? []).filter(Boolean).map((s) => `${s} ✓`).join(' · ');
  if (!r.waitingOn) return signed;
  return signed ? `Waiting on ${r.waitingOn} · ${signed}` : `Waiting on ${r.waitingOn}`;
}

/** The decision line under a WFH application ('' while pending). */
export function wfhDecisionLine(a: Pick<WfhApplication, 'status' | 'decisionNote' | 'decidedRole' | 'markedDays' | 'skippedDays'>): string {
  if (a.status === 'approved') {
    const skipped = a.skippedDays ?? [];
    const marked = a.markedDays ?? [];
    return `Approved · ${plural(marked.length, 'day')} marked WFH${skipped.length ? ` · ${skipped.length} skipped (${[...new Set(skipped.map((s) => s.reason))].join(', ')})` : ''}`;
  }
  if (a.status === 'rejected') {
    const by = a.decidedRole ? ` by ${a.decidedRole}` : '';
    return a.decisionNote ? `Rejected${by} — ${a.decisionNote}` : `Rejected${by}`;
  }
  if (a.status === 'cancelled') return 'Withdrawn';
  return '';
}

/** Days covered by a WFH ask still waiting on the chain — month view marks them "WFH requested". */
export function pendingWfhDays(apps: Array<Pick<WfhApplication, 'status' | 'from' | 'to'>> | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const a of apps ?? []) {
    if (a.status !== 'pending' || !DAY_RE.test(a.from) || !DAY_RE.test(a.to) || a.to < a.from) continue;
    for (let d = a.from; d <= a.to; d = shiftDay(d, 1)) out.add(d);
  }
  return out;
}

/** A paid-leave row — work from home and swaps share the ERP's collection but are not leave. */
export const isPaidLeaveRow = (a: { kind?: string }): boolean => a.kind !== 'wfh' && a.kind !== 'swap';

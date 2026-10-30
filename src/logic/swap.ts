import type { SwapRequest, SwapSaturday } from '../api/hr';
import { dayLabel } from './leave';

// Pure helpers behind "Swap Saturday" (app/hr/swap.tsx). Owner, 2026-10-12: staff on alternate
// Saturdays may exchange two Saturdays with a colleague. The applicant WORKS one of their own
// week-off Saturdays and takes one of their working Saturdays off; the partner does the opposite.
// The partner accepts in the app first, then BM → Director → FM sign it on the ERP. The server
// decides every rule; these only decide what to show and which Saturdays to offer.

type Fmt = (day: string) => string;
/** The chain level that rejected it, as people say it. */
const ROLE_SHORT: Record<string, string> = { FinanceManager: 'FM', Director: 'Director', Owner: 'Owner' };

/** One Saturday in a picker: whether it can be chosen, and why not ('' when it can). */
export interface SaturdayChoice { day: string; enabled: boolean; note: string }

/** The Saturdays offered at a step of a new swap:
 *  - 'work' — your own week-off Saturdays (you'll work one of them);
 *  - 'off'  — your working Saturdays (you'll take one off), never the one already picked to work.
 *  A Saturday that is already spoken for stays listed, disabled, with the server's reason. */
export function swapChoices(upcoming: SwapSaturday[] | null | undefined, step: 'work' | 'off', picked = ''): SaturdayChoice[] {
  const wantOff = step === 'work';
  return (upcoming ?? [])
    .filter((s) => s.off === wantOff && s.day !== picked)
    .map((s) => ({ day: s.day, enabled: !s.busy, note: s.busy || '' }));
}

/** Why a new swap can't be sent yet — or null when it can. */
export function swapDraftError(d: { workDay: string; offDay: string; partnerUserId: string; reason: string }): string | null {
  if (!d.workDay) return 'Pick the Saturday you’ll work';
  if (!d.offDay) return 'Pick the Saturday you’ll take off';
  if (d.workDay === d.offDay) return 'Pick two different Saturdays';
  if (!d.partnerUserId) return 'Pick who you’re swapping with';
  if (!d.reason.trim()) return 'Say why — the reason goes to the approvers';
  return null;
}

/** The other person in the swap, from the viewer's side. */
export const swapCounterpart = (r: Pick<SwapRequest, 'role' | 'applicant' | 'partner'>): string =>
  (r.role === 'partner' ? r.applicant?.name : r.partner?.name) || 'your colleague';

/** An incoming ask the viewer still has to answer (Accept / Decline). */
export const awaitsMyAnswer = (r: Pick<SwapRequest, 'role' | 'status' | 'partnerStatus'>): boolean =>
  r.role === 'partner' && r.status === 'pending' && r.partnerStatus === 'pending';

/** Only the applicant may withdraw, and only while the swap is pending. */
export const canWithdrawSwap = (r: Pick<SwapRequest, 'role' | 'status'>): boolean => r.role === 'applicant' && r.status === 'pending';

/** "Asha asks to swap Saturdays — you'd be OFF Sat 17 Oct and WORK Sat 24 Oct". */
export function incomingAskText(r: Pick<SwapRequest, 'applicant' | 'you'>, fmt: Fmt = dayLabel): string {
  return `${r.applicant?.name || 'A colleague'} asks to swap Saturdays — you’d be OFF ${fmt(r.you.off)} and WORK ${fmt(r.you.work)}`;
}

/** "You work Sat 17 Oct · off Sat 24 Oct" — the viewer's two days (conditional while not approved). */
export function yourDaysText(r: Pick<SwapRequest, 'status' | 'you'>, fmt: Fmt = dayLabel): string {
  const verb = r.status === 'approved' ? 'You work' : r.status === 'pending' ? 'You’d work' : 'You were to work';
  return `${verb} ${fmt(r.you.work)} · off ${fmt(r.you.off)}`;
}

/** "Swap with Bilal Khan" (mine) / "Asked by Asha" (incoming). */
export const swapWhoText = (r: Pick<SwapRequest, 'role' | 'applicant' | 'partner'>): string =>
  r.role === 'partner' ? `Asked by ${swapCounterpart(r)}` : `Swap with ${swapCounterpart(r)}`;

export type SwapTone = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface SwapStatusView { label: string; tone: SwapTone }

/** The status chip on a swap card. */
export function swapStatus(r: Pick<SwapRequest, 'status' | 'partnerStatus' | 'decidedRole'>): SwapStatusView {
  switch (r.status) {
    case 'approved': return { label: 'Approved', tone: 'approved' };
    case 'cancelled': return { label: 'Withdrawn', tone: 'cancelled' };
    case 'rejected': return { label: r.decidedRole === 'Partner' || r.partnerStatus === 'declined' ? 'Declined' : 'Rejected', tone: 'rejected' };
    default: return { label: r.partnerStatus === 'accepted' ? 'Accepted · with approvers' : 'Waiting for partner', tone: 'pending' };
  }
}

/** The line under a swap: who it waits on while pending, else what was decided ('' when nothing to say). */
export function swapProgressLine(r: Pick<SwapRequest, 'role' | 'applicant' | 'partner' | 'status' | 'partnerStatus' | 'partnerNote' | 'decisionNote' | 'decidedRole' | 'waitingOn' | 'signedBy'>): string {
  const other = swapCounterpart(r);
  if (r.status === 'pending') {
    if (r.partnerStatus === 'pending') return r.role === 'partner' ? 'Waiting on you to accept' : `Waiting on ${other} to accept`;
    const signed = (r.signedBy ?? []).filter(Boolean).map((s) => `${s} ✓`).join(' · ');
    const who = r.role === 'partner' ? 'You accepted' : `${other} accepted`;
    const wait = r.waitingOn ? `waiting on ${r.waitingOn}` : 'with the approvers';
    return `${who} · ${wait}${signed ? ` · ${signed}` : ''}`;
  }
  if (r.status === 'approved') return 'Approved — both calendars now show the swap';
  if (r.status === 'cancelled') return r.role === 'partner' ? `${other} withdrew it` : 'You withdrew it';
  // rejected — by the partner, or by a level of the chain
  if (r.decidedRole === 'Partner' || r.partnerStatus === 'declined') {
    const note = r.partnerNote || '';
    const who = r.role === 'partner' ? 'You declined' : `${other} declined`;
    return note ? `${who} — ${note}` : who;
  }
  const by = r.decidedRole ? ` by ${ROLE_SHORT[r.decidedRole] ?? r.decidedRole}` : '';
  return r.decisionNote ? `Rejected${by} — ${r.decisionNote}` : `Rejected${by}`;
}

/** The "My swaps" list: every swap I asked for plus the incoming ones I've already answered (or that
 *  were decided / withdrawn), newest first. Asks still waiting on my answer live in "Requests for you". */
export function swapHistory(mine: SwapRequest[] | null | undefined, incoming: SwapRequest[] | null | undefined): SwapRequest[] {
  const seen = new Set<string>();
  const out: SwapRequest[] = [];
  for (const r of [...(mine ?? []), ...(incoming ?? []).filter((x) => !awaitsMyAnswer(x))]) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out.sort((a, b) => String(b.appliedAt || '').localeCompare(String(a.appliedAt || '')));
}

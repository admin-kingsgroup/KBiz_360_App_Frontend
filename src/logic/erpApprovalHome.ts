import { APPROVAL_TABS, type ApprovalTab } from './erpApprovalTabs';

// The Approvals home (owner, 2026-11-19: "a lot of extra stuff"). The screen used to open on three rows of controls — the
// branch chips, the ERP's eight tabs, and "Waiting on me" doors that linked to those same tabs — plus a summary card and an
// empty "Requests at your step (0)". Now it opens on ONE list: each ERP section once, in the ERP's order, with what needs
// this person on top. The sections, their names and their order are still the ERP's (logic/erpApprovalTabs).

/** A row of the home list: an ERP section, the Owner's Review, or the app's own requests. */
export type HomeKey = Exclude<ApprovalTab, 'mine'> | 'app';
export interface HomeRow {
  key: HomeKey; title: string; hint: string;
  /** At this person's step — the row moves to "Needs you" and its number is filled in. */
  mine: number;
  /** Everything waiting in the section, whoever holds it. null: the read failed or is shut, so no figure. */
  waiting: number | null;
}

export const HOME_TITLE: Record<HomeKey, string> = {
  ...(Object.fromEntries(APPROVAL_TABS.filter((t) => t.key !== 'mine').map((t) => [t.key, t.label])) as Record<Exclude<ApprovalTab, 'mine' | 'review'>, string>),
  review: 'Review', app: 'App requests',
};
const HINT: Record<HomeKey, string> = {
  entries: 'Vouchers and bookings to approve', pay: 'Payments, supplier bank, credit', hr: 'Leave, WFH, time corrections', setup: 'Settings, masters, targets',
  close: 'Month close', status: 'Who is holding what', rr: 'Concerns and their replies', review: 'Approved by the Director', app: 'Requests raised in the app',
};

/** The list, top to bottom: the ERP's sections in its order, Review for the Owner, the app's requests last. The app's requests
 *  have a row only while one is waiting (owner's team, 2026-11-19: "there is no app request for now") — it comes back by
 *  itself, under "Needs you", when one is raised. */
export function homeRows(i: { mine: Partial<Record<HomeKey, number>>; waiting: Partial<Record<HomeKey, number | null>>; owner: boolean; app?: boolean }): HomeRow[] {
  const keys: HomeKey[] = APPROVAL_TABS.map((t) => t.key).filter((k): k is Exclude<ApprovalTab, 'mine'> => k !== 'mine');
  if (i.owner) keys.push('review');
  if (i.app && (i.mine.app ?? 0) > 0) keys.push('app');
  return keys.map((key) => ({ key, title: HOME_TITLE[key], hint: HINT[key], mine: Math.max(0, i.mine[key] ?? 0), waiting: i.waiting[key] === undefined ? null : i.waiting[key] ?? null }));
}

/** What is at this person's step, section by section — the old "Waiting on me" doors' figures, plus each request at their
 *  step in the section that lists it. The entries queue counts only for someone who approves entries. */
export function homeMine(a: {
  approver: boolean; entries: number; margin: number; edits: number;
  /** Requests at my step that each section lists (a Below GP review is already in `margin` for an approver). */
  entryRequests: number; payRequests: number; hrRequests: number; setupRequests: number;
  credit: number; leave: number; close: number; move: number; review: number; app?: number;
}): Record<HomeKey, number> {
  return {
    entries: (a.approver ? a.entries + a.margin + a.edits : 0) + a.entryRequests, pay: a.credit + a.payRequests, hr: a.leave + a.hrRequests, setup: a.setupRequests,
    close: a.close, status: 0, rr: a.move, review: a.review, app: a.app ?? 0,
  };
}

/** The two groups on screen; every row is in exactly one. */
export function splitHome(rows: HomeRow[]): { needsMe: HomeRow[]; rest: HomeRow[] } {
  return { needsMe: rows.filter((r) => r.mine > 0), rest: rows.filter((r) => r.mine <= 0) };
}

/** How VoiceOver reads a row: its name, its number, and what the number means. */
export function homeRowLabel(r: HomeRow): string {
  if (r.mine > 0) return `${r.title}, ${r.mine} ${r.mine === 1 ? 'needs' : 'need'} you`;
  if (r.waiting == null) return r.title;
  return r.waiting ? `${r.title}, ${r.waiting} waiting on others` : `${r.title}, nothing waiting`;
}

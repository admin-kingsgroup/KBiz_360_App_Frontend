// The Approvals tab shows EVERY decision waiting on the viewer, from whichever system raised it:
// approval requests (/api/approvals) and attendance time corrections (/api/hr/regularizations).
// They come from unrelated endpoints with unrelated shapes, so both are normalised to one row here
// before the screen ever sees them. Pure + tested (src/__tests__/approvalQueue.test.ts).

import type { Approval } from '../api/approvals';
import type { Regularization } from '../api/hr';

export type QueueKind = 'approval' | 'time-correction';
export type QueueStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface QueueItem {
  /** Unique across both sources — an approval and a correction could share a raw id. */
  id: string;
  kind: QueueKind;
  sourceId: string;
  personId: string;
  personName: string;
  /** Under the name in the group header: a role for an approval, a branch for a correction. */
  personSubtitle: string;
  title: string;
  /** Leading half of the meta line, always plain. */
  meta: string;
  /** Trailing half — muted, or amber when `metaWarn` (a correction that leaves the day open). */
  metaTail: string;
  metaWarn: boolean;
  /** The requester's own words: an approval's details, a correction's reason. */
  note: string;
  status: QueueStatus;
  /** When it was raised — what the ageing chip counts from while pending. */
  at: string;
  decidedAt: string | null;
  /** Whether THIS viewer may decide it. Controls the tick box and both buttons. */
  canAct: boolean;
}

const asStatus = (v: string): QueueStatus =>
  v === 'approved' || v === 'rejected' || v === 'cancelled' ? v : 'pending';

/** "1:00 pm" in the viewer's locale, or the empty string for an open punch. */
const fmtTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

const fmtDay = (key: string): string => {
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
};

/** Where a pending approval has reached in its chain: "Level 1 of 2 · Faiz Patel". */
export function chainText(record: Approval): string {
  if (record.status !== 'pending') return '';
  const waiting = record.currentApprovers?.length
    ? record.currentApprovers.map((p) => p.name).join(', ')
    : record.currentApprover?.name ?? '';
  const level = record.currentLevel ?? record.currentStep;
  const total = record.totalLevels ?? record.totalSteps;
  if (level && total) return waiting ? `Level ${level} of ${total} · ${waiting}` : `Level ${level} of ${total}`;
  return waiting ? `Waiting on ${waiting}` : 'Awaiting a decision';
}

export function approvalToItem(record: Approval): QueueItem {
  return {
    id: `approval:${record.id}`,
    kind: 'approval',
    sourceId: record.id,
    personId: record.requester.id,
    personName: record.requester.name,
    personSubtitle: record.requester.position ?? '',
    title: record.title,
    meta: record.category,
    metaTail: chainText(record),
    metaWarn: false,
    note: record.details ?? '',
    status: asStatus(record.status),
    at: record.submittedAt,
    decidedAt: record.decidedAt,
    // The server decides who may act; `canAct` is already viewer-specific.
    canAct: !!record.canAct && record.status === 'pending',
  };
}

export function regularizationToItem(record: Regularization): QueueItem {
  const openOut = record.checkOutAt === null;
  return {
    id: `time-correction:${record.id}`,
    kind: 'time-correction',
    sourceId: record.id,
    personId: record.userId,
    personName: record.name ?? 'Unknown',
    personSubtitle: record.branch ?? '',
    title: fmtDay(record.date),
    meta: `In ${fmtTime(record.checkInAt)}`,
    // An open punch-out is the case this feature exists for and the part a reviewer must look at,
    // so it is called out in amber rather than buried mid-sentence.
    metaTail: openOut ? 'Out missing' : `Out ${fmtTime(record.checkOutAt)}`,
    metaWarn: openOut,
    note: record.reason ?? '',
    status: asStatus(record.status),
    at: record.appliedAt,
    decidedAt: record.decidedAt,
    // Only the super admin ever reaches this endpoint (the server 403s everyone else), so anything
    // still pending that came back is the viewer's to decide.
    canAct: record.status === 'pending',
  };
}

/**
 * Merge both sources into one queue, newest first. Time corrections and approvals are independent
 * streams, so interleaving by age is the only ordering that means anything across them — a request
 * raised this morning should not sit below one from last month just because of which system it
 * came from.
 *
 * Deduplicated by id, first occurrence winning. The corrections queue is assembled from one request
 * per status, and a server that does not understand the `status` query answers all three with the
 * same pending list — which would otherwise render every correction three times over. Deduping here
 * keeps the screen correct against both the old and the new backend, so the two can deploy in
 * either order.
 */
export function buildQueue(approvals: Approval[], corrections: Regularization[]): QueueItem[] {
  const items = [...approvals.map(approvalToItem), ...corrections.map(regularizationToItem)];
  const seen = new Set<string>();
  return items
    .filter((item) => !seen.has(item.id) && seen.add(item.id))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

import type { ReminderRecord } from '../data/reminders';
import { isOverdueReminder } from './reminderDashboard';

// One reminder as the person who wrote it sees it. The server fans a multi-person reminder out
// into ONE document per assignee (each completes / is reviewed on its own), so "Anubhav → Abc,
// Xyz, Efg" arrives as three records. Owner 2026-10-07: show it ONCE, with every assignee on the
// line. A bundle is those copies folded back together.
export interface ReminderBundle {
  /** Stable key for React lists: the first member's id. */
  key: string;
  byId: string;
  byName: string;
  text: string;
  dueAt?: string;
  image?: string;
  /** The copies, one per assignee, sorted by assignee name. */
  members: ReminderRecord[];
  overdue: boolean;
}

/** Seconds since the epoch, read from a Mongo ObjectId (its first 4 bytes are the creation time).
 *  The reminder DTO carries no createdAt, but every id is an ObjectId. null for anything else. */
export const objectIdSeconds = (id: string): number | null =>
  /^[0-9a-f]{24}$/i.test(id) ? parseInt(id.slice(0, 8), 16) : null;

/** Copies written by one create call land within the same second or two; 5 s is generous but still
 *  far tighter than anyone re-typing the same reminder by hand. */
export const BUNDLE_WINDOW_SECONDS = 5;

const signature = (r: ReminderRecord): string =>
  [r.byId, (r.text || r.title || '').trim(), r.dueAt ?? '', r.image ?? ''].join('\u0001');

/** Fold the per-assignee copies of each reminder back into one bundle. Copies match when they have
 *  the same creator, text, due time and picture AND were created within BUNDLE_WINDOW_SECONDS of
 *  the first copy. Records without an ObjectId never merge. Order of the result follows the order
 *  of each bundle's first member in `items`, so a caller's sort is kept. */
export function bundleReminders(items: ReminderRecord[]): ReminderBundle[] {
  const bySig = new Map<string, Array<{ start: number; bundle: ReminderBundle }>>();
  const out: ReminderBundle[] = [];
  const seen = new Set<string>();
  for (const r of items) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    const secs = objectIdSeconds(r.id);
    const sig = signature(r);
    const open = secs === null ? undefined
      : bySig.get(sig)?.find((c) => Math.abs(secs - c.start) <= BUNDLE_WINDOW_SECONDS
        && !c.bundle.members.some((m) => m.forId === r.forId));
    if (open) {
      open.bundle.members.push(r);
      open.bundle.overdue = open.bundle.overdue || isOverdueReminder(r);
      continue;
    }
    const bundle: ReminderBundle = {
      key: r.id, byId: r.byId, byName: r.byName || 'Someone', text: (r.text || r.title || '').trim(),
      dueAt: r.dueAt, image: r.image, members: [r], overdue: isOverdueReminder(r),
    };
    out.push(bundle);
    if (secs !== null) bySig.set(sig, [...(bySig.get(sig) ?? []), { start: secs, bundle }]);
  }
  for (const b of out) b.members.sort((a, c) => (a.forName || '').localeCompare(c.forName || ''));
  return out;
}

export type MyTaskSection = 'self' | 'forme' | 'team';

/** Where a bundle sits under "My Task":
 *  - self:  I wrote it for myself only (Anubhav → Anubhav)
 *  - forme: someone else wrote it and I am one of the assignees
 *  - team:  I wrote it for at least one other person (I may be on it too)
 *  null = none of mine (visible only through User/Branch wise, e.g. to a super admin). */
export function myTaskSection(b: ReminderBundle, meId: string): MyTaskSection | null {
  if (!meId) return null;
  if (b.byId === meId) return b.members.every((m) => m.forId === meId) ? 'self' : 'team';
  return b.members.some((m) => m.forId === meId) ? 'forme' : null;
}

/** "Anubhav → Abc, Xyz, Efg". A finished copy (waiting for the creator's approval) reads "Xyz ✓". */
export function bundlePeopleLine(b: ReminderBundle): string {
  const names = b.members.map((m) => `${m.forName || 'Unassigned'}${m.state === 'review' ? ' ✓' : ''}`);
  return `${b.byName} → ${names.join(', ')}`;
}

/** The copies the viewer can tick off: their own pending ones (the server lets only the assignee
 *  complete a copy). */
export const completableMembers = (b: ReminderBundle, meId: string): ReminderRecord[] =>
  b.members.filter((m) => m.forId === meId && m.state === 'pending');

/** Only the creator may edit (server rule); editing a bundle edits every copy. */
export const canEditBundle = (b: ReminderBundle, meId: string): boolean =>
  !!meId && b.byId === meId && b.members.some((m) => m.state === 'pending');

/** Status word for a bundle in the PDF: Overdue, Pending, or Done (awaiting approval) once every
 *  copy is finished. */
export function bundleStatus(b: ReminderBundle): string {
  if (b.members.every((m) => m.state !== 'pending')) return 'Done';
  return b.overdue ? 'Overdue' : 'Pending';
}

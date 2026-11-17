// The Chats tab's Groups view: a business dropdown and a branch dropdown that opens on "All
// branches", and the group list under them (the branch tiles of option 6B, 2026-10-07, became a
// dropdown on 2026-11-17).
// These are the parts of it that decide WHAT shows; the components only draw it.

/** The strip's "every branch" pick. Never a real branch code (those are short upper-case words). */
export const ALL_BRANCHES = '*';

/** The tile to show as picked: the remembered branch while it still has a tile, else All. The old
 *  chip row opened on its first chip, which hid every other branch's unread groups behind chips. */
export function resolveStripPick(codes: readonly string[], remembered?: string): string {
  return remembered && codes.includes(remembered) ? remembered : ALL_BRANCHES;
}

// The Africa branches were re-coded with an H prefix (shared branches rows say HNBO/HDAR/HFBM since
// 2026-09-16), but rooms created before that are still named "NBO - …".
const LEGACY_CODE: Record<string, string> = { HNBO: 'NBO', HDAR: 'DAR', HFBM: 'FBM' };

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A room's name without the branch code the screen already shows for it: under the BOM tile,
 * "BOM - Ticketing" reads "Ticketing". Only a leading code followed by a separator is taken
 * ("BOMBAY Team" stays whole), and a name that would be left empty is returned unchanged.
 */
export function stripBranchPrefix(name: string, code: string): string {
  const codes = [code, LEGACY_CODE[code]].filter((c): c is string => !!c);
  for (const c of codes) {
    const m = new RegExp(`^\\s*${escapeRe(c)}\\s*[-–—:|]\\s*(\\S.*)$`, 'i').exec(name);
    if (m) return m[1].trim();
  }
  return name;
}

/** A group preview led by who wrote it, by first name, the way WhatsApp lists groups:
 *  "Sana Shaikh" + "Will do the needful" → "Sana: Will do the needful". No name → the text alone. */
export function withSender(preview: string, senderName?: string | null): string {
  const first = String(senderName ?? '').trim().split(/\s+/)[0];
  return first ? `${first}: ${preview}` : preview;
}

/** Pinned rooms first, then newest activity first. Does not touch the input. */
export function orderGroups<T extends { pinned?: boolean; ts?: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, z) => Number(!!z.pinned) - Number(!!a.pinned) || (z.ts ?? 0) - (a.ts ?? 0));
}

/**
 * The business a group is listed under — the same rule GroupsList files it by: its branch's
 * business, else the business stamped on the group, else the first business on screen.
 */
export function groupBizId(
  g: { branchId?: string | null; companyId?: string | null },
  branchBiz: ReadonlyMap<string, string>,
  fallbackBizId: string,
): string {
  return (g.branchId && branchBiz.get(g.branchId)) || g.companyId || fallbackBizId;
}

export interface ScopeCounts {
  groups: number;
  branches: number;
  /** Groups with unread inside the scope. */
  unread: number;
  /** Groups with unread in the businesses NOT shown — so picking one business never hides new messages. */
  unreadElsewhere: number;
}

/** Counts for the switcher row and the business sheet. `bizId` 'all' covers every business. */
export function scopeCounts(
  groups: readonly { bizId: string; branchId?: string | null; unread?: number }[],
  bizId: string,
): ScopeCounts {
  const inScope = bizId === 'all' ? groups : groups.filter((g) => g.bizId === bizId);
  return {
    groups: inScope.length,
    branches: new Set(inScope.map((g) => g.branchId ?? '')).size,
    unread: inScope.filter((g) => (g.unread ?? 0) > 0).length,
    unreadElsewhere: bizId === 'all' ? 0 : groups.filter((g) => g.bizId !== bizId && (g.unread ?? 0) > 0).length,
  };
}

/**
 * Groups with unread in the branches NOT on screen — the dot on the branch dropdown, as
 * `unreadElsewhere` is for the business one, so narrowing to one branch never hides new messages.
 * Nothing under All: every branch is on screen.
 */
export function unreadOutsidePick(branches: readonly { code: string; unread: number }[], pick: string): number {
  return pick === ALL_BRANCHES ? 0 : branches.reduce((n, b) => (b.code === pick ? n : n + b.unread), 0);
}

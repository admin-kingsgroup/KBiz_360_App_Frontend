// Filing of real group chats under the Groups tab's branch chips.
//
// A group is stored with the `branchId` it was created under, but the chips come from the org
// directory, which reads the shared `branches` collection at request time. The two can disagree:
// a branch row can be deleted or retired in the ERP/CRM (the INB row went missing from KingsDB
// on 2026-09-01 and took 21 groups with it), or a freshly created branch may not be synced yet.
// Such groups must stay reachable — they are filed under a synthetic "Other" chip instead of
// silently disappearing, which is what happened before this existed.

/** Chip code for groups whose branch the directory does not know. Never a real branch code. */
export const OTHER_CHIP = 'OTHER';

export function splitUnfiledGroups<T extends { branchId?: string | null }>(
  groups: T[],
  knownBranchIds: Iterable<string>,
): { filed: T[]; unfiled: T[] } {
  const known = new Set(knownBranchIds);
  const filed: T[] = [];
  const unfiled: T[] = [];
  for (const g of groups) (g.branchId && known.has(g.branchId) ? filed : unfiled).push(g);
  return { filed, unfiled };
}

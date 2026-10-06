// The Groups list's branch-chip row when more than one business is on screen ("All" business pill).
//
// Each business files its groups under its own branches, but the chip row is ONE row for the whole
// list: picking BOM must leave only BOM's groups on screen, whatever business they belong to. Before
// this existed every business drew its own chip row — and hid it when it had a single branch — so
// a BOM pick filtered only Travkings while Quin Aliza (OTHER) and KBiz360 (KGD) kept rendering
// underneath, which read as the filter not working (reported 2026-10-06).

/** One chip per branch code across every business, in first-seen order. A code that appears under
 *  several businesses (the synthetic OTHER chip can) becomes a single chip whose items are the
 *  union, so its unread badge counts all of them. */
export function mergeBranchChips<I, T extends { code: string; items: I[] }>(blocks: { subs: T[] }[]): T[] {
  const byCode = new Map<string, T>();
  for (const bl of blocks) {
    for (const s of bl.subs) {
      const seen = byCode.get(s.code);
      if (seen) byCode.set(s.code, { ...seen, items: [...seen.items, ...s.items] });
      else byCode.set(s.code, { ...s, items: [...s.items] });
    }
  }
  return [...byCode.values()];
}

/** The chip to show as selected: the remembered pick while it still exists, else the first chip. */
export function resolveSelectedChip<T extends { code: string }>(chips: T[], remembered?: string): T | null {
  if (!chips.length) return null;
  return chips.find((c) => c.code === remembered) ?? chips[0];
}

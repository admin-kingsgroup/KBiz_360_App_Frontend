// Personal arrangement of the Groups tab's branch chips. The saved order is per business and
// device-local (a preference, not org data): branches the user arranged come first in their order,
// and any branch NOT in the saved list (new branch, or one that gained its first group later)
// keeps its natural directory position after them — it must never vanish just because it was
// unknown when the user last arranged.

export function applyBranchOrder<T extends { code: string }>(subs: T[], saved?: string[]): T[] {
  if (!saved?.length) return subs;
  const rank = new Map(saved.map((c, i) => [c, i]));
  const arranged = subs.filter((s) => rank.has(s.code)).sort((a, b) => rank.get(a.code)! - rank.get(b.code)!);
  const rest = subs.filter((s) => !rank.has(s.code));
  return [...arranged, ...rest];
}

/** Swap `code` with its neighbour. Returns the same array when the move would fall off an end. */
export function moveCode(codes: string[], code: string, delta: -1 | 1): string[] {
  const i = codes.indexOf(code);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= codes.length) return codes;
  const next = codes.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

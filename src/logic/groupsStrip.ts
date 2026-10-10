// The Chats tab's Groups view. Company-first since 2026-10-10 (owner): a row of company logo tiles
// on top, then the picked company's groups under branch sections that fold open and shut. (Before
// that: option 6B of the redesign canvas — a business switcher title and a strip of branch tiles.)
// These are the parts of it that decide WHAT shows; the components only draw it.

/** The bundled logos a company tile can wear (assets/brands). */
export type BrandLogo = 'travkings' | 'quinaliza' | 'kbiz';

/**
 * Which logo a company wears. The CRM has no logo field, so it goes by the company's name, else its
 * short code. KBiz360 is also known by its desk, KGD — the owner's rule: "for KGD use the KBiz logo".
 * No match → null, and the tile shows the code on its tint as before.
 */
export function brandLogoFor(biz: { name: string; code?: string }, branchCodes: readonly string[] = []): BrandLogo | null {
  const name = String(biz.name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const code = String(biz.code ?? '').toUpperCase();
  if (name.includes('travkings') || code === 'TK') return 'travkings';
  if (/quin ?aliza/.test(name) || code === 'QA') return 'quinaliza';
  if (name.includes('kbiz') || branchCodes.some((c) => branchLogoFor(c) === 'kbiz')) return 'kbiz';
  return null;
}

/** A branch section that wears a logo instead of its code: KGD is KBiz360's desk (KBIZ is the code the
 *  app gives that desk when it has to create it — see the backend's directory service). */
export const branchLogoFor = (code: string): BrandLogo | null => (code === 'KGD' || code === 'KBIZ' ? 'kbiz' : null);

/** The company tile on screen: the remembered pick while it is still a tile, else All when there is
 *  an All tile, else the first company. No tiles → the remembered pick unchanged. */
export function resolveCompanyPick(tileIds: readonly string[], remembered: string): string {
  if (!tileIds.length || tileIds.includes(remembered)) return remembered;
  return tileIds.includes('all') ? 'all' : tileIds[0];
}

/** One branch section's key in the open/shut map — per company tile ('all' has its own). */
export const foldKey = (bizId: string, code: string): string => `${bizId}:${code}`;

/** Is a branch section open? The person's own choice wins; otherwise sections start folded, so a
 *  company reads as its list of branches — except a lone section, which starts open (folding the
 *  only section would leave nothing on screen). */
export function isSectionOpen(open: Readonly<Record<string, boolean>>, bizId: string, code: string, sections: number): boolean {
  const k = foldKey(bizId, code);
  return k in open ? !!open[k] : sections === 1;
}

/** Open (or fold) every section under one company tile at once. Does not touch the input. */
export function setAllSections(
  open: Readonly<Record<string, boolean>>, bizId: string, codes: readonly string[], to: boolean,
): Record<string, boolean> {
  const next = { ...open };
  for (const c of codes) next[foldKey(bizId, c)] = to;
  return next;
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

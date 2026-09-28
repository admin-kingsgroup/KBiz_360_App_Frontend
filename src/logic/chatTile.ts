import { colors } from '../theme/colors';

// The approved Chats list draws each row against a rounded code tile — a short branch/business
// code on a tint that says what KIND of conversation it is (support desk, ticket queue, marketing,
// ERP). Both halves are derived, because a conversation carries neither: the CRM has no per-chat
// colour or category, so the rules below are the whole source of truth. Pure + tested
// (src/__tests__/chatTile.test.ts) so the mapping can be argued about without rendering a list.

export type ChatTileCategory = 'crm' | 'ticket' | 'marketing' | 'erp' | 'neutral';

// Matched in order — a name like "Ticketing DAR/FBM CRM" is a ticket queue first. Word-ish
// boundaries keep "Kerp Traders" out of `erp` and "Tickets" inside it.
const CATEGORY_RULES: { cat: Exclude<ChatTileCategory, 'neutral'>; re: RegExp }[] = [
  { cat: 'ticket', re: /\bticket(s|ing)?\b/i },
  { cat: 'erp', re: /\berp\b/i },
  { cat: 'marketing', re: /\bmarket(ing)?\b|\bmktg?\b/i },
  { cat: 'crm', re: /\bcrm\b|\bsupport\b|\bhelp\s?desk\b/i },
];

/** Which tint a conversation's tile takes, read off its name. 'neutral' = no rule matched. */
export function categoryForChat(name: string): ChatTileCategory {
  const n = String(name ?? '');
  return CATEGORY_RULES.find((r) => r.re.test(n))?.cat ?? 'neutral';
}

// Tint pairs from the design canvas. Every foreground clears 4.5:1 on its own background, so the
// code stays readable at 12px — the tiles are labels, not decoration.
const TINTS: Record<ChatTileCategory, { bg: string; fg: string }> = {
  crm: { bg: colors.primarySoft, fg: colors.primary },
  ticket: { bg: colors.warnSoft, fg: colors.warn },
  marketing: { bg: '#EFEAFD', fg: '#5B34C9' },
  erp: { bg: '#E8F0FD', fg: '#1D4ED8' },
  neutral: { bg: colors.coolMuted, fg: colors.textBody },
};

export const tileColorsFor = (cat: ChatTileCategory): { bg: string; fg: string } => TINTS[cat];

/** Initials for a person or an uncoded group: one letter per word, at most two. */
export function initialsFor(name: string): string {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const letters = words.slice(0, 2).map((w) => w.replace(/[^A-Za-z0-9]/g, '')[0] ?? '').join('');
  return (letters || '?').toUpperCase();
}

/**
 * The code shown on the tile. A group belongs to a branch (and a branch has a real short code in
 * the CRM — INB, BOM, DAR…), so that code wins: it is what people call the room. Falling back
 * through the business code to initials keeps every row labelled even when a group's branch was
 * retired from the directory (see logic/groupFiling.ts) or a chat is a direct message.
 * Capped at 4 characters — the tile is 48px wide and the code is bold.
 */
export function tileCodeFor(chat: { name: string; branchCode?: string | null; companyCode?: string | null }): string {
  const code = (chat.branchCode || chat.companyCode || '').trim();
  if (code) return code.toUpperCase().slice(0, 4);
  return initialsFor(chat.name).slice(0, 4);
}

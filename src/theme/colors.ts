// Exact values from source theme object `C`. Single source of truth for the palette.
export const colors = {
  purple: '#9A6CF0', cream: '#D8D3C8', blue: '#4F8BFF', teal: '#37B6A4', orange: '#E8A13A', coral: '#E3674E',
  tkTint: '#E8DCFB', qaTint: '#D6F0EA', hkTint: '#DBE7FA', kdTint: '#FAE2C2', kgTint: '#F4D9D0', ndbTint: '#DCF5E8', klTint: '#FBE0EE',
  ink: '#0C0E14', ink2: '#171B26', panel: '#171B26', line: '#262B39', paper: '#F4F1EA',
  canvas: '#F4F1EA', card: '#FFFFFF', cardEdge: '#EBE4D6', warmMute: '#9B8F7A',
  textMuted: '#6D6D72', textMuted2: '#7E8497', hair: '#EBE4D6', success: '#22C55E', danger: '#DC2626',
  ticketTint: '#DBE7FA', accountTint: '#FDEBC9', holidayTint: '#D6F0EA', mgmtTint: '#E5E5E8', mktgTint: '#FCDDE3',
  // WhatsApp-style chat redesign — green accent + cool neutrals for the Chats screen and bottom-nav chrome.
  // Retune the whole look here (e.g. swap `primary` to the brand teal #37B6A4) without touching components.
  primary: '#128C7E', primaryDark: '#0E6E63', primarySoft: '#E7F3F2', accent: '#25D366',
  coolBg: '#F8F9FB', coolMuted: '#EEF1F4', coolDivider: '#ECECEC', coolText: '#6B7280', coolText3: '#9CA3AF',
} as const;

export type ColorToken = keyof typeof colors;

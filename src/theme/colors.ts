// Exact values from source theme object `C`. Single source of truth for the palette.
export const colors = {
  purple: '#9A6CF0', cream: '#D8D3C8', blue: '#4F8BFF', teal: '#37B6A4', orange: '#E8A13A', coral: '#E3674E',
  tkTint: '#E8DCFB', qaTint: '#D6F0EA', hkTint: '#DBE7FA', kdTint: '#FAE2C2', kgTint: '#F4D9D0', ndbTint: '#DCF5E8', klTint: '#FBE0EE',
  ink: '#0C0E14', ink2: '#171B26', panel: '#171B26', line: '#262B39', paper: '#F4F1EA',
  canvas: '#F4F1EA', card: '#FFFFFF', cardEdge: '#EBE4D6', warmMute: '#9B8F7A',
  textMuted: '#6D6D72', textMuted2: '#7E8497', hair: '#EBE4D6', success: '#22C55E', danger: '#DC2626',
  ticketTint: '#DBE7FA', accountTint: '#FDEBC9', holidayTint: '#D6F0EA', mgmtTint: '#E5E5E8', mktgTint: '#FCDDE3',
  // Approved design canvas "KBiz 360 — approved screens" (2026-09-28): the green accent + cool
  // neutral ramp the Chats and Time-corrections screens are drawn against.
  // Retune the whole look here (e.g. swap `primary` back to the brand teal #37B6A4) without touching components.
  primary: '#0B6E60', primaryDark: '#08584D', primarySoft: '#E7F4F1', accent: '#25D366',
  coolBg: '#F8F9FB', coolMuted: '#F2F4F7', coolDivider: '#EAECF0', coolText: '#5B6472', coolText3: '#98A2B3',
  // Design ramp, continued. `textBody` is the secondary reading colour (4.5:1 on white — the muted
  // `coolText` is for labels and metadata, not body copy); `borderStrong` outlines pressable chrome
  // (unselected chips, the month button) where a divider hairline would read as decoration.
  textBody: '#344054', borderStrong: '#E4E7EC', surfaceSubtle: '#F6F7F5', rowUnread: '#FBFEFD',
  // Amber = "needs attention but not an error" (a missing punch-out, a request ageing in the queue).
  warn: '#A4400B', warnSoft: '#FDF0E6',
  // Red has three roles and three values: text/label, the outline on a destructive ghost button,
  // and the notification dot. `danger` above stays the fill for solid destructive buttons.
  dangerText: '#B42318', dangerEdge: '#F0C3BD', dangerDot: '#D92D20',
  // Delivery ticks stay blue — green is the brand accent here, so read receipts need their own hue.
  tick: '#1570EF',
} as const;

export type ColorToken = keyof typeof colors;

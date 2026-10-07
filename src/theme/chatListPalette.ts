import type { ChatTheme } from './chatThemes';

// The Chats list painted from the GLOBAL chat theme, so the list and the conversations it opens read
// as one surface. Per-chat overrides deliberately do not apply here — a list shows many chats at once.
//
// Approved on the "Chats List Themes" demo (2026-10-03): read rows on a LIGHT TINT of the theme
// colour, unread rows on the FULL theme colour so they read darker. 2026-10-07 (owner): a hairline
// divider after every row, like WhatsApp. Choices that are not obvious:
//   - the tint is the canvas taken 60% of the way toward `bar` (white on the light themes, the dark
//     bar on Midnight), so it stays the theme's own hue rather than a neutral grey.
//   - read ticks use `accent`, not `tick`: `tick` is tuned for the SENT BUBBLE (light blue on a dark
//     fill) and drops to 1.4:1 on the light canvases.
//   - the unread time takes `accent` only where it reads at 4.5:1 on the canvas; otherwise the text
//     colour (Eclipse's accent is 3.8:1 on its canvas).
//   - the divider is WhatsApp's list-border slate rgb(134,150,160), translucent so it reads the same on
//     the read tint and the darker unread ground. WhatsApp's own strength (17% light / 15% dark) was
//     too faint on the owner's phone (2026-10-07), so it is doubled: 35% light, 30% dark.
// `__tests__/chatTheme.test.ts` asserts these pairings for every theme.
export interface ChatListPalette {
  /** Dark list: the status bar flips to light content. */
  dark: boolean;
  /** Header, search band and filter chips. */
  bar: string;
  /** The header/list boundary and outlined-chip borders. */
  line: string;
  /** Names, titles, selected-off chip labels. */
  text: string;
  /** Previews, timestamps, secondary icons. */
  mute: string;
  /** The search field on the bar. */
  field: string;
  /** Read rows and the list body: a light tint of the theme colour. */
  list: string;
  /** Unread rows: the full theme colour. */
  rowUnread: string;
  /** Hairline between rows (WhatsApp's list border, translucent). */
  divider: string;
  /** Time on an unread row. */
  unreadTime: string;
  /** Selected chip, unread badges, read ticks. */
  accent: string;
  /** Text and icons on an `accent` fill. */
  onAccent: string;
}

/** `a` moved `w` (0-1) of the way toward `b`, both #RRGGBB. */
export const mixHex = (a: string, b: string, w: number): string =>
  '#' + [1, 3, 5].map((i) => {
    const v = Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - w) + parseInt(b.slice(i, i + 2), 16) * w);
    return v.toString(16).padStart(2, '0');
  }).join('').toUpperCase();

/** WCAG contrast ratio between two #RRGGBB colours. */
export const contrastRatio = (a: string, b: string): number => {
  const lum = (hex: string): number => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const x = parseInt(hex.slice(i, i + 2), 16) / 255;
      return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** WhatsApp's chat-list border slate, at twice WhatsApp's opacity (theirs was too faint on device). */
export const DIVIDER_LIGHT = 'rgba(134,150,160,0.35)';
export const DIVIDER_DARK = 'rgba(134,150,160,0.3)';

/** How far the read-row tint moves from the canvas toward the bar. */
export const READ_ROW_TINT = 0.6;

export const chatListPalette = (t: ChatTheme): ChatListPalette => ({
  dark: t.dark,
  bar: t.bar,
  line: t.line,
  text: t.chromeText,
  mute: t.mute,
  field: t.input,
  list: mixHex(t.canvas, t.bar, READ_ROW_TINT),
  rowUnread: t.canvas,
  divider: t.dark ? DIVIDER_DARK : DIVIDER_LIGHT,
  unreadTime: contrastRatio(t.accent, t.canvas) >= 4.5 ? t.accent : t.chromeText,
  accent: t.accent,
  onAccent: t.bar,
});

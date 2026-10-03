import { CHAT_THEMES, chatThemeFor, DEFAULT_CHAT_THEME, type ChatTheme } from '../theme/chatThemes';
import { chatListPalette } from '../theme/chatListPalette';

// The colour rules these palettes were built to, asserted rather than eyeballed.
//
// This exists because the first draft was judged by eye and nine of ten themes failed: the default
// had its sent and received bubbles 2.2 ΔE apart, which reads as a single surface. A theme added by
// eye later would reintroduce exactly that, and nobody would notice until it shipped.

// ── sRGB → OKLab, for perceptual distance between two large fills ──
const lin = (c: number): number => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};
const rgb = (hex: string): [number, number, number] =>
  [lin(parseInt(hex.slice(1, 3), 16)), lin(parseInt(hex.slice(3, 5), 16)), lin(parseInt(hex.slice(5, 7), 16))];

function oklab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Perceptual distance ×100. Counts a hue change as separation the way the eye does. */
export function deltaE(a: string, b: string): number {
  const x = oklab(a), y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
}

/** WCAG relative luminance contrast ratio. */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r, g, bl] = rgb(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The three big fills a conversation shows at once, as pairs. */
const surfacePairs = (t: ChatTheme): [string, number][] => [
  ['canvas/received', deltaE(t.canvas, t.them)],
  ['canvas/sent', deltaE(t.canvas, t.mine)],
  ['received/sent', deltaE(t.them, t.mine)],
];

describe('chat themes', () => {
  it.each(CHAT_THEMES.map((t) => [t.label, t] as const))(
    '%s keeps all three surfaces separable (min 8 ΔE)',
    (_label, theme) => {
      for (const [pair, dist] of surfacePairs(theme)) {
        // Below ~8 the two fills start reading as one; below 4 they are indistinguishable.
        expect({ pair, dist: Number(dist.toFixed(1)) }).toMatchObject({ pair });
        expect(dist).toBeGreaterThanOrEqual(8);
      }
    },
  );

  it.each(CHAT_THEMES.map((t) => [t.label, t] as const))(
    '%s keeps body text legible on both bubbles (WCAG 4.5:1)',
    (_label, theme) => {
      expect(contrast(theme.them, theme.themText)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.mine, theme.meText)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(CHAT_THEMES.map((t) => [t.label, t] as const))(
    '%s keeps the sender name readable on the received bubble',
    (_label, theme) => {
      // Group chats print the sender inside the received bubble — on Eclipse that bubble is dark
      // while the accent is tuned for a light app bar, which is why senderName is its own token.
      expect(contrast(theme.them, theme.senderName)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(CHAT_THEMES.map((t) => [t.label, t] as const))(
    '%s keeps the composer pill readable against the canvas it floats on',
    (_label, theme) => {
      // The composer sits on the canvas with no chrome band behind it, so the pill is a card on
      // the thread. `input` is NOT usable here — it measures 3.4-7.1 ΔE against these canvases,
      // which is why `pill` exists. Guard it the same way the bubbles are guarded.
      expect(deltaE(theme.pill, theme.canvas)).toBeGreaterThanOrEqual(8);
    },
  );

  it.each(CHAT_THEMES.map((t) => [t.label, t] as const))(
    '%s keeps chrome text legible on the app bar and the composer pill',
    (_label, theme) => {
      // The bug this guards: chrome was painted with `themText`, the RECEIVED BUBBLE's ink. On
      // Eclipse that bubble is dark while the bar and pill are white, so the header title, its
      // icons and every character typed came out near-white on white.
      expect(contrast(theme.bar, theme.chromeText)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.pill, theme.chromeText)).toBeGreaterThanOrEqual(4.5);
      // The placeholder and composer icons ride on the same surfaces at a lower weight.
      expect(contrast(theme.pill, theme.mute)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(CHAT_THEMES.map((t) => [t.label, t] as const))(
    '%s keeps the Chats list legible when it wears the theme',
    (_label, theme) => {
      const p = chatListPalette(theme);
      // Read rows sit on a light tint, unread rows on the full canvas — names and previews on both.
      for (const ground of [p.list, p.rowUnread]) {
        expect(contrast(ground, p.text)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(ground, p.mute)).toBeGreaterThanOrEqual(4.5);
        // Read ticks are icons on either row ground (WCAG non-text 3:1). This is why they use the
        // accent: the theme's own `tick` is tuned for the sent bubble and is 1.4:1 on Ink's canvas.
        expect(contrast(ground, p.accent)).toBeGreaterThanOrEqual(3);
      }
      // There are no row dividers, so the two grounds alone must tell read from unread.
      expect(deltaE(p.list, p.rowUnread)).toBeGreaterThanOrEqual(theme.dark ? 2 : 4);
      // The unread row's time.
      expect(contrast(p.rowUnread, p.unreadTime)).toBeGreaterThanOrEqual(4.5);
      // Selected chips, unread and muted badges.
      expect(contrast(p.accent, p.onAccent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.mute, p.onAccent)).toBeGreaterThanOrEqual(4.5);
      // Search placeholder on its field.
      expect(contrast(p.field, p.mute)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(CHAT_THEMES.filter((t) => t.meQuote || t.themLink || t.bubbleBorderWidth).map((t) => [t.label, t] as const))(
    '%s overrides keep quotes, mentions and links readable on their bubble',
    (_label, theme) => {
      // The overrides exist only because the shared colours vanished on this theme's bubbles, so an
      // override that is itself unreadable would defeat its purpose.
      if (theme.meQuote) expect(contrast(theme.mine, theme.meQuote)).toBeGreaterThanOrEqual(4.5);
      if (theme.themLink) expect(contrast(theme.them, theme.themLink)).toBeGreaterThanOrEqual(4.5);
      if (theme.bubbleBorderWidth) expect(theme.bubbleBorderWidth).toBeGreaterThan(0);
    },
  );

  it('Royal rings both bubbles in visible gold', () => {
    const royal = chatThemeFor('royal');
    expect(royal.themBorder).toBe('#C9A227');
    expect(royal.mineBorder).toBe('#C9A227');
    expect(royal.bubbleBorderWidth).toBe(1.5);
  });

  it('every theme carries a unique key and a label', () => {
    const keys = CHAT_THEMES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of CHAT_THEMES) expect(t.label.length).toBeGreaterThan(0);
  });

  describe('chatThemeFor', () => {
    it('resolves a known key', () => {
      expect(chatThemeFor('midnight').label).toBe('Midnight');
    });

    it('falls back for null, undefined and the seven retired wallpaper keys', () => {
      const fallback = CHAT_THEMES.find((t) => t.key === DEFAULT_CHAT_THEME)!;
      expect(chatThemeFor(null)).toBe(fallback);
      expect(chatThemeFor(undefined)).toBe(fallback);
      // Anyone who themed a chat before this change still holds one of these.
      for (const retired of ['default', 'mint', 'sand', 'rose', 'sky', 'lilac', 'paper']) {
        expect(chatThemeFor(retired)).toBe(fallback);
      }
    });
  });
});

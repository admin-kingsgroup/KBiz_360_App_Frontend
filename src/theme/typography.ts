import type { TextStyle } from 'react-native';

// Source serif stack: "'Fraunces', Georgia, serif". Loaded via expo-font at the app edge.
export const fonts = {
  serif: 'Fraunces',
  serifFallback: 'Georgia',
} as const;

/**
 * Apple's iOS text styles, one Text Size step below the default — Apple's "Medium" Dynamic Type sizes
 * (Human Interface Guidelines › Typography). In the system font (San Francisco) that this app uses.
 * Take a size from here instead of writing a number: by 2026-11 the app had 25 hand-set sizes, most
 * of them 11–14 pt, and read small and uneven beside WhatsApp on the iPhone Duo. The default ("Large",
 * body 17) then read too big beside WhatsApp (owner, 2026-11-17: "font size is very big compare to
 * the whatsapp"), so the scale sits one step down, where WhatsApp reads.
 *
 * Letter spacing is the font's own: San Francisco tightens itself at each size, and React Native gets
 * that (a 17-pt name measured 198.8 pt on the simulator against 199.5 pt for native text). Do not add
 * letterSpacing to running text.
 *
 * Spread one into a style — `{ color, ...textStyles.body }` — and add `fontWeight` after it where a
 * screen needs a different weight. Text inputs take only `fontSize` (a lineHeight on an iOS TextInput
 * moves its caret). Weight is part of a style only where it is not regular: headline is semibold as
 * Apple's is, and the titles are bold, as Apple's navigation titles are.
 *
 * The phone's own Text Size setting still scales all of these (React Native's allowFontScaling).
 */
export const textStyles = {
  largeTitle: { fontSize: 33, lineHeight: 40, fontWeight: '700' },
  title1: { fontSize: 27, lineHeight: 33, fontWeight: '700' },
  title2: { fontSize: 21, lineHeight: 26, fontWeight: '700' },
  title3: { fontSize: 19, lineHeight: 24, fontWeight: '600' },
  headline: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 21 },
  callout: { fontSize: 15, lineHeight: 20 },
  subheadline: { fontSize: 14, lineHeight: 19 },
  footnote: { fontSize: 12, lineHeight: 16 },
  caption1: { fontSize: 11, lineHeight: 13 },
  caption2: { fontSize: 11, lineHeight: 13 },
} as const satisfies Record<string, TextStyle>;

export type TextStyleName = keyof typeof textStyles;

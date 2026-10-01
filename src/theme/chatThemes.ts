// Chat themes — the per-conversation palette: canvas, both bubbles, the accent and the chrome.
// Replaces the old flat `wallpapers.ts`, which carried a background colour and nothing else.
//
// Why a theme is sixteen values rather than one: a chat shows three large fills at once (canvas,
// received bubble, sent bubble) and every pair has to be separable on its own. The old palette
// failed that badly — its sent and received bubbles sat 2.2 ΔE apart, so only the alignment told
// them apart. Every palette below clears a floor of 8 ΔE on the *worst* of the three pairs, and
// 4.5:1 WCAG for text on both bubble fills. `__tests__/chatTheme.test.ts` asserts both, so a theme
// added by eye fails the build rather than shipping.
//
// Device-local, like the wallpapers before them: nothing here syncs to the server.
export interface ChatTheme {
  key: string;
  label: string;
  /** Dark canvas: the status bar flips to light content and the watermark carries more opacity. */
  dark: boolean;

  /** Thread background. */
  canvas: string;
  /** Received bubble: fill, border, message text, and the muted colour for its timestamp + day pill. */
  them: string;
  themBorder: string;
  themText: string;
  thMute: string;
  /** Sent bubble: fill, border, message text, and the muted colour for its timestamp + ticks. */
  mine: string;
  mineBorder: string;
  meText: string;
  meMute: string;
  /** Send button, reply rails, active chips. Judged against `bar`, which is where it sits. */
  accent: string;
  /** Sender name inside a group's received bubble. Split from `accent` because the bubble may be
   *  dark while the bar underneath the accent is light (Eclipse) — one value cannot serve both. */
  senderName: string;
  /** Text and icons ON the chrome — app-bar title, its back/search/menu glyphs, and what you type
   *  in the composer. Distinct from `themText`, which is text on the RECEIVED BUBBLE: Eclipse has a
   *  dark bubble under a white bar, so using the bubble's light ink on the bar made the whole header
   *  and the typed message invisible. One value serves both surfaces because `bar` and `pill` are
   *  always the same side of light/dark within a theme. */
  chromeText: string;
  /** The composer pill. Its own token because the pill sits on the CANVAS, not on the chrome:
   *  `input` measures only 3.4-7.1 ΔE against the canvas on the light themes, so a pill filled
   *  with it dissolves into the thread. This is the elevated surface — white on the light themes,
   *  a lifted grey on Midnight, where a white pill would be the brightest thing on the screen. */
  pill: string;
  /** Chrome: app bar fill, dividers, and the sunken input used on chrome surfaces. */
  bar: string;
  line: string;
  input: string;
  /** Muted text on the chrome — app-bar subtitle, composer placeholder. Never on a bubble. */
  mute: string;
  /** Read receipts. Needs its own value: blue ticks vanish on a near-black sent bubble. */
  tick: string;
  /** Centre hub of the brand mark. The six blades always keep the brand palette. */
  watermarkHub: string;
}

export const CHAT_THEMES: ChatTheme[] = [
  {
    key: 'slate', label: 'Slate', dark: false,
    canvas: '#D3DAE0',
    them: '#FFFFFF', themBorder: '#0C0E14', themText: '#101519', thMute: '#4A545C',
    mine: '#A8C2CE', mineBorder: '#88A8B7', meText: '#101519', meMute: '#2B444F',
    accent: '#31606F', senderName: '#31606F',
    chromeText: '#101519',
    pill: '#FFFFFF',
    bar: '#FFFFFF', line: '#CAD2D9', input: '#EDF1F4',
    mute: '#4A545C', tick: '#2F6FD0', watermarkHub: '#101519',
  },
  {
    key: 'ink', label: 'Ink & Paper', dark: false,
    canvas: '#E4E4E0',
    them: '#FFFFFF', themBorder: '#0C0E14', themText: '#0C0E14', thMute: '#45464B',
    // A near-black sent bubble takes a white ring — the cut-out card that gives this theme its name.
    mine: '#1B1D24', mineBorder: '#FFFFFF', meText: '#FFFFFF', meMute: '#A7A9B0',
    accent: '#0C0E14', senderName: '#0C0E14',
    chromeText: '#0C0E14',
    pill: '#FFFFFF',
    bar: '#FFFFFF', line: '#0C0E14', input: '#EFEFEC',
    mute: '#45464B', tick: '#9CC4FF', watermarkHub: '#0C0E14',
  },
  {
    key: 'blueprint', label: 'Blueprint', dark: false,
    // Ink & Paper's bubbles on Sky's canvas, with the ring taking Sky's accent rather than white:
    // white reads 76.8 ΔE on the fill but only 8.8 on this canvas, so it was strong inside and
    // faint outside. #2560BC balances at 30.7 / 43.3.
    canvas: '#D9E4F1',
    them: '#FFFFFF', themBorder: '#0C0E14', themText: '#0C0E14', thMute: '#45464B',
    mine: '#1B1D24', mineBorder: '#2560BC', meText: '#FFFFFF', meMute: '#A7A9B0',
    accent: '#0C0E14', senderName: '#0C0E14',
    chromeText: '#0C0E14',
    pill: '#FFFFFF',
    bar: '#FFFFFF', line: '#0C0E14', input: '#EEF3F9',
    mute: '#45464B', tick: '#9CC4FF', watermarkHub: '#0C0E14',
  },
  {
    key: 'eclipse', label: 'Eclipse', dark: false,
    // Midnight's dark bubbles on a pale canvas. The one theme where chrome and bubbles disagree:
    // `mute` is dark (it sits on a white bar), `thMute` is light (it sits on a dark bubble).
    canvas: '#DCE3E9',
    them: '#232C36', themBorder: '#2E3944', themText: '#E9EDF2', thMute: '#A3ADB6',
    mine: '#0C5B4C', mineBorder: '#147763', meText: '#EAF6F2', meMute: '#9CCBBF',
    accent: '#0E7F66', senderName: '#35D3A6',
    chromeText: '#0F1418',
    pill: '#FFFFFF',
    bar: '#FFFFFF', line: '#D3DBE2', input: '#EDF1F4',
    mute: '#4E5862', tick: '#6FB0FF', watermarkHub: '#0C0E14',
  },
  {
    key: 'midnight', label: 'Midnight', dark: true,
    canvas: '#080C10',
    them: '#232C36', themBorder: '#2E3944', themText: '#E9EDF2', thMute: '#A3ADB6',
    mine: '#0C5B4C', mineBorder: '#147763', meText: '#EAF6F2', meMute: '#9CCBBF',
    accent: '#1FB688', senderName: '#1FB688',
    chromeText: '#E9EDF2',
    pill: '#222A33',
    bar: '#141A20', line: '#252D36', input: '#222A33',
    mute: '#A3ADB6', tick: '#6FB0FF', watermarkHub: '#FFFFFF',
  },
];

/** The theme a chat falls back to when nothing is set — and when a retired key is still stored. */
export const DEFAULT_CHAT_THEME = 'slate';

/** Resolve a stored key. Unknown or retired keys (the seven dropped wallpapers) land on the default
 *  rather than throwing, so an old per-chat choice degrades quietly instead of breaking the screen. */
export const chatThemeFor = (key: string | null | undefined): ChatTheme =>
  CHAT_THEMES.find((t) => t.key === key) ?? CHAT_THEMES.find((t) => t.key === DEFAULT_CHAT_THEME)!;

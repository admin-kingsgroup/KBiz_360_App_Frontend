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
import { mixHex } from './chatListPalette';

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

  // ── Optional overrides. Omitted = the long-standing behaviour, so the older themes are untouched. ──
  /** Bubble border width. Default: a hairline. Royal draws its gold ring at 1.5 so it actually shows. */
  bubbleBorderWidth?: number;
  /** Reply-quote rail/name and @mentions inside the SENT bubble. Default: `senderName`, which is tuned
   *  for the received bubble and can vanish on a dark sent fill (Royal: dark gold on navy, 2.7:1). */
  meQuote?: string;
  /** Links inside the RECEIVED bubble. Default: `tick`, which is tuned for the sent bubble and can
   *  vanish on a white received fill (Royal: bright gold on white, 1.9:1). */
  themLink?: string;
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
  {
    key: 'royal', label: 'Royal', dark: false,
    // The brand theme: a navy sent bubble with a gold ring on an ivory canvas. Bright gold never
    // carries text on ivory or white — it is only the ring, the watermark hub and the ticks on navy;
    // text-weight gold is the darker #7A5F0E (4.73:1 on the canvas).
    // The design's ivory #EFE8D6 measured 7.3 ΔE against the white received bubble — under the floor
    // (the design page quoted 12.4 from a different ΔE formula). #EAE3D1 is 3 steps darker: 8.7 ΔE.
    canvas: '#EAE3D1',
    // Both bubbles wear the gold ring, at 1.5 — a hairline of it (and the old beige #D8CFB8 on the
    // received side) did not show on a phone. Approved on the Royal Chat Screen demo, 2026-10-03.
    them: '#FFFFFF', themBorder: '#C9A227', themText: '#1B1F3B', thMute: '#6B6450',
    mine: '#1B1F3B', mineBorder: '#C9A227', meText: '#F5EFD9', meMute: '#C9B98A',
    accent: '#7A5F0E', senderName: '#7A5F0E',
    chromeText: '#1B1F3B',
    pill: '#FFFFFF',
    bar: '#FFFFFF', line: '#DDD4BF', input: '#F5F1E6',
    mute: '#5E5640', tick: '#E0B84A', watermarkHub: '#C9A227',
    bubbleBorderWidth: 1.5,
    // Light gold for quotes/mentions on the navy bubble (8.5:1); dark gold for links on white (6.0:1).
    meQuote: '#E0B84A', themLink: '#7A5F0E',
  },
];

/** How far an open chat's background moves from the theme canvas toward its bar — the canvas painted
 *  at ~50% opacity over the bar (white on the light themes, the lifted dark bar on Midnight).
 *  Owner 2026-10-07: the full-strength canvases were too heavy behind a conversation. */
export const CHAT_CANVAS_SOFTEN = 0.5;

/** The background an open chat actually paints (thread + composer band, and the theme previews).
 *  `canvas` itself stays the full colour: the Chats list's unread rows and the bubble-contrast tests
 *  still key on it. */
export const chatCanvas = (t: ChatTheme): string => mixHex(t.canvas, t.bar, CHAT_CANVAS_SOFTEN);

/** The theme a chat falls back to when nothing is set — and when a retired key is still stored. */
export const DEFAULT_CHAT_THEME = 'slate';

/** Resolve a stored key. Unknown or retired keys (the seven dropped wallpapers) land on the default
 *  rather than throwing, so an old per-chat choice degrades quietly instead of breaking the screen. */
export const chatThemeFor = (key: string | null | undefined): ChatTheme =>
  CHAT_THEMES.find((t) => t.key === key) ?? CHAT_THEMES.find((t) => t.key === DEFAULT_CHAT_THEME)!;

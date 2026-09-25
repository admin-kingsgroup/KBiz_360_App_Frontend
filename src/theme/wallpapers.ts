// Chat wallpapers — the per-chat backdrop WhatsApp lets you change. Flat tones rather than images:
// they cost nothing to store or render, stay legible behind white message cards in every chat, and
// need no native build to ship. `bg` is the canvas; `swatch` is what the picker shows.
export interface Wallpaper { key: string; label: string; bg: string; swatch: string }

export const WALLPAPERS: Wallpaper[] = [
  { key: 'default', label: 'Default', bg: '#ECEFF3', swatch: '#ECEFF3' },
  { key: 'mint', label: 'Mint', bg: '#E7F2EE', swatch: '#CDE7DF' },
  { key: 'sand', label: 'Sand', bg: '#F3EEE6', swatch: '#E6D9C4' },
  { key: 'rose', label: 'Rose', bg: '#F6EBEE', swatch: '#EBCFD7' },
  { key: 'sky', label: 'Sky', bg: '#E9EFF6', swatch: '#CBDCEF' },
  { key: 'lilac', label: 'Lilac', bg: '#EFEBF6', swatch: '#D8CFEB' },
  { key: 'slate', label: 'Slate', bg: '#E4E7EA', swatch: '#C3CAD1' },
  { key: 'paper', label: 'Paper', bg: '#F7F5F2', swatch: '#EDE8E1' },
];

export const wallpaperFor = (key: string | undefined): Wallpaper =>
  WALLPAPERS.find((w) => w.key === key) ?? WALLPAPERS[0];

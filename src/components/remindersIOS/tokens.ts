// Design tokens from the iOS Reminders handoff (light theme only — the app is light).
// Values are exact per the handoff; don't round them to the app theme.

export const T = {
  bg: '#F2F2F7',
  card: '#FFFFFF',
  ink: '#000000',
  sub: 'rgba(60,60,67,0.6)',
  sep: 'rgba(60,60,67,0.15)',
  fill: 'rgba(118,118,128,0.12)',
  ring: 'rgba(60,60,67,0.3)',
  accent: '#2f6fed',
  overdue: '#e8483f',
  flag: '#f59e0b',
  allGray: '#8e8e93',
  placeholder: 'rgba(120,120,128,0.6)',
} as const;

export interface BranchPaletteEntry {
  dot: string;
  bg: string;
  fg: string;
}

// Branch badge colors — assigned in branch order, cycle of 8 (per handoff).
export const BRANCH_PALETTE: BranchPaletteEntry[] = [
  { dot: '#2f6fed', bg: 'rgba(47,111,237,0.13)', fg: '#1d4ed8' },
  { dot: '#e8483f', bg: 'rgba(232,72,63,0.13)', fg: '#c2382f' },
  { dot: '#f59e0b', bg: 'rgba(245,158,11,0.16)', fg: '#b45309' },
  { dot: '#7a5af8', bg: 'rgba(122,90,248,0.13)', fg: '#6d28d9' },
  { dot: '#0f9d76', bg: 'rgba(15,157,118,0.14)', fg: '#047857' },
  { dot: '#d946a8', bg: 'rgba(217,70,168,0.13)', fg: '#be185d' },
  { dot: '#0891b2', bg: 'rgba(8,145,178,0.13)', fg: '#0e7490' },
  { dot: '#ea7317', bg: 'rgba(234,115,23,0.14)', fg: '#9a3412' },
];

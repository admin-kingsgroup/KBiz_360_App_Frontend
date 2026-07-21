// Display-time helpers (pure). tzTime/timeAgo extracted verbatim from source.
export function tzTime(tz: string): string {
  try {
    return new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function timeAgo(t: number): string {
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Whole-calendar-day difference (local time), ignoring the wall clock. now→now = 0, yesterday = 1.
const dayDiff = (t: number, now: number): number => {
  const startOf = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((startOf(new Date(now)) - startOf(new Date(t))) / 86_400_000);
};

// WhatsApp list-style stamp for an event/message time: TODAY → clock time (2:34 PM), YESTERDAY →
// "Yesterday", OLDER → the actual date ("26 May", plus year when it isn't the current year). Used so
// old records read as a real date instead of a relative "4d ago" that keeps sliding.
export function dateStamp(t: number, now: number = Date.now()): string {
  const d = new Date(t);
  const diff = dayDiff(t, now);
  if (diff <= 0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString([], sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

// Full date label for a chat's day-separator pill: "Today" / "Yesterday" / "26 May 2026".
export function daySeparator(t: number, now: number = Date.now()): string {
  const diff = dayDiff(t, now);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
}

// True when two instants fall on different calendar days (drives whether to draw a chat separator).
export function isDifferentDay(a: number, b: number): boolean {
  const s = (x: number): string => { const d = new Date(x); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  return s(a) !== s(b);
}

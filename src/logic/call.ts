import type { CallRecord, CallFilter } from '../types';

// Pure call helpers — no RN/store imports, unit-testable.

export function callsByFilter(calls: CallRecord[], filter: CallFilter): CallRecord[] {
  const sorted = [...calls].sort((a, b) => b.ts - a.ts);
  return filter === 'missed' ? sorted.filter((c) => c.direction === 'missed') : sorted;
}

export function searchCalls(calls: CallRecord[], query: string): CallRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return calls;
  return calls.filter((c) => c.contact.name.toLowerCase().includes(q) || (c.contact.role ?? '').toLowerCase().includes(q));
}

export function missedCount(calls: CallRecord[]): number {
  return calls.reduce((n, c) => n + (c.direction === 'missed' ? 1 : 0), 0);
}

// "12:05" (mm:ss) or "1:02:03" (h:mm:ss).
export function durationLabel(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

// Short, list-style timestamp relative to `now`.
export function callTime(ts: number, now: number): string {
  const d = new Date(ts);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (sameDay) {
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((startToday.getTime() - d.getTime()) / dayMs);
  if (diffDays < 1) return 'Yesterday';
  if (diffDays < 6) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`;
}

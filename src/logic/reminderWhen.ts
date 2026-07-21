// Pure due-time helpers for the reminder composer. No RN imports (tested with Jest).

export type WhenPresetKey = 'today_evening' | 'tomorrow_morning' | 'next_monday' | 'in_1_hour';

export const WHEN_PRESETS: { key: WhenPresetKey; label: string }[] = [
  { key: 'today_evening', label: 'Today 5:00 PM' },
  { key: 'tomorrow_morning', label: 'Tomorrow 9:00 AM' },
  { key: 'next_monday', label: 'Next Monday' },
  { key: 'in_1_hour', label: 'In 1 hour' },
];

// Resolve a preset to a real Date. "Today 5 PM" already past rolls to tomorrow 5 PM.
export function presetDue(key: WhenPresetKey, now: Date = new Date()): Date {
  const at = new Date(now);
  if (key === 'today_evening') {
    at.setHours(17, 0, 0, 0);
    if (at <= now) at.setDate(at.getDate() + 1);
  } else if (key === 'tomorrow_morning') {
    at.setDate(now.getDate() + 1);
    at.setHours(9, 0, 0, 0);
  } else if (key === 'next_monday') {
    const days = (8 - now.getDay()) % 7 || 7;
    at.setDate(now.getDate() + days);
    at.setHours(9, 0, 0, 0);
  } else {
    at.setTime(now.getTime() + 3600_000);
  }
  return at;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatTime(d: Date): string {
  const h24 = d.getHours();
  const h = h24 % 12 || 12;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  return `${h}:${d.getMinutes().toString().padStart(2, '0')} ${ampm}`;
}

// Human label for a due time, relative to `now`:
//   same day → "Today · 5:00 PM" · next day → "Tomorrow · 9:00 AM"
//   within 6 days → "Mon · 9:00 AM" · same year → "14 Jul · 9:00 AM" · else "14 Jul 2027 · 9:00 AM"
export function formatWhenLabel(due: Date, now: Date = new Date()): string {
  const startOf = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOf(due) - startOf(now)) / DAY_MS);
  const time = formatTime(due);
  if (dayDiff === 0) return `Today · ${time}`;
  if (dayDiff === 1) return `Tomorrow · ${time}`;
  if (dayDiff > 1 && dayDiff < 7) return `${WEEKDAYS[due.getDay()]} · ${time}`;
  const datePart = `${due.getDate()} ${MONTHS[due.getMonth()]}${due.getFullYear() !== now.getFullYear() ? ` ${due.getFullYear()}` : ''}`;
  return `${datePart} · ${time}`;
}

// Seconds from `now` until `due` (≥ 1) — for scheduling the local OS notification.
export function secondsUntil(due: Date, now: Date = new Date()): number {
  return Math.max(1, Math.round((due.getTime() - now.getTime()) / 1000));
}

// ── natural-language due times ──
// "call the supplier tomorrow 5pm" → the composer pre-selects Tomorrow 5:00 PM. Deliberately a
// TIGHT grammar: it only fires on phrases that are unambiguously a date/time, because a wrong
// silent guess is worse than no guess. Whatever it picks stays visible and overridable in the UI.

export interface ParsedWhen {
  due: Date;
  match: string;   // the phrase recognised, for "picked up '…' from your text"
  hasTime: boolean; // false = we defaulted the clock time (see DEFAULT_HOUR)
}

const DEFAULT_HOUR = 9;   // a date with no time means "that morning"
const MONTH_WORDS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
// Time-of-day words, so "tomorrow morning" / "monday evening" / "by noon" all land somewhere sane.
const TIME_WORDS: { re: RegExp; h: number; m?: number }[] = [
  { re: /\b(?:early\s+)?morning\b/, h: 9 },
  { re: /\b(?:noon|midday|mid-day)\b/, h: 12 },
  { re: /\bafternoon\b/, h: 14 },
  { re: /\bevening\b/, h: 17 },
  { re: /\b(?:end\s+of\s+(?:the\s+)?day|eod|close\s+of\s+(?:the\s+)?day)\b/, h: 18 },
  { re: /\bnight\b/, h: 20 },
  { re: /\bmidnight\b/, h: 23, m: 59 }, // "by midnight" = the end of that day, not the start
];

const atTime = (base: Date, h: number, m: number): Date => {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
};
const midnightOf = (d: Date): Date => atTime(d, 0, 0);

// "5pm" · "5:30 pm" · "at 9am" · "17:30" · "at 5" · "noon" · "tomorrow morning".
// A bare number is only a time behind an explicit "at"/"by", and 24h needs the colon — so
// "call 5 people" and "book 12 seats" stay untouched.
// `exact` = the text pinned the hour (am/pm, 24h clock, or a word). Only a bare "at 5" is allowed
// to slide to the PM reading.
function findTime(s: string): { h: number; m: number; match: string; exact: boolean } | null {
  const ampm = s.match(/\b(?:at\s+|by\s+|around\s+)?(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?\s?m\.?\b/i);
  if (ampm) {
    let h = Number(ampm[1]);
    if (h >= 1 && h <= 12) {
      if (ampm[3].toLowerCase() === 'p' && h !== 12) h += 12;
      if (ampm[3].toLowerCase() === 'a' && h === 12) h = 0;
      return { h, m: Number(ampm[2] ?? 0), match: ampm[0].trim(), exact: true };
    }
  }
  const h24 = s.match(/\b(?:at\s+|by\s+|around\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24) return { h: Number(h24[1]), m: Number(h24[2]), match: h24[0].trim(), exact: true };
  for (const w of TIME_WORDS) {
    const hit = s.match(w.re);
    if (hit) return { h: w.h, m: w.m ?? 0, match: hit[0].trim(), exact: true };
  }
  // "at 5" / "by 6" — no am/pm. Resolved against the clock by the caller (5 could be either).
  const bare = s.match(/\b(?:at|by)\s+(\d{1,2})\b(?!\s*[:/-])/);
  if (bare) {
    const h = Number(bare[1]);
    if (h >= 1 && h <= 23) return { h, m: 0, match: bare[0].trim(), exact: false };
  }
  return null;
}

// "in 20 mins" · "in 2 hours" · "in 3 days" · "after a week" · "in 2 months".
// Minute/hour offsets are an exact instant; day-and-longer offsets are a DAY, so a time phrase
// in the same sentence ("in 3 days at 5pm") can still set the hour.
function findRelative(s: string, now: Date): { at?: Date; day?: Date; match: string } | null {
  const m = s.match(/\b(?:in|after)\s+(a|an|\d{1,3})\s*(min(?:ute)?s?|hr?s?|hours?|days?|weeks?|months?)\b/i);
  if (!m) return null;
  const n = /^a|^an$/.test(m[1]) ? 1 : Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  const match = m[0].trim();
  if (unit.startsWith('min')) return { at: new Date(now.getTime() + n * 60_000), match };
  if (unit.startsWith('h')) return { at: new Date(now.getTime() + n * 3600_000), match };
  const day = midnightOf(now);
  if (unit.startsWith('day')) day.setDate(day.getDate() + n);
  else if (unit.startsWith('week')) day.setDate(day.getDate() + n * 7);
  else day.setMonth(day.getMonth() + n);
  return { day, match };
}

// The DAY part, in priority order: today/tomorrow words → week & month boundaries → weekday name
// → "25 July"/"July 25" → 25/07[/2026] → "by the 25th".
function findDay(s: string, now: Date): { day: Date; match: string; hour?: number } | null {
  const shift = (n: number): Date => { const d = midnightOf(now); d.setDate(d.getDate() + n); return d; };
  // Next occurrence of a weekday, strictly after today (same rule as the "Next Monday" preset).
  const nextDow = (target: number): Date => shift(((target - now.getDay() + 7) % 7) || 7);

  const dayAfter = s.match(/\bday\s+after(?:\s+tomorrow)?\b/i);
  if (dayAfter) return { day: shift(2), match: dayAfter[0].trim() };
  const tom = s.match(/\b(tomorrow|tomo|tmrw|tmr)\b/i);
  if (tom) return { day: shift(1), match: tom[0] };
  const tonight = s.match(/\btonight\b/i);
  if (tonight) return { day: shift(0), match: tonight[0], hour: 20 };
  const todayWord = s.match(/\b(?:today|this\s+(?:morning|afternoon|evening)|later\s+today)\b/i);
  if (todayWord) return { day: shift(0), match: todayWord[0] };

  // Week & month boundaries.
  const eow = s.match(/\bend\s+of\s+(?:the\s+)?week|\beow\b/i);
  if (eow) return { day: nextDow(5), match: eow[0].trim() }; // Friday
  const weekend = s.match(/\b(?:this\s+|next\s+)?weekend\b/i);
  if (weekend) return { day: nextDow(6), match: weekend[0].trim() }; // Saturday
  const nextWeek = s.match(/\bnext\s+week\b/i);
  if (nextWeek) return { day: nextDow(1), match: nextWeek[0] }; // Monday
  const eom = s.match(/\bend\s+of\s+(?:the\s+)?month\b|\bmonth\s+end\b|\beom\b/i);
  if (eom) return { day: midnightOf(new Date(now.getFullYear(), now.getMonth() + 1, 0)), match: eom[0].trim() };
  const nextMonth = s.match(/\bnext\s+month\b/i);
  if (nextMonth) {
    const d = midnightOf(now);
    d.setMonth(d.getMonth() + 1);
    return { day: d, match: nextMonth[0] };
  }

  const wd = s.match(/\b(?:next\s+|this\s+|coming\s+|on\s+)?(sun|sunday|mon|monday|tues?|tuesday|weds?|wednesday|thur?s?|thursday|fri|friday|sat|saturday)\b/i);
  if (wd) return { day: nextDow(DAY_WORDS[wd[1].toLowerCase()]), match: wd[0].trim() };

  // "25 July" / "25th Jul 2027" / "July 25" — rolls to next year if the date already passed.
  const dmy = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b/i)
    ?? s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i);
  if (dmy) {
    const monthFirst = Number.isNaN(Number(dmy[1]));
    const dayNum = Number(monthFirst ? dmy[2] : dmy[1]);
    const month = MONTH_WORDS.indexOf((monthFirst ? dmy[1] : dmy[2]).slice(0, 3).toLowerCase());
    const year = dmy[3] ? Number(dmy[3]) : now.getFullYear();
    if (dayNum >= 1 && dayNum <= 31 && month >= 0) {
      const d = midnightOf(new Date(year, month, dayNum));
      if (d.getMonth() !== month) return null; // e.g. "31 Feb"
      if (!dmy[3] && d < midnightOf(now)) d.setFullYear(d.getFullYear() + 1);
      return { day: d, match: dmy[0].trim() };
    }
  }

  // 25/07 · 25-07-2026 (day-first — the group's convention).
  const num = s.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (num) {
    const dayNum = Number(num[1]);
    const month = Number(num[2]) - 1;
    let year = num[3] ? Number(num[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    if (dayNum >= 1 && dayNum <= 31 && month >= 0 && month <= 11) {
      const d = midnightOf(new Date(year, month, dayNum));
      if (d.getMonth() !== month) return null;
      if (!num[3] && d < midnightOf(now)) d.setFullYear(d.getFullYear() + 1);
      return { day: d, match: num[0] };
    }
  }

  // "on the 25th" / "by 3rd" — a day of THIS month, or next month once it has passed. Needs the
  // preposition, so "send the 1st draft" is left alone.
  const dom = s.match(/\b(?:on|by|before|due)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i);
  if (dom) {
    const dayNum = Number(dom[1]);
    if (dayNum >= 1 && dayNum <= 31) {
      let d = midnightOf(new Date(now.getFullYear(), now.getMonth(), dayNum));
      if (d.getMonth() !== now.getMonth() || d < midnightOf(now)) {
        d = midnightOf(new Date(now.getFullYear(), now.getMonth() + 1, dayNum));
        if (d.getDate() !== dayNum) return null; // no such day next month either
      }
      return { day: d, match: dom[0].trim() };
    }
  }
  return null;
}

// Pull a due time out of free text. Null when nothing is unambiguous enough to act on.
// A bare time ("5pm") means today, or tomorrow if that hour has already passed.
export function parseWhen(text: string, now: Date = new Date()): ParsedWhen | null {
  const s = text.toLowerCase();

  // "in 20 mins" is a complete answer on its own — no day/time phrase can refine it.
  const rel = findRelative(s, now);
  if (rel?.at) return { due: rel.at, match: rel.match, hasTime: true };

  const time = findTime(s);
  const day = rel?.day ? { day: rel.day, match: rel.match, hour: undefined } : findDay(s, now);
  if (!time && !day) return null;

  if (!day && time) {
    let due = atTime(now, time.h, time.m);
    // "at 5" with no am/pm: if 5 AM has gone, they mean 5 PM — not 5 AM tomorrow.
    if (due <= now && !time.exact && time.h < 12) {
      const pm = atTime(now, time.h + 12, time.m);
      if (pm > now) return { due: pm, match: time.match, hasTime: true };
    }
    if (due <= now) due = new Date(due.getTime() + DAY_MS);
    return { due, match: time.match, hasTime: true };
  }
  const d = day as NonNullable<typeof day>;
  const due = atTime(d.day, time?.h ?? d.hour ?? DEFAULT_HOUR, time?.m ?? 0);
  if (due <= now) return null; // an explicitly-past instant ("today 9am" at noon) — don't guess
  const match = time && time.match !== d.match ? `${d.match} ${time.match}` : d.match;
  return { due, match, hasTime: !!time || d.hour !== undefined };
}

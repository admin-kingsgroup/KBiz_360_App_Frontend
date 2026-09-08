// Natural-language quick-add parser for the iOS-style Reminders redesign, ported 1:1 from the
// design handoff prototype (Reminders.dc.html). Dates resolve to day-offsets from today — the
// prototype's date model; a past date without a year rolls to next year.

export interface QuickAddResult {
  title: string;
  day: number;
  time: string;
  hasDate: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_MS = 864e5;

export function parseQuickAdd(text: string): QuickAddResult {
  let title = text;
  let day = 0;
  let time = '';
  let hasDate = false;
  const strip = (re: RegExp): RegExpMatchArray | null => {
    const m = title.match(re);
    if (m) title = title.replace(re, ' ');
    return m;
  };

  const dm =
    title.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?/i) ||
    title.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i) ||
    title.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (dm) {
    const a = dm[1];
    const b = dm[2];
    const yr = dm[3] ? (Number(dm[3]) < 100 ? 2000 + Number(dm[3]) : Number(dm[3])) : null;
    let num: number;
    let mon: number;
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) { num = Number(a); mon = Number(b) - 1; }
    else if (/^\d/.test(a)) { num = Number(a); mon = MONTHS.indexOf(b.slice(0, 3).toLowerCase()); }
    else { num = Number(b); mon = MONTHS.indexOf(a.slice(0, 3).toLowerCase()); }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(yr ?? now.getFullYear(), mon, num);
    if (!yr && target < now) target.setFullYear(target.getFullYear() + 1);
    day = Math.round((target.getTime() - now.getTime()) / DAY_MS);
    hasDate = true;
    title = title.replace(dm[0], ' ');
  } else if (strip(/\btoday\b/i)) { day = 0; hasDate = true; }
  else if (strip(/\btomorrow\b/i)) { day = 1; hasDate = true; }
  else if (strip(/\bnext week\b/i)) { day = 7; hasDate = true; }
  else {
    for (let i = 0; i < 7; i++) {
      const re = new RegExp('\\b(?:on\\s+)?' + WEEKDAYS[i] + '\\b', 'i');
      if (re.test(title)) {
        title = title.replace(re, ' ');
        day = ((i - new Date().getDay()) + 7) % 7 || 7;
        hasDate = true;
        break;
      }
    }
  }

  const tm = title.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (tm) {
    title = title.replace(tm[0], ' ');
    time = `${Number(tm[1])}:${tm[2] ?? '00'} ${tm[3].toUpperCase()}`;
    hasDate = true;
  }

  return { title: title.replace(/\s+/g, ' ').trim(), day, time, hasDate };
}

// "Yesterday, 3:00 PM" / "Today" / "Tomorrow, 10:00 AM" / "Sat, Sep 26, 5:00 PM"
export function whenLabel(day: number, time: string): string {
  let d: string;
  if (day === -1) d = 'Yesterday';
  else if (day < -1) d = `${-day} days ago`;
  else if (day === 0) d = 'Today';
  else if (day === 1) d = 'Tomorrow';
  else d = new Date(Date.now() + day * DAY_MS).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return time ? `${d}, ${time}` : d;
}

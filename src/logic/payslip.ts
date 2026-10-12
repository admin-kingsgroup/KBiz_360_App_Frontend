import type { PayslipMonth } from '../api/hr';

// Pure helpers behind My Payslip (app/hr/payslip.tsx + app/hr/payslip-view.tsx). Owner, 2026-10-12:
// "show the SAME payslip as the ERP in the app — and until the salary is released don't share that
// month's payslip". The server lists only released (paid-in-full) months; the payslip itself is
// Books' own page, opened from a 15-minute signed link. Nothing here prices a payslip.

export const PAYSLIP_SUBTITLE = 'Shown once your salary is paid';
export const PAYSLIP_EMPTY_TEXT = 'Your payslip appears here once your salary for the month is paid.';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Released months, newest first, one row per month (the first seen wins); malformed months dropped. */
export function sortPayslipMonths(months: PayslipMonth[] | null | undefined): PayslipMonth[] {
  const seen = new Set<string>();
  const out: PayslipMonth[] = [];
  for (const m of months ?? []) {
    if (!m || !MONTH_RE.test(String(m.month)) || seen.has(m.month)) continue;
    seen.add(m.month);
    out.push(m);
  }
  return out.sort((a, b) => b.month.localeCompare(a.month));
}

/** The net in its own currency: INR → "₹41,250" (Indian grouping); anything else → "KES 85,000.50";
 *  no currency → the grouped figure alone. Paise/cents only when the figure has them. */
export function payslipNet(net: number, currency: string | null | undefined): string {
  const n = Number(net);
  if (!Number.isFinite(n)) return '';
  const cur = String(currency ?? '').trim().toUpperCase();
  const digits = Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2;
  const abs = Math.abs(n).toLocaleString(cur === 'INR' || !cur ? 'en-IN' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sign = n < 0 ? '-' : '';
  if (cur === 'INR') return `${sign}₹${abs}`;
  return cur ? `${sign}${cur} ${abs}` : `${sign}${abs}`;
}

/** 'YYYY-MM-DD' → "7 Oct 2026" ('' when not a date). Fixed English — never the device locale. */
export function shortDate(day: string | null | undefined): string {
  const m = DAY_RE.exec(String(day ?? ''));
  if (!m) return '';
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${d} ${MON[mo - 1]} ${m[1]}`;
}

/** "Paid on 7 Oct 2026", or "Paid" for a month recorded as paid without a payment date. */
export function paidOnLine(paidOn: string | null | undefined): string {
  const d = shortDate(paidOn);
  return d ? `Paid on ${d}` : 'Paid';
}

/** The screen title for a month: the server's label, else "September 2026" built from the key. */
export function payslipTitle(m: { month: string; label?: string }): string {
  if (m.label && m.label.trim()) return m.label.trim();
  if (!MONTH_RE.test(m.month)) return m.month;
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(m.month.slice(5, 7)) - 1]} ${m.month.slice(0, 4)}`;
}

/** Is a signed link still good for at least `marginMs` more? (links last 15 minutes) */
export function linkIsFresh(expiresAt: string | null | undefined, now: number = Date.now(), marginMs = 30_000): boolean {
  const t = Date.parse(String(expiresAt ?? ''));
  return Number.isFinite(t) && t - marginMs > now;
}

/** Only an http(s) url is ever opened in the payslip WebView. */
export const isWebUrl = (url: string | null | undefined): boolean => /^https?:\/\/[^\s]+$/i.test(String(url ?? ''));

/** The origin of an http(s) url ('' when it has none) — the WebView stays on the payslip's own site. */
export function originOf(url: string | null | undefined): string {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(String(url ?? ''));
  return m ? m[1].toLowerCase() : '';
}

/** May the payslip WebView load this request? Same site as the payslip link, or a blank/data/blob page. */
export function payslipWebViewAllows(requestUrl: string, payslipUrl: string): boolean {
  const u = String(requestUrl ?? '');
  if (/^(about:|data:|blob:)/i.test(u)) return true;
  const home = originOf(payslipUrl);
  return !!home && originOf(u) === home;
}

/** What to say when the list or a link can't be had. Server reasons (not released yet, not on the
 *  register) are shown as written; plumbing failures get a plain sentence instead of a code. */
export function payslipErrorText(err: unknown): string {
  const e = (err ?? {}) as { status?: unknown; message?: unknown; code?: unknown };
  const status = typeof e.status === 'number' ? e.status : 0;
  const message = typeof e.message === 'string' ? e.message.trim() : '';
  if (!status) return 'Couldn’t reach the server. Check your connection and try again.';
  // An app backend without the payslip routes yet answers its generic 404.
  if (e.code === 'NOT_FOUND') return 'Payslips aren’t available yet — please try again later.';
  if (status === 401) return 'Your session has ended — sign in again to see your payslips.';
  if (status === 503) return 'Payslips are not available right now. Please try again later.';
  if (status >= 500) return 'HR’s system didn’t answer. Please try again in a moment.';
  return message || 'Couldn’t load your payslip. Please try again.';
}

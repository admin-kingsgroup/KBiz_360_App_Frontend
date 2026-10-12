import type { PayslipMonth } from '../api/hr';
import {
  PAYSLIP_EMPTY_TEXT, isWebUrl, linkIsFresh, originOf, paidOnLine, payslipErrorText, payslipNet, payslipTitle,
  payslipWebViewAllows, shortDate, sortPayslipMonths,
} from '../logic/payslip';

// My Payslip (owner, 2026-10-12): the ERP's own payslip, released (paid-in-full) months only. These
// pin the pure pieces the two screens lean on — no figures are computed in the app.

const row = (month: string, extra: Partial<PayslipMonth> = {}): PayslipMonth => ({
  month, label: '', branch: 'MHUB', net: 1000, currency: 'INR', vno: '', paidOn: '', source: 'paid', ...extra,
});

describe('sortPayslipMonths', () => {
  it('newest first, one per month, malformed months dropped', () => {
    const out = sortPayslipMonths([
      row('2026-08', { net: 1 }), row('2026-09', { net: 2 }), row('2026-08', { net: 3 }), row('2026-13'), row('Sept'), row('2025-12'),
    ]);
    expect(out.map((m) => m.month)).toEqual(['2026-09', '2026-08', '2025-12']);
    expect(out[1].net).toBe(1); // the first August seen wins
  });

  it('nothing → empty list', () => {
    expect(sortPayslipMonths(undefined)).toEqual([]);
    expect(sortPayslipMonths(null)).toEqual([]);
  });
});

describe('payslipNet', () => {
  it('INR: rupee sign and Indian grouping', () => {
    expect(payslipNet(123456, 'INR')).toBe('₹1,23,456');
    expect(payslipNet(41250.5, 'inr')).toBe('₹41,250.50');
    expect(payslipNet(0, 'INR')).toBe('₹0');
  });

  it('other currencies: code + amount, western grouping', () => {
    expect(payslipNet(85000, 'KES')).toBe('KES 85,000');
    expect(payslipNet(1234.5, 'USD')).toBe('USD 1,234.50');
    expect(payslipNet(1500000, 'TZS')).toBe('TZS 1,500,000');
  });

  it('no currency: the grouped figure alone; nonsense → empty', () => {
    expect(payslipNet(41250, '')).toBe('41,250');
    expect(payslipNet(Number.NaN, 'INR')).toBe('');
    expect(payslipNet(-500, 'INR')).toBe('-₹500');
  });
});

describe('dates and titles', () => {
  it('shortDate is fixed English, never the device locale', () => {
    expect(shortDate('2026-10-07')).toBe('7 Oct 2026');
    expect(shortDate('2026-01-31')).toBe('31 Jan 2026');
    expect(shortDate('')).toBe('');
    expect(shortDate('2026-13-01')).toBe('');
    expect(shortDate(null)).toBe('');
  });

  it('paidOnLine says when — or just "Paid" for a month recorded as paid without a date', () => {
    expect(paidOnLine('2026-10-07')).toBe('Paid on 7 Oct 2026');
    expect(paidOnLine('')).toBe('Paid');
  });

  it('payslipTitle prefers the server label, else builds one from the month', () => {
    expect(payslipTitle({ month: '2026-09', label: 'September 2026' })).toBe('September 2026');
    expect(payslipTitle({ month: '2026-09', label: '  ' })).toBe('September 2026');
    expect(payslipTitle({ month: '2026-01' })).toBe('January 2026');
    expect(payslipTitle({ month: 'odd' })).toBe('odd');
  });

  it('the empty state says when a payslip shows up', () => {
    expect(PAYSLIP_EMPTY_TEXT).toBe('Your payslip appears here once your salary for the month is paid.');
  });
});

describe('the signed link', () => {
  const NOW = Date.parse('2026-10-12T10:00:00.000Z');

  it('is fresh only with time to spare', () => {
    expect(linkIsFresh('2026-10-12T10:15:00.000Z', NOW)).toBe(true);
    expect(linkIsFresh('2026-10-12T10:00:20.000Z', NOW)).toBe(false); // inside the 30s margin
    expect(linkIsFresh('2026-10-12T09:59:00.000Z', NOW)).toBe(false);
    expect(linkIsFresh('', NOW)).toBe(false);
    expect(linkIsFresh(undefined, NOW)).toBe(false);
  });

  it('only http(s) urls open', () => {
    expect(isWebUrl('https://kbizbooks-kings.duckdns.org/payslip-view?t=a.b.c')).toBe(true);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('file:///etc/passwd')).toBe(false);
    expect(isWebUrl('')).toBe(false);
  });

  it('the WebView stays on the payslip’s own site', () => {
    const link = 'https://kbizbooks-kings.duckdns.org/payslip-view?t=abc';
    expect(originOf(link)).toBe('https://kbizbooks-kings.duckdns.org');
    expect(payslipWebViewAllows(link, link)).toBe(true);
    expect(payslipWebViewAllows('https://kbizbooks-kings.duckdns.org/assets/index.js', link)).toBe(true);
    expect(payslipWebViewAllows('about:blank', link)).toBe(true);
    expect(payslipWebViewAllows('https://evil.example/payslip-view', link)).toBe(false);
    expect(payslipWebViewAllows('https://kbizbooks-kings.duckdns.org.evil.example/', link)).toBe(false);
    expect(payslipWebViewAllows('intent://x', link)).toBe(false);
    expect(payslipWebViewAllows(link, '')).toBe(false);
  });
});

describe('payslipErrorText', () => {
  it('shows the server’s own reason for a refused month', () => {
    expect(payslipErrorText({ status: 403, code: 'PAYSLIP-NOT-RELEASED', message: 'Your October 2026 payslip shows here once that salary is paid.' }))
      .toBe('Your October 2026 payslip shows here once that salary is paid.');
    expect(payslipErrorText({ status: 404, code: 'ERP_REFUSED', message: 'This payslip is not on the salary register any more — ask HR.' }))
      .toBe('This payslip is not on the salary register any more — ask HR.');
  });

  it('plumbing failures get a plain sentence, never a code', () => {
    expect(payslipErrorText(new TypeError('Network request failed'))).toMatch(/Couldn’t reach the server/);
    expect(payslipErrorText({ name: 'AbortError' })).toMatch(/Couldn’t reach the server/);
    expect(payslipErrorText({ status: 502, code: 'ERP_AUTH', message: 'Invalid app service token' })).toBe('HR’s system didn’t answer. Please try again in a moment.');
    expect(payslipErrorText({ status: 503, message: 'x' })).toMatch(/not available right now/);
    expect(payslipErrorText({ status: 404, code: 'NOT_FOUND', message: 'No route for GET /api/hr/payslips' })).toMatch(/aren’t available yet/);
    expect(payslipErrorText({ status: 400, message: '' })).toMatch(/Couldn’t load your payslip/);
    expect(payslipErrorText(null)).toMatch(/Couldn’t reach the server/);
  });
});

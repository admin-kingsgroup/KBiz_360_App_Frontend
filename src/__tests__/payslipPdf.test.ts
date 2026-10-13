import { PDFDocument } from 'pdf-lib';
import { A4, buildPayslipPdf, parsePayslipMessage, placeOnA4, safePdfName, PAYSLIP_BRIDGE_SOURCE } from '../logic/payslipPdf';

// Owner 2026-10-13: Download the payslip as a PDF on the phone — Books' page hands over its A4 pages
// as PNGs (payslipPdfBridge), the app lays them on A4 and saves the file.

// A 2 × 3 white PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEUlEQVR4nGP4//8/AwMDAwMAJPcD/f4cTJ8AAAAASUVORK5CYII=';
const msg = (o: Record<string, unknown>): string => JSON.stringify({ source: PAYSLIP_BRIDGE_SOURCE, ...o });

describe('safePdfName', () => {
  test('keeps the payslip name, drops what a phone refuses, always .pdf', () => {
    expect(safePdfName('Payslip - Lamiya Patel - October 2026.pdf')).toBe('Payslip - Lamiya Patel - October 2026.pdf');
    expect(safePdfName('Payslip - A/B: "x"')).toBe('Payslip - A B x.pdf');
    expect(safePdfName('')).toBe('Payslip.pdf');
    expect(safePdfName(undefined)).toBe('Payslip.pdf');
  });
});

describe('parsePayslipMessage', () => {
  test('ready, pdf and pdf-error from the payslip page', () => {
    expect(parsePayslipMessage(msg({ type: 'ready', fileName: 'Payslip - Asha - May 2026.pdf' }))).toEqual({ type: 'ready', fileName: 'Payslip - Asha - May 2026.pdf' });
    expect(parsePayslipMessage(msg({ type: 'pdf', fileName: 'x', pages: [{ data: PNG, width: 2, height: 3 }] })))
      .toEqual({ type: 'pdf', fileName: 'x.pdf', pages: [{ data: PNG, width: 2, height: 3 }] });
    expect(parsePayslipMessage(msg({ type: 'pdf-error', message: 'nope' }))).toEqual({ type: 'pdf-error', message: 'nope' });
  });
  test('a pdf with no pages or a broken page is an error, never a blank PDF', () => {
    expect(parsePayslipMessage(msg({ type: 'pdf', pages: [] }))?.type).toBe('pdf-error');
    expect(parsePayslipMessage(msg({ type: 'pdf', pages: [{ data: PNG, width: 0, height: 3 }] }))?.type).toBe('pdf-error');
    expect(parsePayslipMessage(msg({ type: 'pdf', pages: [{ data: 'data:image/png;base64,xx', width: 2, height: 3 }] }))?.type).toBe('pdf-error');
  });
  test('anything else is ignored', () => {
    expect(parsePayslipMessage('not json')).toBeNull();
    expect(parsePayslipMessage(JSON.stringify({ type: 'ready' }))).toBeNull();                 // no source
    expect(parsePayslipMessage(JSON.stringify({ source: 'other', type: 'ready' }))).toBeNull();
    expect(parsePayslipMessage(msg({ type: 'hello' }))).toBeNull();
  });
});

describe('placeOnA4', () => {
  test('full printable width from the top margin; a too-tall page is scaled to fit', () => {
    const cw = A4.w - 2 * A4.margin;
    const p = placeOnA4(1498, 1118);
    expect(Object.keys(p).sort()).toEqual(['height', 'width', 'x', 'y']);   // pdf-lib drawImage's keys — anything else draws at pixel size
    expect(p.x).toBeCloseTo(A4.margin);
    expect(p.width).toBeCloseTo(cw);
    expect(p.height).toBeCloseTo(cw * (1118 / 1498));
    expect(p.y + p.height).toBeCloseTo(A4.h - A4.margin);
    const tall = placeOnA4(1000, 5000);
    expect(tall.height).toBeCloseTo(A4.h - 2 * A4.margin);
    expect(tall.width).toBeLessThan(cw);
  });
});

describe('buildPayslipPdf', () => {
  test('one A4 page per picture', async () => {
    const b64 = await buildPayslipPdf([{ data: PNG, width: 2, height: 3 }, { data: PNG, width: 2, height: 3 }], 'Payslip - Asha');
    const doc = await PDFDocument.load(Buffer.from(b64, 'base64'));
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: A4.w, height: A4.h });
    expect(doc.getTitle()).toBe('Payslip - Asha');
  });
});

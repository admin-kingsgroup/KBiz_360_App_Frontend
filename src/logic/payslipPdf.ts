// The payslip as a PDF on the phone (owner, 2026-10-13: "give an option to download the PDF of the
// payslip so that they can download it on their phone"). The payslip page in the WebView is Books'
// own (payslip-view); the app has no print engine, so that page hands over each A4 page of the SAME
// payslip as a PNG (Books payslipPdfBridge) and this lays them on A4 pages with pdf-lib — pure JS, so
// it ships over the air. Nothing here prices a payslip or reads the network.

/** Books' payslipPdfBridge tags every message with this. */
export const PAYSLIP_BRIDGE_SOURCE = 'kb360-payslip';
/** The page's hook the Download button calls (window.kb360PayslipPdf). */
export const PAYSLIP_PDF_JS = 'window.kb360PayslipPdf && window.kb360PayslipPdf(); true;';

export type PayslipPdfPage = { data: string; width: number; height: number };
export type PayslipBridgeMessage =
  | { type: 'ready'; fileName: string }
  | { type: 'pdf'; fileName: string; pages: PayslipPdfPage[] }
  | { type: 'pdf-error'; message: string };

const DEFAULT_NAME = 'Payslip.pdf';

/** A file name the phone will take: unsafe characters dropped, always ending .pdf. */
export function safePdfName(name: string | null | undefined): string {
  const base = String(name ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\.pdf$/i, '').trim();
  return base ? `${base}.pdf` : DEFAULT_NAME;
}

const isPage = (p: unknown): p is PayslipPdfPage => {
  const x = p as PayslipPdfPage;
  return !!x && typeof x.data === 'string' && x.data.length > 0 && /^[A-Za-z0-9+/=]+$/.test(x.data.slice(0, 64))
    && Number.isFinite(x.width) && Number.isFinite(x.height) && x.width > 0 && x.height > 0;
};

/** A WebView message → a payslip bridge message, or null for anything else (other pages' noise, junk). */
export function parsePayslipMessage(raw: string | null | undefined): PayslipBridgeMessage | null {
  let m: Record<string, unknown>;
  try { m = JSON.parse(String(raw ?? '')); } catch { return null; }
  if (!m || typeof m !== 'object' || m.source !== PAYSLIP_BRIDGE_SOURCE) return null;
  if (m.type === 'ready') return { type: 'ready', fileName: safePdfName(m.fileName as string) };
  if (m.type === 'pdf-error') return { type: 'pdf-error', message: String(m.message || 'The payslip PDF could not be made just now.') };
  if (m.type === 'pdf') {
    const pages = Array.isArray(m.pages) ? m.pages : [];
    if (!pages.length || !pages.every(isPage)) return { type: 'pdf-error', message: 'The payslip PDF came through incomplete. Please try again.' };
    return { type: 'pdf', fileName: safePdfName(m.fileName as string), pages: pages as PayslipPdfPage[] };
  }
  return null;
}

// A4 in points, inside the print preview's Narrow (6 mm) margins — as the payslip prints from the ERP.
export const A4 = { w: 595.28, h: 841.89, margin: (6 * 72) / 25.4 };

/** Where a page picture sits on A4: the full printable width from the top margin, scaled down to fit
 *  the height if it is taller (Books already slices to A4, so that is a guard). In pdf-lib's own
 *  drawImage terms (width / height), so it is handed over as is. */
export function placeOnA4(width: number, height: number): { x: number; y: number; width: number; height: number } {
  const cw = A4.w - A4.margin * 2;
  const ch = A4.h - A4.margin * 2;
  const k = Math.min(cw / width, ch / height);
  const w = width * k;
  const h = height * k;
  return { x: A4.margin, y: A4.h - A4.margin - h, width: w, height: h };
}

/** The pages → one PDF, as base64. */
export async function buildPayslipPdf(pages: PayslipPdfPage[], title = 'Payslip'): Promise<string> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator('KBiz360 Smart Connect');
  for (const p of pages) {
    const img = await doc.embedPng(p.data);
    const page = doc.addPage([A4.w, A4.h]);
    page.drawImage(img, placeOnA4(p.width, p.height));
  }
  return doc.saveAsBase64();
}

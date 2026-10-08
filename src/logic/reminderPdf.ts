import type { PDFFont } from 'pdf-lib';
import { bundlePeopleLine, bundleStatus, type ReminderBundle } from './reminderBundles';

// Reminder PDF export (owner 2026-10-07: every reminder section exports its own PDF — Self Task,
// Assigned to Me, Assign By Me, each user, each branch). Pure JS via pdf-lib, so it ships over the air:
// no native print module is needed. The file is written and shared by services/reminderPdf.ts.

export interface PdfRow { text: string; people: string; due: string; status: string }
export interface PdfSection { title: string; rows: PdfRow[] }
export interface PdfSpec { title: string; subtitle: string; sections: PdfSection[] }

const dueLabel = (iso?: string): string => {
  if (!iso) return 'No due date';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'No due date' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const bundleToRow = (b: ReminderBundle): PdfRow => ({
  text: b.text || 'Untitled reminder',
  people: bundlePeopleLine(b),
  due: dueLabel(b.dueAt),
  status: bundleStatus(b),
});

export const sectionOf = (title: string, bundles: ReminderBundle[]): PdfSection => ({ title, rows: bundles.map(bundleToRow) });

/** "Self Task" + "Anubhav Maurya" → a spec with the generated-at line. */
export function reminderPdfSpec(title: string, sections: PdfSection[], viewerName?: string, now = new Date()): PdfSpec {
  const when = now.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  return {
    title,
    subtitle: `${total} ${total === 1 ? 'reminder' : 'reminders'} · Generated ${when}${viewerName ? ` by ${viewerName}` : ''}`,
    sections,
  };
}

/** A file name a share sheet and a file manager both accept: "self-task-2026-10-07.pdf". */
export function pdfFileName(title: string, now = new Date()): string {
  const slug = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'reminders';
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${slug}-${day}.pdf`;
}

// The standard PDF fonts only encode WinAnsi (Latin-1 plus a few typographic marks). Anything else
// would make pdf-lib throw mid-export, so it is mapped to a readable stand-in first.
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const SUBSTITUTE: Record<string, string> = { '→': '->', '←': '<-', '✓': '(done)', '✔': '(done)', '₹': 'Rs.', '\t': ' ' };
export function pdfSafe(s: string): string {
  let out = '';
  for (const ch of Array.from(s)) {
    if (SUBSTITUTE[ch] !== undefined) { out += SUBSTITUTE[ch]; continue; }
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.has(ch)) out += ch;
    else if (ch === '\n') out += '\n';
    else if (c === 0xfe0f || c === 0x200d) continue; // emoji variation selector / joiner
    else out += '?';
  }
  return out;
}

/** Greedy word wrap to `width` points; an over-long word is broken by characters. */
export function wrapText(text: string, font: Pick<PDFFont, 'widthOfTextAtSize'>, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(tryLine, size) <= width) { line = tryLine; continue; }
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) <= width) { line = word; continue; }
      let chunk = '';
      for (const ch of Array.from(word)) {
        if (font.widthOfTextAtSize(chunk + ch, size) > width && chunk) { lines.push(chunk); chunk = ch; } else chunk += ch;
      }
      line = chunk;
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

/** Lay the spec out on A4 pages and return the PDF as base64. */
export async function buildReminderPdf(spec: PdfSpec): Promise<string> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(spec.title));
  doc.setCreator('KBiz 360 Smart Connect');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40, CW = W - M * 2;
  const ink = rgb(0.06, 0.08, 0.1), mute = rgb(0.38, 0.42, 0.46), rule = rgb(0.85, 0.88, 0.9), accent = rgb(0.19, 0.38, 0.44);

  let page = doc.addPage([W, H]);
  let y = H - M;
  const ensure = (needed: number): void => {
    if (y - needed >= M + 24) return;
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const draw = (s: string, x: number, size: number, font: PDFFont, color = ink): void => {
    page.drawText(s, { x, y, size, font, color });
  };

  // Header.
  for (const l of wrapText(pdfSafe(spec.title), bold, 18, CW)) { ensure(24); y -= 18; draw(l, M, 18, bold); y -= 4; }
  y -= 2;
  for (const l of wrapText(pdfSafe(spec.subtitle), regular, 9.5, CW)) { ensure(14); y -= 10; draw(l, M, 9.5, regular, mute); y -= 3; }
  y -= 10;

  for (const section of spec.sections) {
    ensure(40);
    y -= 13;
    draw(pdfSafe(`${section.title} (${section.rows.length})`), M, 13, bold, accent);
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: accent });
    y -= 8;
    if (!section.rows.length) { ensure(16); y -= 10; draw('No reminders.', M, 10, regular, mute); y -= 10; continue; }
    section.rows.forEach((row, i) => {
      const num = `${i + 1}.`;
      const textLines = wrapText(pdfSafe(row.text), regular, 10.5, CW - 22);
      const peopleLines = wrapText(pdfSafe(row.people), regular, 9, CW - 22);
      const meta = pdfSafe(`Due: ${row.due}   ·   Status: ${row.status}`);
      ensure(textLines.length * 14 + peopleLines.length * 12 + 26);
      textLines.forEach((l, li) => { y -= 11; if (li === 0) draw(num, M, 10.5, bold); draw(l, M + 22, 10.5, regular); y -= 3; });
      peopleLines.forEach((l) => { y -= 10; draw(l, M + 22, 9, regular, mute); y -= 2; });
      y -= 10; draw(meta, M + 22, 9, regular, row.status === 'Overdue' ? rgb(0.75, 0.15, 0.15) : mute);
      y -= 8;
      page.drawLine({ start: { x: M + 22, y }, end: { x: W - M, y }, thickness: 0.5, color: rule });
      y -= 6;
    });
    y -= 8;
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - regular.widthOfTextAtSize(label, 8), y: M - 16, size: 8, font: regular, color: mute });
    p.drawText('KBiz 360 · Smart Connect', { x: M, y: M - 16, size: 8, font: regular, color: mute });
  });
  return doc.saveAsBase64();
}

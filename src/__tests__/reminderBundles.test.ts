import type { ReminderRecord } from '../data/reminders';
import { bundleReminders, bundlePeopleLine, canEditBundle, completableMembers, myTaskSection, objectIdSeconds, bundleStatus } from '../logic/reminderBundles';
import { buildReminderPdf, pdfFileName, pdfSafe, reminderPdfSpec, sectionOf, wrapText } from '../logic/reminderPdf';

// ObjectId whose first 4 bytes are `secs` (the creation time) followed by a unique tail.
const oid = (secs: number, tail: number): string => secs.toString(16).padStart(8, '0') + tail.toString(16).padStart(16, '0');
const T0 = 1_791_000_000;

const rec = (over: Partial<ReminderRecord> & { id: string }): ReminderRecord => ({
  text: 'Send the BSP report', state: 'pending', forId: 'u-abc', forName: 'Abc', byId: 'me', byName: 'Anubhav', section: 'today',
  ...over,
} as ReminderRecord);

describe('bundleReminders', () => {
  it('folds the copies of one multi-person reminder into one line', () => {
    const items = [
      rec({ id: oid(T0, 1), forId: 'u-xyz', forName: 'Xyz' }),
      rec({ id: oid(T0, 2), forId: 'u-abc', forName: 'Abc' }),
      rec({ id: oid(T0 + 1, 3), forId: 'u-efg', forName: 'Efg' }),
    ];
    const out = bundleReminders(items);
    expect(out).toHaveLength(1);
    expect(bundlePeopleLine(out[0])).toBe('Anubhav → Abc, Efg, Xyz');
  });

  it('keeps reminders apart when text, creator, due date or time differ', () => {
    const items = [
      rec({ id: oid(T0, 1) }),
      rec({ id: oid(T0, 2), forId: 'u-x', text: 'Something else' }),
      rec({ id: oid(T0, 3), forId: 'u-y', byId: 'other', byName: 'Faiz' }),
      rec({ id: oid(T0, 4), forId: 'u-z', dueAt: '2026-10-08T18:29:00.000Z' }),
      rec({ id: oid(T0 + 3600, 5), forId: 'u-w' }), // the same words an hour later = a new reminder
    ];
    expect(bundleReminders(items)).toHaveLength(5);
  });

  it('never merges two copies for the same person', () => {
    const items = [rec({ id: oid(T0, 1) }), rec({ id: oid(T0, 2) })];
    expect(bundleReminders(items)).toHaveLength(2);
  });

  it('does not merge records whose id is not an ObjectId', () => {
    expect(bundleReminders([rec({ id: 'r1' }), rec({ id: 'r2', forId: 'u-x' })])).toHaveLength(2);
    expect(objectIdSeconds('r1')).toBeNull();
    expect(objectIdSeconds(oid(T0, 1))).toBe(T0);
  });

  it('marks a finished copy and reports the bundle status', () => {
    const [b] = bundleReminders([rec({ id: oid(T0, 1), state: 'review' }), rec({ id: oid(T0, 2), forId: 'u-x', forName: 'Xyz' })]);
    expect(bundlePeopleLine(b)).toBe('Anubhav → Abc ✓, Xyz');
    expect(bundleStatus(b)).toBe('Pending');
  });
});

describe('myTaskSection', () => {
  const one = (over: Partial<ReminderRecord>) => bundleReminders([rec({ id: oid(T0, 9), ...over })])[0];
  it('self = I wrote it for myself only', () => expect(myTaskSection(one({ forId: 'me', forName: 'Anubhav' }), 'me')).toBe('self'));
  it('forme = someone else wrote it for me', () => expect(myTaskSection(one({ forId: 'me', byId: 'faiz', byName: 'Faiz' }), 'me')).toBe('forme'));
  it('team = I wrote it for someone else', () => expect(myTaskSection(one({}), 'me')).toBe('team'));
  it('team when I wrote it for me AND others', () => {
    const [b] = bundleReminders([rec({ id: oid(T0, 1), forId: 'me' }), rec({ id: oid(T0, 2) })]);
    expect(myTaskSection(b, 'me')).toBe('team');
  });
  it('null when it is not mine at all', () => expect(myTaskSection(one({ byId: 'x', forId: 'y' }), 'me')).toBeNull());
});

describe('bundle actions', () => {
  it('only the assignee completes, only the creator edits', () => {
    const [b] = bundleReminders([rec({ id: oid(T0, 1), forId: 'me' }), rec({ id: oid(T0, 2) })]);
    expect(completableMembers(b, 'me').map((m) => m.forId)).toEqual(['me']);
    expect(canEditBundle(b, 'me')).toBe(true);
    expect(canEditBundle(b, 'u-abc')).toBe(false);
  });
});

describe('reminder PDF', () => {
  it('maps characters the standard fonts cannot encode', () => {
    expect(pdfSafe('Anubhav → Abc ✓ ₹500 🙂 café')).toBe('Anubhav -> Abc (done) Rs.500 ? café');
  });

  it('wraps long text within the width', () => {
    const font = { widthOfTextAtSize: (s: string, size: number) => s.length * size * 0.5 };
    const lines = wrapText('one two three four five six', font, 10, 50);
    expect(lines.every((l) => font.widthOfTextAtSize(l, 10) <= 50)).toBe(true);
    expect(lines.join(' ')).toBe('one two three four five six');
  });

  it('names the file after the section and the day', () => {
    expect(pdfFileName('Self Task', new Date(2026, 9, 7))).toBe('self-task-2026-10-07.pdf');
    expect(pdfFileName('MHUB · Head Office — Reminders', new Date(2026, 9, 7))).toBe('mhub-head-office-reminders-2026-10-07.pdf');
  });

  it('builds a real PDF across several pages', async () => {
    const many = Array.from({ length: 60 }, (_, i) => rec({ id: oid(T0 + i * 100, i), text: `Reminder number ${i} → with a long enough line to wrap across the width of an A4 page at ten and a half points`, forId: `u${i}` }));
    const spec = reminderPdfSpec('Team Task', [sectionOf('Team Task', bundleReminders(many))], 'Anubhav Maurya');
    expect(spec.subtitle).toMatch(/^60 reminders · Generated .* by Anubhav Maurya$/);
    const b64 = await buildReminderPdf(spec);
    const head = Buffer.from(b64, 'base64').subarray(0, 5).toString('latin1');
    expect(head).toBe('%PDF-');
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(Buffer.from(b64, 'base64'));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});

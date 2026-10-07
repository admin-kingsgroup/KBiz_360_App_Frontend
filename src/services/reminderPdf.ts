import { buildReminderPdf, pdfFileName, type PdfSpec } from '../logic/reminderPdf';

/** Build the PDF, write it to the cache directory and open the system share sheet (save to Files,
 *  WhatsApp, email…). Throws when the device cannot share files, so the caller can toast. */
export async function shareReminderPdf(spec: PdfSpec): Promise<void> {
  const base64 = await buildReminderPdf(spec);
  const FS = await import('expo-file-system/legacy');
  const uri = `${FS.cacheDirectory ?? ''}${pdfFileName(spec.title)}`;
  await FS.writeAsStringAsync(uri, base64, { encoding: FS.EncodingType.Base64 });
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: spec.title, UTI: 'com.adobe.pdf' });
}

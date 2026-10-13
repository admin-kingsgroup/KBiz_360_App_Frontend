import { Platform } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import { buildPayslipPdf, safePdfName, type PayslipPdfPage } from '../logic/payslipPdf';
import { exportToSharedFolder, shareFile } from './attachments';

export type PayslipSaveResult = { status: 'saved' | 'shared' | 'failed'; uri: string };

/** Build the payslip PDF and put it on the phone. Android: into the downloads folder the person
 *  picked once (the one chat downloads use — My Files / Documents); if they decline the picker, the
 *  share sheet instead. iPhone: the share sheet ("Save to Files"). Throws only when the PDF itself
 *  cannot be built or written. */
export async function savePayslipPdf(pages: PayslipPdfPage[], fileName: string): Promise<PayslipSaveResult> {
  const name = safePdfName(fileName);
  const base64 = await buildPayslipPdf(pages, name.replace(/\.pdf$/i, ''));
  const uri = `${FS.cacheDirectory ?? ''}${name.replace(/\s+/g, '_')}`;   // the cache copy; the saved one keeps the spaced name
  await FS.writeAsStringAsync(uri, base64, { encoding: FS.EncodingType.Base64 });
  if (Platform.OS === 'android') {
    const saved = await exportToSharedFolder(uri, name, 'application/pdf', { force: true });
    if (saved === 'saved') return { status: 'saved', uri };
  }
  return { status: (await shareFile(uri, 'application/pdf')) ? 'shared' : 'failed', uri };
}

import { Platform, Alert } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mediaUrl } from '../api/media';
import type { ChatAttachment } from '../api/chat';

// Downloaded chat media lives under the app's document directory (NOT cache) so a file downloaded
// once stays viewable forever, WhatsApp-style. Files are keyed by a hash of their remote URL, so
// the same attachment forwarded into several chats maps to one file on disk.
export const MEDIA_DIR = `${FS.documentDirectory}chat-media/`;

// djb2 — tiny stable hash; good enough to key cache files off the remote URL.
const hash = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

const extOf = (name: string, url: string): string => {
  const pick = (s: string): string => {
    const m = /\.([A-Za-z0-9]{1,8})$/.exec(s.split('?')[0] ?? '');
    return m ? `.${m[1].toLowerCase()}` : '';
  };
  return pick(name) || pick(url);
};

export const localPathFor = (att: ChatAttachment): string => {
  const url = mediaUrl(att.url);
  return `${MEDIA_DIR}${hash(url)}${extOf(att.name ?? '', url)}`;
};

// Write a text file into the media directory and return its path — used by "Export chat" to build
// the transcript before handing it to the share sheet.
export async function writeTextFile(path: string, contents: string): Promise<string> {
  await FS.makeDirectoryAsync(MEDIA_DIR, { intermediates: true }).catch(() => undefined);
  await FS.writeAsStringAsync(path, contents);
  return path;
}

// How much space downloaded photos, videos, voice notes and documents take up, and how many files —
// what the storage screen shows before offering to free it.
export async function mediaCacheUsage(): Promise<{ bytes: number; files: number }> {
  try {
    const names = await FS.readDirectoryAsync(MEDIA_DIR);
    let bytes = 0;
    for (const n of names) {
      const info = await FS.getInfoAsync(`${MEDIA_DIR}${n}`);
      if (info.exists && !info.isDirectory) bytes += info.size ?? 0;
    }
    return { bytes, files: names.length };
  } catch { return { bytes: 0, files: 0 }; } // nothing downloaded yet
}

// Delete every downloaded file. Safe by design: media is re-downloadable from the server on demand,
// and the messages themselves live in the message database, untouched by this.
export async function clearMediaCache(): Promise<void> {
  try { await FS.deleteAsync(MEDIA_DIR, { idempotent: true }); } catch { /* nothing to clear */ }
}

// file:// URI if this attachment is already on disk, else null.
export async function downloadedUri(att: ChatAttachment): Promise<string | null> {
  try {
    const path = localPathFor(att);
    const info = await FS.getInfoAsync(path);
    return info.exists ? path : null;
  } catch {
    return null;
  }
}

export async function downloadAttachment(att: ChatAttachment, onProgress?: (fraction: number) => void): Promise<string> {
  await FS.makeDirectoryAsync(MEDIA_DIR, { intermediates: true }).catch(() => undefined);
  const dl = FS.createDownloadResumable(mediaUrl(att.url), localPathFor(att), {}, (p) => {
    if (onProgress && p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
  });
  const res = await dl.downloadAsync();
  if (!res) throw new Error('Download interrupted');
  return res.uri;
}

export type GallerySaveResult = 'saved' | 'denied' | 'unavailable';

// Save a LOCAL file into the device gallery (Photos / Google Photos), like WhatsApp does for
// downloaded photos & videos. expo-media-library ships only in builds ≥ the one that added it —
// on an older binary running this bundle via OTA the import throws, and we report 'unavailable'
// so callers can fall back to the share sheet.
export async function saveToGallery(uri: string): Promise<GallerySaveResult> {
  try {
    const ML = await import('expo-media-library');
    const perm = await ML.requestPermissionsAsync(true); // writeOnly — iOS asks only to ADD photos
    if (!perm.granted) return 'denied';
    await ML.createAssetAsync(uri);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

// One save-to-phone outcome across both mechanisms (media library / shared-folder copy).
export type DeviceSaveResult = 'saved' | 'denied' | 'declined' | 'failed';

// Save a downloaded photo/video so the user can find it OUTSIDE the app. Preferred: straight into
// the gallery via expo-media-library. On binaries that don't compile it in yet, fall back to
// copying into the user's granted shared folder — shared storage is indexed by Android's media
// scanner, so the photo still appears in the Gallery app (and Files), just under that folder.
export async function saveMediaToDevice(localUri: string, name: string, mime: string): Promise<DeviceSaveResult> {
  const viaLibrary = await saveToGallery(localUri);
  if (viaLibrary !== 'unavailable') return viaLibrary;
  return exportToSharedFolder(localUri, name, mime);
}

// Device-save for a viewer that only holds a URI: local files save directly, remote ones are
// fetched into the media dir first (so the viewer's copy also becomes the chat's cached copy).
// force: an explicit Download tap means "save this" — re-ask for a folder even if the user
// dismissed the prompt in the past.
export async function saveUrlToDevice(url: string): Promise<DeviceSaveResult> {
  let uri = url;
  const raw = url.split('/').pop()?.split('?')[0] ?? '';
  const name = raw.includes('.') ? raw : `${raw || `kb360-${hash(url)}`}.jpg`;
  if (!url.startsWith('file://')) {
    await FS.makeDirectoryAsync(MEDIA_DIR, { intermediates: true }).catch(() => undefined);
    uri = (await FS.downloadAsync(url, `${MEDIA_DIR}${hash(url)}${extOf(raw, url)}`)).uri;
  }
  const viaLibrary = await saveToGallery(uri);
  if (viaLibrary !== 'unavailable') return viaLibrary;
  return exportToSharedFolder(uri, name, EXT_MIME[extOf(name, url).slice(1)] ?? 'image/jpeg', { force: true });
}

// Uploads from the web client / document picker / share sheet often arrive typed as
// "application/octet-stream" — an Android ACTION_VIEW intent with that type matches NO viewer
// app, so the "open with" chooser never appears and the tap dead-ends. WhatsApp resolves the
// type from the file extension; do the same whenever the stored MIME is missing or generic.
const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv', txt: 'text/plain', rtf: 'application/rtf', zip: 'application/zip',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', webm: 'video/webm', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', m4a: 'audio/m4a', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/opus', wav: 'audio/wav',
};

export function attachmentMime(att: ChatAttachment): string {
  const ext = extOf(att.name ?? '', mediaUrl(att.url)).slice(1);
  const declared = (att.mime ?? '').toLowerCase();
  const generic = !declared || declared === 'application/octet-stream' || declared === 'binary/octet-stream';
  return (generic ? EXT_MIME[ext] ?? declared : declared) || '';
}

// Android: hand the downloaded file to the system viewer app (what WhatsApp does for documents —
// tapping a PDF pops the "open with" PDF-app chooser, not the browser). If the specific MIME
// matches nothing, retry untyped so the FileProvider's own extension mapping gets a shot before
// we give up. Returns false if nothing could open it.
export async function openWithViewer(uri: string, mime: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const IntentLauncher = await import('expo-intent-launcher');
    const contentUri = await FS.getContentUriAsync(uri);
    const view = (type?: string): Promise<unknown> => IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION — the viewer app may read our file
    });
    try {
      await view(mime || undefined);
      return true;
    } catch {
      if (!mime) return false;
      await view(undefined);
      return true;
    }
  } catch {
    return false;
  }
}

// ── Files/Gallery visibility without expo-media-library (Android) ──
// Downloads land in the app's PRIVATE storage, which file managers can't browse — so a downloaded
// PDF never shows under My Files ▸ Documents. Under scoped storage an Expo app can only write a
// shared folder the user granted via the system picker (Storage Access Framework), so: ask once,
// remember the granted folder, and from then on silently copy downloads into it. Shared storage
// is media-scanned, so photos/videos copied this way surface in the Gallery app as well.
const SHARED_DIR_KEY = 'kb360_chatDocsDirUri';
const SHARED_DECLINED_KEY = 'kb360_chatDocsDirDeclined';

const askToPickFolder = (): Promise<boolean> => new Promise((resolve) => Alert.alert(
  'Save downloads to your phone?',
  "Pick a folder once (Documents is suggested). Photos and files you download from chat will be saved there and show up in your Gallery and Files apps.",
  [
    { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
    { text: 'Choose folder', onPress: () => resolve(true) },
  ],
  { cancelable: true, onDismiss: () => resolve(false) },
));

// SAF createDocument only appends an extension when the display name lacks one, so full names
// like "trip.pdf" + application/pdf come through unmangled.
async function safCopy(dirUri: string, localUri: string, name: string, mime: string): Promise<void> {
  const target = await FS.StorageAccessFramework.createFileAsync(dirUri, name, mime || 'application/octet-stream');
  const b64 = await FS.readAsStringAsync(localUri, { encoding: FS.EncodingType.Base64 });
  await FS.writeAsStringAsync(target, b64, { encoding: FS.EncodingType.Base64 });
}

// force: the user explicitly asked to save (viewer Download button) — clear a past "Not now"
// and offer the folder picker again instead of quietly skipping.
export async function exportToSharedFolder(localUri: string, name: string, mime: string, opts: { force?: boolean } = {}): Promise<DeviceSaveResult> {
  if (Platform.OS !== 'android') return 'declined'; // iOS: the app's media dir is exposed to the Files app via Info.plist instead
  try {
    let dir = await AsyncStorage.getItem(SHARED_DIR_KEY);
    if (!dir) {
      if (opts.force) await AsyncStorage.removeItem(SHARED_DECLINED_KEY);
      else if (await AsyncStorage.getItem(SHARED_DECLINED_KEY)) return 'declined';
      if (!(await askToPickFolder())) {
        await AsyncStorage.setItem(SHARED_DECLINED_KEY, '1'); // asked once, like other onboarding prompts
        return 'declined';
      }
      const perm = await FS.StorageAccessFramework.requestDirectoryPermissionsAsync(
        FS.StorageAccessFramework.getUriForDirectoryInRoot('Documents'),
      );
      if (!perm.granted) return 'failed';
      dir = perm.directoryUri;
      await AsyncStorage.setItem(SHARED_DIR_KEY, dir);
    }
    try {
      await safCopy(dir, localUri, name, mime);
      return 'saved';
    } catch {
      // The grant died (folder deleted / permission revoked) — re-pick once, then copy again.
      await AsyncStorage.removeItem(SHARED_DIR_KEY);
      const perm = await FS.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) return 'failed';
      await AsyncStorage.setItem(SHARED_DIR_KEY, perm.directoryUri);
      await safCopy(perm.directoryUri, localUri, name, mime);
      return 'saved';
    }
  } catch {
    return 'failed';
  }
}

export async function shareFile(uri: string, mime?: string): Promise<boolean> {
  try {
    const Sharing = await import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(uri, { mimeType: mime || undefined });
    return true;
  } catch {
    return false;
  }
}

// Pure mapping from an OS share-intent payload (photos/files/text shared to the app from the
// system share sheet) to the chat upload/send shapes. Import-pure (no RN / native imports).

// Structural match for expo-share-intent's ShareIntentFile — declared here so this module and its
// tests never import the native package.
export interface SharedFile {
  path: string;
  mimeType?: string | null;
  fileName?: string | null;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null; // ms (videos)
}

export type ShareMessageType = 'image' | 'video' | 'document';

const FALLBACK_MIME = 'application/octet-stream';

const normalizeMime = (mime: string | null | undefined): string =>
  mime && mime.includes('/') ? mime : FALLBACK_MIME;

// Chat message type from the shared file's mime. Anything that isn't an image or video travels as
// a document — including audio files: 'voice' is reserved for in-app recorded notes (waveform UI).
export const shareMessageType = (mime: string | null | undefined): ShareMessageType => {
  const m = normalizeMime(mime);
  return m.startsWith('image/') ? 'image' : m.startsWith('video/') ? 'video' : 'document';
};

// Filename fallback chain: sender-provided name → basename of the content path → generic.
export const sharedFileName = (f: SharedFile, index = 0): string => {
  const name = f.fileName?.trim();
  if (name) return name;
  const base = f.path.split('/').pop()?.split('?')[0]?.trim();
  if (base) { try { return decodeURIComponent(base); } catch { return base; } }
  return `shared-${index + 1}`;
};

export interface SharedUpload {
  uri: string;
  name: string;
  mime: string;
  type: ShareMessageType;
  // Attachment metadata the chat renderer uses (image/video dimensions, video duration, doc size).
  extra: { width?: number; height?: number; durationMs?: number; size?: number };
}

// Normalize one shared file into the upload + attachment shape the chat send flow uses.
export const toSharedUpload = (f: SharedFile, index = 0): SharedUpload => {
  const mime = normalizeMime(f.mimeType);
  const type = shareMessageType(mime);
  const extra: SharedUpload['extra'] = {};
  if (type !== 'document') {
    if (f.width) extra.width = f.width;
    if (f.height) extra.height = f.height;
  }
  if (type === 'video' && f.duration) extra.durationMs = f.duration;
  if (type === 'document' && f.size) extra.size = f.size;
  return { uri: f.path, name: sharedFileName(f, index), mime, type, extra };
};

// Human summary for the picker header: "photo.jpg", "3 photos", "1 photo, 2 files" …
export const shareSummary = (files: SharedFile[], text?: string | null): string => {
  if (!files.length) return text?.trim() ? 'Message' : '';
  if (files.length === 1) return sharedFileName(files[0], 0);
  const counts: Record<ShareMessageType, number> = { image: 0, video: 0, document: 0 };
  for (const f of files) counts[shareMessageType(f.mimeType)] += 1;
  const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`;
  const parts: string[] = [];
  if (counts.image) parts.push(plural(counts.image, 'photo'));
  if (counts.video) parts.push(plural(counts.video, 'video'));
  if (counts.document) parts.push(plural(counts.document, 'file'));
  return parts.join(', ');
};

import { getApiBaseUrl } from './client';
import { getAccessToken } from './tokens';
import type { ChatAttachment } from './chat';

export interface UploadResult {
  url: string;
  key: string;
  name: string;
  size: number;
  mime: string;
}

// Multipart upload with progress, via XMLHttpRequest (fetch can't report upload progress in RN).
export function uploadFile(file: { uri: string; name: string; mime: string }, onProgress?: (fraction: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // React Native FormData file part.
    form.append('file', { uri: file.uri, name: file.name, type: file.mime } as unknown as Blob);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getApiBaseUrl()}/api/uploads`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText) as UploadResult); } catch (err) { reject(err as Error); }
      } else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(form);
  });
}

// Resolve a stored (possibly relative) media URL to an absolute one for <Image>/players/Linking.
export const mediaUrl = (url: string): string => (url.startsWith('http') ? url : `${getApiBaseUrl()}${url}`);

// Convenience: turn an upload result + extra metadata into a ChatAttachment.
export const toAttachment = (r: UploadResult, extra: Partial<ChatAttachment> = {}): ChatAttachment => ({
  url: r.url, key: r.key, name: r.name, size: r.size, mime: r.mime, ...extra,
});

export const humanSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

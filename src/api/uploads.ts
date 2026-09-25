import { getApiBaseUrl, ApiError } from './client';
import { getAccessToken } from './tokens';

export interface UploadFileInput {
  uri: string;
  name: string;
  type: string; // mime
}

// Multipart upload (FormData) — uses fetch directly so the boundary Content-Type is set by the runtime.
export async function uploadFile(file: UploadFileInput): Promise<{ id: string; url: string }> {
  const form = new FormData();
  // React Native FormData accepts a { uri, name, type } file part.
  form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);

  const token = getAccessToken();
  const res = await fetch(`${getApiBaseUrl()}/api/uploads`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (json && json.error) || {};
    throw new ApiError(res.status, err.message ?? 'Upload failed', err.code, err.details);
  }
  return json as { id: string; url: string };
}

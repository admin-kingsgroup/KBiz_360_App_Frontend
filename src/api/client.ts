import { getAccessToken } from './tokens';

// Base URL is configurable at app boot (e.g. from expo-constants extra). Default = local dev API.
let baseUrl = 'http://localhost:4000';
export const setApiBaseUrl = (url: string): void => { baseUrl = url; };
export const getApiBaseUrl = (): string => baseUrl;

// Normalized API error (mirrors the backend `{ error: { code, message, details } }` envelope).
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// A refresh handler is registered by `api/auth` to avoid a circular import. On a 401 the client
// calls it once and retries the original request if the refresh succeeds.
type Refresher = () => Promise<boolean>;
let refresher: Refresher | null = null;
export const registerRefreshHandler = (fn: Refresher | null): void => { refresher = fn; };

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
  _retried?: boolean;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, headers = {} } = opts;
  const token = auth ? getAccessToken() : null;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && refresher && !opts._retried) {
    const ok = await refresher();
    if (ok) return apiFetch<T>(path, { ...opts, _retried: true });
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = (json && json.error) || {};
    throw new ApiError(res.status, err.message ?? res.statusText ?? 'Request failed', err.code, err.details);
  }
  return json as T;
}

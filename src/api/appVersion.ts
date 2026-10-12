import { apiFetch } from './client';

// Force-update policy (public — asked before login too). minVersion null = no one is blocked.
export interface AppVersionPolicy {
  platform: 'android' | 'ios';
  minVersion: string | null;
  storeUrl: string | null;
  notes: string[];
}

export const getAppVersionPolicy = (platform: 'android' | 'ios'): Promise<AppVersionPolicy> =>
  apiFetch<AppVersionPolicy>(`/api/app-version?platform=${platform}`, { auth: false });

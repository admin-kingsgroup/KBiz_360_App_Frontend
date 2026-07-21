import type { Permissions } from '../types';

export type PermKey = keyof Permissions;

// Order + copy copied verbatim from source PERMISSIONS (location, network, notifications).
export interface PermissionMeta { key: PermKey; iconName: 'navigation' | 'wifi' | 'bell'; color: string; title: string; desc: string; }

export const PERMISSIONS: PermissionMeta[] = [
  { key: 'location',      iconName: 'navigation', color: '#22C55E', title: 'Location — Allow all the time', desc: 'Required. Auto check-in/out at the office, even when the app is closed. Choose “Allow all the time” when asked.' },
  { key: 'network',       iconName: 'wifi',       color: '#4F8BFF', title: 'Local network / Wi-Fi', desc: 'Detect the office router for auto check-in.' },
  { key: 'notifications', iconName: 'bell',       color: '#E8A13A', title: 'Notifications',         desc: 'Reminders, system alerts and attendance confirmations.' },
];

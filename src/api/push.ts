import { apiFetch } from './client';

// Push-device registration. Historically these endpoints lived under /api/calls (the calling
// feature registered devices first), but the SAME device registry powers chat/reminder/alert
// pushes server-side (chat.push.ts reads callDeviceRepo tokens) — so registration stays even
// though in-app voice calling was removed (owner call, 07-31). Endpoints unchanged for
// compatibility with the deployed backend.

// Expo push token → reminder/alert/chat notification delivery.
export const registerPushDevice = (expoPushToken: string, platform?: string): Promise<void> =>
  apiFetch('/api/calls/register-device', { method: 'POST', body: { expoPushToken, platform } });

// Raw FCM token → high-priority data pushes (background chat notifications on Android).
export const registerFcmDevice = (fcmToken: string, platform?: string): Promise<void> =>
  apiFetch('/api/calls/register-fcm', { method: 'POST', body: { fcmToken, platform } });

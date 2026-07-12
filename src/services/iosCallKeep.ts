import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import { registerVoipDevice } from '../api/calls';
import { callManager } from './rtc/CallManager';

// iOS-only CallKit + PushKit (VoIP) integration. An incoming call shows the native system call
// screen (full-screen, ring, Accept/Reject, over the lock screen) even when the app is killed — the
// WhatsApp experience. Pairs with the native AppDelegate wiring (plugins/withVoipPush.js) and the
// backend Apple VoIP sender (src/push/apns.voip.ts). No-op on Android / Expo Go / a build without the
// native modules.
/* eslint-disable @typescript-eslint/no-explicit-any */
const ios = Platform.OS === 'ios' && !isRunningInExpoGo();

let mods: { RNCallKeep: any; VoipPush: any } | null = null;
let started = false;

function load(): { RNCallKeep: any; VoipPush: any } | null {
  if (!ios) return null;
  if (mods) return mods;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RNCallKeep = require('react-native-callkeep').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VoipPush = require('react-native-voip-push-notification').default;
    mods = { RNCallKeep, VoipPush };
    return mods;
  } catch {
    return null; // native modules not in this build yet (rebuild required)
  }
}

// True once CallKit is set up — used by the in-app ringing UI to step aside (CallKit is the single
// incoming-call surface on iOS). False on Android / Expo Go / unbuilt → in-app overlay rings instead.
export function isCallKitActive(): boolean {
  return started && load() !== null;
}

// preview/production EAS builds talk to the PRODUCTION APNs environment; the dev-client build uses
// sandbox. __DEV__ is true only in the dev client. The backend stores this with the token and
// retries the other host on a mismatch, so it just optimises the first attempt.
const isProductionPush = !__DEV__;
const norm = (uuid: string): string => (uuid || '').toLowerCase();

function handleVoipPayload(payload: any): void {
  const m = load();
  if (!m || !payload || payload.type !== 'call' || !payload.callId) return;
  const callId = norm(payload.callId);
  if (payload.event === 'cancel') {
    try { m.RNCallKeep.endCall(callId); } catch { /* ignore */ }
    return;
  }
  // Safety net: the native AppDelegate already reports the call to CallKit when the push arrives.
  // This covers the case where JS was already running and handled the push first.
  try {
    m.RNCallKeep.displayIncomingCall(callId, payload.callerName || 'KBiz 360', payload.callerName || 'Incoming call', 'generic', payload.callType === 'video');
  } catch { /* ignore */ }
}

export function setupIosCallKeep(): void {
  const m = load();
  if (!m || started) return;
  started = true;
  const { RNCallKeep, VoipPush } = m;

  try {
    RNCallKeep.setup({
      ios: { appName: 'KBiz 360', supportsVideo: false, maximumCallGroups: '1', maximumCallsPerCallGroup: '1' },
    })
      .then(() => RNCallKeep.setAvailable(true))
      .catch(() => undefined);
  } catch { /* ignore */ }

  // CallKit user actions → drive the CallManager state machine.
  RNCallKeep.addEventListener('answerCall', ({ callUUID }: { callUUID: string }) => {
    callManager.acceptFromNotification(norm(callUUID));
  });
  RNCallKeep.addEventListener('endCall', ({ callUUID }: { callUUID: string }) => {
    callManager.declineOrEndFromNotification(norm(callUUID));
  });
  RNCallKeep.addEventListener('didPerformSetMutedCallAction', ({ muted }: { muted: boolean }) => {
    callManager.setMutedFromSystem(!!muted);
  });
  // CallKit activated the audio session → safe to start our audio route (avoids the no-audio bug).
  RNCallKeep.addEventListener('didActivateAudioSession', () => {
    callManager.onAudioSessionActivated();
  });

  // VoIP push token → backend (so it can target this device for CallKit pushes).
  VoipPush.addEventListener('register', (token: string) => {
    if (token) void registerVoipDevice(token, isProductionPush).catch(() => undefined);
  });
  // Incoming VoIP pushes while the JS runtime is alive.
  VoipPush.addEventListener('notification', (payload: any) => handleVoipPayload(payload));
  // Pushes buffered before the JS listeners attached (cold start from a killed state).
  VoipPush.addEventListener('didLoadWithEvents', (events: any[]) => {
    for (const e of events || []) {
      if (e?.name === 'RNVoipPushRemoteNotificationReceivedEvent') handleVoipPayload(e.data);
    }
  });

  VoipPush.registerVoipToken();
}

// Dismiss the CallKit UI when the call ends/rejects from inside the app (so the system screen clears).
export function endCallKit(callId: string | null | undefined): void {
  const m = load();
  if (!m || !callId) return;
  try { m.RNCallKeep.endCall(norm(callId)); } catch { /* ignore */ }
}

// Mark the CallKit call connected (stops "connecting…", starts the call timer).
export function reportCallKitConnected(callId: string | null | undefined): void {
  const m = load();
  if (!m || !callId) return;
  try { m.RNCallKeep.setCurrentCallActive(norm(callId)); } catch { /* ignore */ }
}

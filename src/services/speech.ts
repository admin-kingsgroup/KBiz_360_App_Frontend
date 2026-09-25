import { isRunningInExpoGo } from 'expo';

// Voice search (speech-to-text) via expo-speech-recognition — Android SpeechRecognizer /
// iOS SFSpeechRecognizer under the hood, so results stream like WhatsApp's search mic.
//
// IMPORTANT: expo-speech-recognition is a native module that is NOT in Expo Go, so importing it
// there would crash the whole app at boot (expo-router imports every route file). Mirroring the
// notifications service: never import it statically — lazy-require ONLY outside Expo Go and
// no-op otherwise. Real behavior needs a development build.
export const voiceSearchSupported = !isRunningInExpoGo();

type SpeechModule = typeof import('expo-speech-recognition');
type Subscription = { remove: () => void };

let mod: SpeechModule | null = null;
function load(): SpeechModule | null {
  if (!voiceSearchSupported) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!mod) mod = require('expo-speech-recognition') as SpeechModule;
  return mod;
}

export interface VoiceSearchCallbacks {
  /** Streaming transcript — fires repeatedly with partials, then once with isFinal. */
  onResult: (transcript: string, isFinal: boolean) => void;
  /** Recognition session finished (also fires after an error). */
  onEnd: () => void;
  onError: (message: string) => void;
}

let subs: Subscription[] = [];
function clearSubs(): void { subs.forEach((s) => s.remove()); subs = []; }

// Starts a one-shot dictation in the device language. Returns false when unavailable/denied
// (Expo Go, no recognizer on device, or mic permission refused) — onError explains why.
export async function startVoiceSearch(cb: VoiceSearchCallbacks): Promise<boolean> {
  const m = load();
  if (!m) { cb.onError('Voice search needs the full app build'); return false; }
  if (!m.ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
    cb.onError('Speech recognition is not available on this device');
    return false;
  }
  const perm = await m.ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perm.granted) { cb.onError('Microphone permission is needed for voice search'); return false; }
  clearSubs();
  const rec = m.ExpoSpeechRecognitionModule;
  subs = [
    rec.addListener('result', (e) => {
      const t = e.results?.[0]?.transcript ?? '';
      if (t) cb.onResult(t, !!e.isFinal);
    }),
    rec.addListener('end', () => { clearSubs(); cb.onEnd(); }),
    rec.addListener('error', (e) => { clearSubs(); cb.onError(e.message || 'Voice search failed'); cb.onEnd(); }),
  ];
  // No `lang` → device locale (matches keyboard/dictation language, like WhatsApp).
  m.ExpoSpeechRecognitionModule.start({ interimResults: true, continuous: false });
  return true;
}

export function stopVoiceSearch(): void {
  load()?.ExpoSpeechRecognitionModule.stop();
}

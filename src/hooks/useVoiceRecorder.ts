import { useEffect, useRef, useState } from 'react';
import {
  useAudioRecorder,
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

// A finished recording: the on-device file uri + its length in seconds.
export interface VoiceClip { uri: string; durationSec: number }

// Wraps expo-audio's recorder into a simple start/finish/cancel API plus a live elapsed timer.
// Microphone capture is a native feature — it needs a dev build and the RECORD_AUDIO permission
// (configured via the expo-audio plugin in app.json); it does not work in Expo Go.
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => clearTimer, []);

  const ensurePermission = async (): Promise<boolean> => {
    const current = await getRecordingPermissionsAsync();
    if (current.granted) return true;
    const req = await requestRecordingPermissionsAsync();
    return req.granted;
  };

  // Starts capture. Returns false if mic permission was denied.
  const start = async (): Promise<boolean> => {
    if (!(await ensurePermission())) return false;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    startedAt.current = Date.now();
    setElapsedSec(0);
    setIsRecording(true);
    clearTimer();
    timer.current = setInterval(() => setElapsedSec(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    return true;
  };

  // Stops capture and returns the clip (null if nothing was captured).
  const finish = async (): Promise<VoiceClip | null> => {
    clearTimer();
    setIsRecording(false);
    setElapsedSec(0);
    try { await recorder.stop(); } catch { /* already stopped */ }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    const durationSec = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    return uri ? { uri, durationSec } : null;
  };

  // Stops and discards.
  const cancel = async (): Promise<void> => {
    clearTimer();
    setIsRecording(false);
    setElapsedSec(0);
    try { await recorder.stop(); } catch { /* already stopped */ }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  };

  return { isRecording, elapsedSec, start, finish, cancel };
}

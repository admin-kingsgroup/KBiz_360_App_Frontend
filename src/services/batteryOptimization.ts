import { Platform, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRunningInExpoGo } from 'expo';

// Android can freeze a backgrounded app and block FCM/push delivery to save battery (aggressive on
// Xiaomi/Oppo/Vivo/Samsung). WhatsApp-style: ask the user ONCE to exempt the app so calls and
// messages keep arriving in the background. iOS has no equivalent → no-op there.
const KEY = 'kb360_battopt_prompted';
const PKG = 'com.kingsgroup.kbiz360';

export async function maybePromptBatteryOptimization(): Promise<void> {
  if (Platform.OS !== 'android' || isRunningInExpoGo()) return;
  try {
    if (await AsyncStorage.getItem(KEY)) return; // already shown once
    await AsyncStorage.setItem(KEY, '1'); // mark shown regardless of the user's choice (one-time)
  } catch {
    return;
  }
  Alert.alert(
    'Keep calls & messages working',
    'For calls and messages to reach you reliably when KBiz 360 is in the background, allow it to ignore battery optimization. You only need to do this once.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Allow', onPress: () => void openBatterySettings() },
    ],
  );
}

async function openBatterySettings(): Promise<void> {
  // Best path: the system "ignore battery optimizations?" dialog for THIS app (needs the
  // REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission in the manifest).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const IntentLauncher = require('expo-intent-launcher');
    await IntentLauncher.startActivityAsync('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', { data: `package:${PKG}` });
    return;
  } catch {
    /* fall through — module missing or OEM blocked the action */
  }
  // Fallback: open the app's own settings page (user taps Battery → Unrestricted). No native dep.
  try { await Linking.openSettings(); } catch { /* no-op */ }
}

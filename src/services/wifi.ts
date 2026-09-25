import NetInfo from '@react-native-community/netinfo';

// Ask netinfo to include the SSID in Wi-Fi details (needed on iOS; harmless on Android).
NetInfo.configure({ shouldFetchWiFiSSID: true });

// SSID of the Wi-Fi network the device is connected to, or null when unavailable.
// Android: requires fine-location permission granted AND location services on (the attendance
// screen already asks for both). iOS: requires the "Access WiFi Information" entitlement — wired
// in app.json but only active from the next iOS build; until then this resolves null and
// presence falls back to the geofence.
export async function getCurrentSsid(): Promise<string | null> {
  try {
    const state = await NetInfo.fetch('wifi');
    if (!state.isConnected) return null;
    const ssid = (state.details as { ssid?: string | null } | null)?.ssid ?? null;
    return ssid || null;
  } catch {
    return null;
  }
}

// SSID handling for the office Wi-Fi lock. Android reports SSIDs wrapped in quotes ("Office 5G")
// and '<unknown ssid>' when it can't read the network name (no location permission / services off).
export function cleanSsid(s?: string | null): string | null {
  if (!s) return null;
  const t = s.trim().replace(/^"(.*)"$/, '$1').trim();
  return t && t.toLowerCase() !== '<unknown ssid>' ? t : null;
}

// Case-insensitive match between the device's connected SSID and an office's configured SSID.
// False when either side is missing — no configured SSID means Wi-Fi presence stays off (geofence only).
export function ssidMatches(current: string | null | undefined, configured: string | null | undefined): boolean {
  const a = cleanSsid(current);
  const b = cleanSsid(configured);
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

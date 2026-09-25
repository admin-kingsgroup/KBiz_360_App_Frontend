import { cleanSsid, ssidMatches } from '../logic/wifi';

describe('cleanSsid', () => {
  it('passes plain SSIDs through', () => {
    expect(cleanSsid('Office 5G')).toBe('Office 5G');
  });
  it('strips the Android quote wrapping', () => {
    expect(cleanSsid('"Office 5G"')).toBe('Office 5G');
  });
  it('trims whitespace', () => {
    expect(cleanSsid('  Office 5G  ')).toBe('Office 5G');
  });
  it('rejects empty and unknown values', () => {
    expect(cleanSsid(null)).toBeNull();
    expect(cleanSsid(undefined)).toBeNull();
    expect(cleanSsid('')).toBeNull();
    expect(cleanSsid('   ')).toBeNull();
    expect(cleanSsid('<unknown ssid>')).toBeNull();
    expect(cleanSsid('"<unknown ssid>"')).toBeNull();
  });
});

describe('ssidMatches', () => {
  it('matches identical SSIDs', () => {
    expect(ssidMatches('Office 5G', 'Office 5G')).toBe(true);
  });
  it('matches case-insensitively and through Android quoting', () => {
    expect(ssidMatches('"office 5g"', 'Office 5G')).toBe(true);
  });
  it('does not match different networks', () => {
    expect(ssidMatches('Home WiFi', 'Office 5G')).toBe(false);
  });
  it('never matches when either side is missing', () => {
    expect(ssidMatches(null, 'Office 5G')).toBe(false);
    expect(ssidMatches('Office 5G', null)).toBe(false);
    expect(ssidMatches(null, null)).toBe(false);
    expect(ssidMatches('<unknown ssid>', '<unknown ssid>')).toBe(false);
  });
});

import { compareVersions, isUpdateRequired } from '../logic/appVersion';

describe('compareVersions', () => {
  it('compares each part as a number, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBe(1);
    expect(compareVersions('1.1.0', '1.2.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });

  it('treats missing parts as zero and ignores suffixes', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0-beta', '1.2.0')).toBe(0);
    expect(compareVersions(' 1.2.0 ', '1.2.0')).toBe(0);
  });
});

describe('isUpdateRequired', () => {
  it('blocks an app older than the minimum', () => {
    expect(isUpdateRequired('1.1.0', '1.2.0')).toBe(true);
  });

  it('lets the minimum itself and newer versions through', () => {
    expect(isUpdateRequired('1.2.0', '1.2.0')).toBe(false);
    expect(isUpdateRequired('1.3.0', '1.2.0')).toBe(false);
  });

  it('never blocks when either version is unknown', () => {
    expect(isUpdateRequired('1.1.0', null)).toBe(false);
    expect(isUpdateRequired('1.1.0', '')).toBe(false);
    expect(isUpdateRequired(null, '1.2.0')).toBe(false);
  });
});

jest.mock('expo-share-intent', () => ({
  getShareExtensionKey: () => 'kbiz360ShareKey',
}));

import { redirectSystemPath } from '../../app/+native-intent';

describe('redirectSystemPath (share-extension deep link)', () => {
  it('swallows the share-extension hand-off URL instead of routing it', () => {
    expect(
      redirectSystemPath({
        path: 'kbiz360:///dataUrl=kbiz360ShareKey?nonce=1C7C50E2-B44E-418D-A27A-22EE5B699106',
        initial: true,
      }),
    ).toBe('/');
  });

  it('passes normal deep links through untouched', () => {
    expect(redirectSystemPath({ path: '/chat/abc123', initial: false })).toBe('/chat/abc123');
    expect(redirectSystemPath({ path: '/', initial: true })).toBe('/');
  });
});

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'KBiz360Widget',
  displayName: 'KBiz 360',
  // iOS 17 gives us containerBackground; devices below 17 simply don't see the widget.
  deploymentTarget: '17.0',
  appleTeamId: '9GPR588XWH',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.kingsgroup.kbiz360'],
  },
  // Palette mirrors src/theme/colors.ts — the widget cannot import TS, so tokens are duplicated here.
  // Each "soft" fill is paired with a "text" colour that stays readable on it in both modes.
  colors: {
    $accent: '#25D366',
    widgetBg: { light: '#FFFFFF', dark: '#171B26' },
    tileBg: { light: '#F2F4F7', dark: '#222838' },
    textMain: { light: '#0C0E14', dark: '#F4F1EA' },
    textMute: { light: '#5B6472', dark: '#8A91A3' },
    brandGreen: '#25D366',
    brandPrimary: { light: '#0B6E60', dark: '#34C3A8' },
    brandPurple: '#9A6CF0',
    brandOrange: '#E8A13A',
    brandDanger: { light: '#D92D20', dark: '#F97066' },
    dangerSoft: { light: '#FEE4E2', dark: '#3D2226' },
    dangerText: { light: '#B42318', dark: '#FDA29B' },
    warnSoft: { light: '#FDF0E6', dark: '#3B2F1D' },
    warnText: { light: '#B54708', dark: '#F5B451' },
    purpleSoft: { light: '#F0EAFD', dark: '#2E2749' },
    purpleText: { light: '#6D3FD0', dark: '#BDA2F8' },
    primarySoft: { light: '#E7F4F1', dark: '#173B35' },
    primaryText: { light: '#0B6E60', dark: '#5FD9BF' },
  },
});

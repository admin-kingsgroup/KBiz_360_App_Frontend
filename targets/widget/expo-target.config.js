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
  colors: {
    $accent: '#25D366',
    widgetBg: { light: '#FFFFFF', dark: '#171B26' },
    textMain: { light: '#0C0E14', dark: '#F4F1EA' },
    textMute: { light: '#6D6D72', dark: '#7E8497' },
    brandGreen: '#25D366',
    brandPurple: '#9A6CF0',
    brandOrange: '#E8A13A',
    brandDanger: '#DC2626',
  },
});

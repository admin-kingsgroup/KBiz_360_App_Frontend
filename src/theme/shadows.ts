import { Platform, type ViewStyle } from 'react-native';

// RN equivalents of source web shadows:
// SHADOW    = '0 4px 16px -10px rgba(120,100,60,0.30)'
// SHADOW_SM = '0 2px 8px -5px rgba(120,100,60,0.25)'
const warm = 'rgb(120,100,60)';

export const shadow: ViewStyle = Platform.select({
  ios: { shadowColor: warm, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  android: { elevation: 4 },
  default: {},
}) as ViewStyle;

export const shadowSm: ViewStyle = Platform.select({
  ios: { shadowColor: warm, shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  android: { elevation: 2 },
  default: {},
}) as ViewStyle;

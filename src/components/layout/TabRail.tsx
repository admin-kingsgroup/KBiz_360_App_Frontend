import type { ComponentProps } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useIsFocused, type Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import { textStyles } from '../../theme/typography';
import { contrastRatio } from '../../theme/chatListPalette';
import { useSideStripStore } from '../../store/sideStripStore';
import { useRail, useSideRail } from './SideSafeArea';

export type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// iPhone Duo: the app's tab bar, stood up in the side strip under the clock. iOS does this itself
// for a native tab bar (it sits at the bottom of the strip, near the thumb); ours is drawn in JS, so
// it moves here by hand. The bottom bar goes away, and every tab gets its height back.
// Same tabs, icons, badges and press events as the bottom bar; labels stay, small, because six
// icons alone are hard to tell apart.
export function TabRail({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { edge } = useSideRail();
  const strip = useSideStripStore((s) => s.color);
  // The strip follows the screen's colour (dark chat themes make it dark); pick ink that reads on it.
  const onDark = contrastRatio('#FFFFFF', strip) > contrastRatio(colors.ink, strip);
  const active = onDark ? '#FFFFFF' : colors.primary;
  const inactive = onDark ? 'rgba(255,255,255,0.68)' : colors.textMuted;
  return (
    <View accessibilityRole="tablist" style={{
      flex: 1, justifyContent: 'flex-end', paddingBottom: insets.bottom + 8,
      [edge === 'left' ? 'borderRightWidth' : 'borderLeftWidth']: StyleSheet.hairlineWidth,
      borderColor: onDark ? 'rgba(255,255,255,0.14)' : 'rgba(134,150,160,0.35)',
    }}>
      {state.routes.map((route, index) => {
        const focused = index === state.index;
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const badge = options.tabBarBadge;
        const color = focused ? active : inactive;
        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };
        return (
          <Pressable key={route.key} testID={`tab-rail-${route.name}`} onPress={onPress}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
            accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label}
            style={{ alignItems: 'center', paddingVertical: 7, gap: 3 }}>
            <View>
              {options.tabBarIcon?.({ focused, color, size: 24 })}
              {badge != null ? (
                <View style={{ position: 'absolute', top: -5, right: 4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerDot }}>
                  <Text style={{ color: '#fff', ...textStyles.caption2, fontWeight: '600' }}>{badge}</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
              style={{ color, ...textStyles.caption2, fontWeight: focused ? '600' : '500', maxWidth: 76 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Stands in for the bottom tab bar while the strip exists: it draws nothing in place and keeps
// TabRail in the strip while the tabs are on screen (a pushed screen over them takes the strip).
export function TabRailHost(props: TabBarProps) {
  useRail(<TabRail {...props} />, useIsFocused());
  return null;
}

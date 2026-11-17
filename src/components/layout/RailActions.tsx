import { useEffect, useState, type ReactNode } from 'react';
import { View, Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '../../theme';
import { contrastRatio } from '../../theme/chatListPalette';
import { useSideStripStore } from '../../store/sideStripStore';

export interface RailAction {
  key: string;
  label: string;
  icon: ReactNode;
  /** Gets the press, so a menu can open from this button (anchorOfPress). */
  onPress: (e: GestureResponderEvent) => void;
}

// A pushed screen's header buttons, stood up in the iPhone Duo's side strip (see useRail): WhatsApp
// shows its back and call buttons there, under the clock. They sit at the bottom of the strip, as
// the tab bar does, where the thumb is and well clear of the clock and camera at the top.
export function RailActions({ actions }: { actions: RailAction[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingBottom: insets.bottom + 12 }}>
      {actions.map((a) => (
        <Pressable key={a.key} testID={`rail-${a.key}`} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={a.label}
          style={styles.button}>
          {a.icon}
        </Pressable>
      ))}
    </View>
  );
}

// What the strip shows on a screen that put nothing there itself: every pushed screen (an alert
// channel, a task, a form) gets a Back button in the strip, near the thumb, so the strip is never an
// empty column. Its own header keeps its back arrow too. Nothing on a screen with no way back.
export function RailBack() {
  const router = useRouter();
  const pathname = usePathname();
  const strip = useSideStripStore((s) => s.color);
  // Asked after each navigation, not while rendering: canGoBack() reads which screen is focused, and
  // React Navigation warns (and may answer stale) when that happens during a render.
  const [canBack, setCanBack] = useState(false);
  useEffect(() => { setCanBack(router.canGoBack()); }, [pathname, router]);
  if (!canBack) return null;
  const ink = contrastRatio('#FFFFFF', strip) > contrastRatio(colors.ink, strip) ? '#FFFFFF' : colors.ink;
  return <RailActions actions={[{ key: 'back', label: 'Back', icon: <ChevronLeft size={26} color={ink} />, onPress: () => router.back() }]} />;
}

// 52 pt: a full thumb target, the strip's 84 pt leaves room either side.
const styles = StyleSheet.create({
  button: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});

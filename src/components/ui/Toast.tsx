import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { colors, shadow } from '../../theme';

export interface ToastProps {
  message: string | null;
  onHide?: () => void;
  duration?: number;
}

// Transient message. Controlled by parent via `message` (from uiStore.toast). No logic beyond auto-hide timer.
export function Toast({ message, onHide, duration = 2200 }: ToastProps) {
  useEffect(() => {
    if (!message || !onHide) return;
    const t = setTimeout(onHide, duration);
    return () => clearTimeout(t);
  }, [message, onHide, duration]);
  if (!message) return null;
  return (
    <View className="absolute left-0 right-0 items-center" style={{ bottom: 90 }} pointerEvents="none">
      <View className="rounded-full px-4 py-2" style={[{ backgroundColor: colors.ink }, shadow]}>
        <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' }}>{message}</Text>
      </View>
    </View>
  );
}

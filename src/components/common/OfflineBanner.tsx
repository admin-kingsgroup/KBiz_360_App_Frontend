import { View, Text } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { colors } from '../../theme';
import { useNetwork } from '../../hooks/useNetwork';

// Slim banner shown only while offline. Sits under the status bar, above all screens.
export function OfflineBanner() {
  const { offline } = useNetwork();
  if (!offline) return null;
  return (
    <View className="flex-row items-center justify-center gap-1.5" style={{ paddingVertical: 4, backgroundColor: colors.ink }}>
      <WifiOff size={12} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>You're offline — changes stay on this device</Text>
    </View>
  );
}

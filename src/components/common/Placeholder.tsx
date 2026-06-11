import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme';

// Phase-2 route placeholder. Feature screens replace these in later phases.
export function Placeholder({ name, note }: { name: string; note?: string }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View className="flex-1 items-center justify-center px-8">
        <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>{name}</Text>
        <Text style={{ color: colors.warmMute, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
          {note ?? 'Route placeholder — implemented in a later phase.'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

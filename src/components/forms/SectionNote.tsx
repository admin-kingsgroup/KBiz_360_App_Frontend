import { View, Text } from 'react-native';
import type { ReactNode } from 'react';
import { colors } from '../../theme';

export interface SectionNoteProps { children: ReactNode; }

// Muted hint/callout block used under form sections.
export function SectionNote({ children }: SectionNoteProps) {
  return (
    <View className="rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.coolMuted }}>
      <Text style={{ color: colors.coolText, fontSize: 12.5, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

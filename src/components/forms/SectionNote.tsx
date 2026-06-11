import { View, Text } from 'react-native';
import type { ReactNode } from 'react';
import { colors } from '../../theme';

export interface SectionNoteProps { children: ReactNode; }

// Muted hint/callout block used under form sections.
export function SectionNote({ children }: SectionNoteProps) {
  return (
    <View className="rounded-xl px-3 py-2" style={{ backgroundColor: colors.canvas, borderColor: colors.cardEdge, borderWidth: 1 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11.5, lineHeight: 16 }}>{children}</Text>
    </View>
  );
}

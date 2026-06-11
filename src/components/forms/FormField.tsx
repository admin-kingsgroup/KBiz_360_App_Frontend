import { View, Text } from 'react-native';
import type { ReactNode } from 'react';
import { colors } from '../../theme';

export interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;   // the input (TextInput, picker, etc.) — provided by caller
}

// Labeled field wrapper. Holds NO input state itself — purely layout + label/required/hint.
export function FormField({ label, required, hint, children }: FormFieldProps) {
  return (
    <View className="mb-3">
      <View className="flex-row items-center gap-1 mb-1">
        <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700' }}>{label}</Text>
        {required ? <Text style={{ color: colors.coral, fontSize: 12 }}>*</Text> : null}
      </View>
      {children}
      {hint ? <Text style={{ color: colors.warmMute, fontSize: 10.5, marginTop: 3 }}>{hint}</Text> : null}
    </View>
  );
}

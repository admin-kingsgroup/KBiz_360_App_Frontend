import { Pressable, Text } from 'react-native';
import { colors } from '../../theme';

export interface SheetSaveProps {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}

// Primary action button for sheets/forms. Disabled styling driven by `disabled` prop only.
export function SheetSave({ label, disabled = false, onPress }: SheetSaveProps) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled}
      className="items-center justify-center rounded-full"
      style={{ backgroundColor: disabled ? colors.coolMuted : colors.primary, height: 50 }}>
      <Text style={{ color: disabled ? colors.coolText3 : '#FFFFFF', fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

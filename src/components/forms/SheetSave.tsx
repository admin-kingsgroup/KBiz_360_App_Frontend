import { Pressable, Text } from 'react-native';
import { colors, shadowSm } from '../../theme';

export interface SheetSaveProps {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}

// Primary action button for sheets/forms. Disabled styling driven by `disabled` prop only.
export function SheetSave({ label, disabled = false, onPress }: SheetSaveProps) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled}
      className="items-center justify-center rounded-full py-3"
      style={[{ backgroundColor: disabled ? colors.cardEdge : colors.ink }, disabled ? null : shadowSm]}>
      <Text style={{ color: disabled ? colors.warmMute : '#FFFFFF', fontSize: 13.5, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

import { View, Pressable } from 'react-native';
import { Bold, Italic, Strikethrough, Code, ListOrdered, List, TextQuote } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors } from '../../theme';
import type { FormatAction } from '../../logic/formatting';

// WhatsApp's text-formatting menu, as a strip above the composer while text is selected: bold,
// italic, strikethrough, monospace, numbered list, bullet list, quote. RN cannot add items to the
// native selection menu, so the strip appears the moment a selection exists and the caller applies
// the pick with logic/formatting.applyFormat (which keeps the styled text selected, so several
// styles can be stacked on one selection).
const ITEMS: { action: FormatAction; label: string; Icon: LucideIcon }[] = [
  { action: 'bold', label: 'Bold', Icon: Bold },
  { action: 'italic', label: 'Italic', Icon: Italic },
  { action: 'strike', label: 'Strikethrough', Icon: Strikethrough },
  { action: 'mono', label: 'Monospace', Icon: Code },
  { action: 'number', label: 'Numbered list', Icon: ListOrdered },
  { action: 'bullet', label: 'Bulleted list', Icon: List },
  { action: 'quote', label: 'Quote', Icon: TextQuote },
];

export function FormatToolbar({ onApply }: { onApply: (action: FormatAction) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: colors.card, borderTopColor: colors.coolDivider, borderTopWidth: 1 }}>
      {ITEMS.map(({ action, label, Icon }) => (
        <Pressable
          key={action}
          onPress={() => onApply(action)}
          accessibilityRole="button"
          accessibilityLabel={label}
          hitSlop={4}
          android_ripple={{ color: colors.coolMuted, borderless: true }}
          style={({ pressed }) => ({ width: 40, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.coolMuted : 'transparent' })}
        >
          <Icon size={19} color={colors.coolText} />
        </Pressable>
      ))}
    </View>
  );
}

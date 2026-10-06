import { Text, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '../../theme';
import { reminderDisplaySegments } from '../../logic/reminderMentions';

// A reminder's sentence with each @-mentioned person highlighted as a soft chip — and without
// the '@' itself. `names` = who may be mentioned (see reminderMentionNames); an unknown "@word"
// is left exactly as typed.
export function ReminderText({ text, names, style, numberOfLines }: {
  text: string; names: string[]; style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
  const segments = reminderDisplaySegments(text, names);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((seg, i) =>
        seg.mention
          ? <Text key={i} style={{ color: colors.primaryDark, backgroundColor: colors.primarySoft, fontWeight: '700' }}>{seg.text}</Text>
          : seg.text)}
    </Text>
  );
}

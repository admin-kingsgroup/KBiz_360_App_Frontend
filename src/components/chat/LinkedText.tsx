import { Text, Linking } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { splitLinks } from '../../logic/linkify';
import { splitMentions } from '../../logic/mentions';

// Message text with tappable links (WhatsApp-style): URLs render underlined in the link colour and
// open in the system browser. Nested-Text presses take precedence in RN, so tapping a link never
// triggers the bubble's own onPress (the message action menu) — a tap anywhere else still does.
// `mentionNames` (the display names @-mentioned in this message) render bold in the mention colour,
// WhatsApp-style; links are split first, then mentions inside the plain stretches.
// `onLongPress` forwards the container's long-press from link segments (they capture presses, so
// without it a long-press on a URL would never reach the bubble — e.g. chat selection mode).
export function LinkedText({ text, style, linkColor, mentionNames, mentionColor, onLongPress }: {
  text: string;
  style?: StyleProp<TextStyle>;
  linkColor: string;
  mentionNames?: string[];
  mentionColor?: string;
  onLongPress?: () => void;
}) {
  const parts = splitLinks(text);
  const names = mentionNames ?? [];
  const hasLinks = parts.some((p) => p.url);
  const hasMentions = names.length > 0 && text.includes('@');
  if (!hasLinks && !hasMentions) return <Text style={style}>{text}</Text>;
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.url ? (
          <Text
            key={i}
            onPress={() => void Linking.openURL(p.url as string).catch(() => undefined)}
            onLongPress={onLongPress}
            style={{ color: linkColor, textDecorationLine: 'underline' }}
          >
            {p.text}
          </Text>
        ) : (
          splitMentions(p.text, names).map((seg, j) =>
            seg.mention ? (
              <Text key={`${i}-${j}`} style={{ color: mentionColor ?? linkColor, fontWeight: '700' }}>{seg.text}</Text>
            ) : (
              <Text key={`${i}-${j}`}>{seg.text}</Text>
            ),
          )
        ),
      )}
    </Text>
  );
}

import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { Text, View, Linking, Platform } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { splitLinks } from '../../logic/linkify';
import { splitMentions } from '../../logic/mentions';
import { hasFormatting, isPlain, parseBlocks } from '../../logic/formatting';
import type { Block, InlineRun, InlineStyle } from '../../logic/formatting';

// Message text with tappable links (WhatsApp-style): URLs render underlined in the link colour and
// open in the system browser. Nested-Text presses take precedence in RN, so tapping a link never
// triggers the bubble's own onPress (the message action menu) — a tap anywhere else still does.
// `mentionNames` (the display names @-mentioned in this message) render bold in the mention colour,
// WhatsApp-style; links are split first, then mentions inside the plain stretches.
// `onLongPress` forwards the container's long-press from link segments (they capture presses, so
// without it a long-press on a URL would never reach the bubble — e.g. chat selection mode).
// `highlight` paints every case-insensitive occurrence of a search term — what in-chat search uses
// to show WHY a message matched.
// WhatsApp markup (*bold* _italic_ ~strike~ `mono`, "- " bullets, "1. " numbers, "> " quotes,
// ``` code blocks) renders as formatting — see logic/formatting.ts. Plain messages skip all of it.
export function LinkedText({ text, style, linkColor, mentionNames, mentionColor, onLongPress, highlight }: {
  text: string;
  style?: StyleProp<TextStyle>;
  linkColor: string;
  mentionNames?: string[];
  mentionColor?: string;
  onLongPress?: () => void;
  highlight?: string;
}) {
  const names = mentionNames ?? [];
  const term = highlight?.trim().toLowerCase();
  if (term) return <Text style={style}>{highlightParts(text, term)}</Text>;
  const pieces = (t: string): ReactNode => inlinePieces(t, names, linkColor, mentionColor ?? linkColor, onLongPress);
  if (!hasFormatting(text)) return <Text style={style}>{pieces(text)}</Text>;

  const blocks = parseBlocks(text);
  const runsNode = (runs: InlineRun[], empty: ReactNode): ReactNode => runs.length
    ? runs.map((r, i) => isPlain(r.style)
      ? <Fragment key={i}>{pieces(r.text)}</Fragment>
      : <Text key={i} style={runStyle(r.style)}>{r.style.mono ? r.text : pieces(r.text)}</Text>)
    : empty;

  // Inline styling only: stay ONE Text so wrapping, selection and the bubble's press handling are
  // exactly what an unformatted message gets.
  if (blocks.every((b) => b.kind === 'line')) {
    return (
      <Text style={style}>
        {blocks.map((b, i) => <Fragment key={i}>{i > 0 ? '\n' : null}{runsNode(b.kind === 'line' ? b.runs : [], null)}</Fragment>)}
      </Text>
    );
  }

  // Block-level content: consecutive quote lines share one box, like WhatsApp.
  const groups = groupQuotes(blocks);
  return (
    <View>
      {groups.map((g, i) => {
        if (g.kind === 'quotes') {
          return (
            <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: 'rgba(0,0,0,0.22)', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4, paddingVertical: 3, marginVertical: 2 }}>
              {g.runs.map((runs, j) => <Text key={j} style={style}>{runsNode(runs, ' ')}</Text>)}
            </View>
          );
        }
        const b = g.block;
        switch (b.kind) {
          case 'code':
            return (
              <View key={i} style={{ backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 6, paddingVertical: 6, marginVertical: 3 }}>
                <Text style={[style, { fontFamily: MONO, fontSize: 13 }]}>{b.text}</Text>
              </View>
            );
          case 'bullet':
            return (
              <View key={i} style={{ flexDirection: 'row' }}>
                <Text style={[style, { width: 20 }]}>•</Text>
                <Text style={[style, { flex: 1 }]}>{runsNode(b.runs, ' ')}</Text>
              </View>
            );
          case 'number':
            return (
              <View key={i} style={{ flexDirection: 'row' }}>
                <Text style={[style, { minWidth: 26 }]}>{b.n}.</Text>
                <Text style={[style, { flex: 1 }]}>{runsNode(b.runs, ' ')}</Text>
              </View>
            );
          default:
            return <Text key={i} style={style}>{runsNode(b.kind === 'line' ? b.runs : [], ' ')}</Text>;
        }
      })}
    </View>
  );
}

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function runStyle(s: InlineStyle): TextStyle {
  const st: TextStyle = {};
  if (s.bold) st.fontWeight = '700';
  if (s.italic) st.fontStyle = 'italic';
  if (s.strike) st.textDecorationLine = 'line-through';
  if (s.mono) { st.fontFamily = MONO; st.fontSize = 13; st.backgroundColor = 'rgba(0,0,0,0.06)'; }
  return st;
}

type Group = { kind: 'quotes'; runs: InlineRun[][] } | { kind: 'one'; block: Block };
function groupQuotes(blocks: Block[]): Group[] {
  const out: Group[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.kind === 'quote') {
      if (last && last.kind === 'quotes') last.runs.push(b.runs);
      else out.push({ kind: 'quotes', runs: [b.runs] });
    } else {
      out.push({ kind: 'one', block: b });
    }
  }
  return out;
}

// Links + mentions inside one stretch of text (the pre-formatting behaviour, unchanged).
function inlinePieces(text: string, names: string[], linkColor: string, mentionColor: string, onLongPress?: () => void): ReactNode {
  const parts = splitLinks(text);
  const hasLinks = parts.some((p) => p.url);
  const hasMentions = names.length > 0 && text.includes('@');
  if (!hasLinks && !hasMentions) return text;
  return parts.map((p, i) =>
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
          <Text key={`${i}-${j}`} style={{ color: mentionColor, fontWeight: '700' }}>{seg.text}</Text>
        ) : (
          <Text key={`${i}-${j}`}>{seg.text}</Text>
        ),
      )
    ),
  );
}

// Split on the search term and tint the matches. Kept separate from the link/mention splitting: while
// searching, showing WHERE the hit is matters more than link affordances.
function highlightParts(text: string, term: string) {
  const out: ReactNode[] = [];
  const lower = text.toLowerCase();
  let i = 0;
  let key = 0;
  for (;;) {
    const at = lower.indexOf(term, i);
    if (at < 0) { out.push(<Text key={key++}>{text.slice(i)}</Text>); break; }
    if (at > i) out.push(<Text key={key++}>{text.slice(i, at)}</Text>);
    out.push(<Text key={key++} style={{ backgroundColor: '#FFE9A8', fontWeight: '700' }}>{text.slice(at, at + term.length)}</Text>);
    i = at + term.length;
  }
  return out;
}

import { readFileSync } from 'fs';
import { join } from 'path';
import { textStyles } from '../theme/typography';

// The Chats list and the chat screen take every text size from textStyles (Apple's iOS text styles),
// so they read like WhatsApp on the iPhone Duo instead of 25 hand-set sizes, most of them 11–14 pt.
// This fails when one of these files sets a size by number again. Avatar tiles, the watermark and the
// emoji grid size their glyphs from the tile, so they are not on the list.
const ON_THE_SCALE = [
  'app/(tabs)/index.tsx',
  'app/chat/[id].tsx',
  'src/components/home/HomeHeader.tsx',
  'src/components/home/GroupsList.tsx',
  'src/components/home/GroupsPane.tsx',
  'src/components/home/PickMenu.tsx',
  'src/components/chat/ChatListItem.tsx',
  'src/components/chat/ChatActionsSheet.tsx',
  'src/components/chat/DateJumpSheet.tsx',
  'src/components/chat/AttachmentTile.tsx',
  'src/components/chat/LinkPreviewCard.tsx',
  'src/components/chat/VoiceMessage.tsx',
  'src/components/chat/LinkedText.tsx',
];

const root = join(__dirname, '..', '..');

describe('chat screens use the shared text styles', () => {
  it.each(ON_THE_SCALE)('%s sets no font size by number', (file) => {
    const src = readFileSync(join(root, file), 'utf8');
    const raw = src.split('\n')
      .map((line, i) => ({ line: i + 1, text: line.trim() }))
      .filter(({ text }) => /fontSize\s*[:=]\s*[\d.]/.test(text));
    expect(raw).toEqual([]);
  });
});

describe('textStyles', () => {
  // Apple's text styles one Text Size step below the default ("Medium"), where WhatsApp reads; the
  // default ("Large", body 17) read too big beside it on the iPhone Duo (owner, 2026-11-17).
  it('keeps Apple\'s Medium text sizes, largest first', () => {
    expect(Object.fromEntries(Object.entries(textStyles).map(([k, v]) => [k, v.fontSize]))).toEqual({
      largeTitle: 33, title1: 27, title2: 21, title3: 19, headline: 16, body: 16,
      callout: 15, subheadline: 14, footnote: 12, caption1: 11, caption2: 11,
    });
  });

  it.each(Object.entries(textStyles))('%s leaves room for its own line', (_name, style) => {
    expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
    expect(Number.isInteger(style.fontSize)).toBe(true);
  });
});

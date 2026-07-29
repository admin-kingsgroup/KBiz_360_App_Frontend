import { activeMention, applyMention, rankMentionMatches, splitMentions, mentionIdsInText, hasEveryoneMention } from '../logic/mentions';

// Caret at the end of the given string, which is how the composer is used ~always.
const at = (s: string) => activeMention(s, s.length);

describe('activeMention', () => {
  it('opens on a bare @ at the start of the text', () => {
    expect(at('@')).toEqual({ query: '', start: 0, end: 1 });
  });
  it('opens after whitespace and captures what follows', () => {
    expect(at('call @har')).toEqual({ query: 'har', start: 5, end: 9 });
    expect(at('line one\n@sa')).toEqual({ query: 'sa', start: 9, end: 12 });
  });
  it('does NOT open mid-word — an email address is not a mention', () => {
    expect(at('mail anu@kingsgroupco.com')).toBeNull();
    expect(at('a@b')).toBeNull();
  });
  it('closes once the token ends in whitespace', () => {
    expect(at('@Harshit Jha ')).toBeNull();
    expect(at('@Harshit Jha please check')).toBeNull();
  });
  it('gives up on very long tokens (prose, not a name)', () => {
    expect(at(`@${'x'.repeat(40)}`)).toBeNull();
  });
  it('reads the token the CARET is in, not the last one in the text', () => {
    const text = '@bo and @am';
    expect(activeMention(text, 3)).toEqual({ query: 'bo', start: 0, end: 3 });
    expect(activeMention(text, 11)).toEqual({ query: 'am', start: 8, end: 11 });
  });
  it('returns null for an out-of-range caret', () => {
    expect(activeMention('@ab', 99)).toBeNull();
    expect(activeMention('@ab', -1)).toBeNull();
  });
});

describe('applyMention', () => {
  it('replaces the token and parks the caret after the trailing space', () => {
    const m = at('send file to @har')!;
    expect(applyMention('send file to @har', m, 'Harshit Jha')).toEqual({
      text: 'send file to @Harshit Jha ', cursor: 26,
    });
  });
  it('keeps the text that follows a mid-sentence mention', () => {
    const text = 'ask @sa about the PO';
    const m = activeMention(text, 7)!;
    const out = applyMention(text, m, 'Sayli Ticketing');
    expect(out.text).toBe('ask @Sayli Ticketing  about the PO');
    expect(out.text.slice(0, out.cursor)).toBe('ask @Sayli Ticketing ');
  });
  it('the inserted mention no longer parses as an open token', () => {
    const out = applyMention('@har', at('@har')!, 'Harshit Jha');
    expect(activeMention(out.text, out.cursor)).toBeNull();
  });
});

describe('rankMentionMatches', () => {
  const people = [{ name: 'Harshit Jha' }, { name: 'Jaydeep Shah' }, { name: 'Sayli Ticketing' }];

  it('ranks name-start matches above mid-name ones', () => {
    // 'ha' starts "Harshit Jha" but sits mid-name in "Jaydeep Shah".
    expect(rankMentionMatches(people, 'ha').map((p) => p.name)).toEqual(['Harshit Jha', 'Jaydeep Shah']);
  });
  it('is case-insensitive and matches any word of the name', () => {
    expect(rankMentionMatches(people, 'TICKET').map((p) => p.name)).toEqual(['Sayli Ticketing']);
  });
  it('an empty query shows the top of the directory', () => {
    expect(rankMentionMatches(people, '').map((p) => p.name)).toEqual(people.map((p) => p.name));
  });
  it('honours the limit', () => {
    expect(rankMentionMatches(people, '', 2)).toHaveLength(2);
  });
  it('no match → nothing (the popover stays hidden)', () => {
    expect(rankMentionMatches(people, 'zzz')).toEqual([]);
  });
});

describe('splitMentions', () => {
  const names = ['Harshit Jha', 'Harshit', 'Al'];

  it('marks a matched @Name and keeps the surrounding text intact', () => {
    expect(splitMentions('ping @Harshit Jha now', names)).toEqual([
      { text: 'ping ', mention: false },
      { text: '@Harshit Jha', mention: true },
      { text: ' now', mention: false },
    ]);
  });
  it('prefers the LONGEST matching name', () => {
    const segs = splitMentions('@Harshit Jha', names);
    expect(segs).toEqual([{ text: '@Harshit Jha', mention: true }]);
  });
  it('is case-insensitive but preserves the typed casing', () => {
    expect(splitMentions('hey @harshit jha!', names)).toEqual([
      { text: 'hey ', mention: false },
      { text: '@harshit jha', mention: true },
      { text: '!', mention: false },
    ]);
  });
  it('needs a clean end — "Al" never lights up inside "@Albert"', () => {
    expect(splitMentions('@Albert', names)).toEqual([{ text: '@Albert', mention: false }]);
    expect(splitMentions('@Al!', names)).toEqual([{ text: '@Al', mention: true }, { text: '!', mention: false }]);
  });
  it('a mid-word @ (email address) is not a mention', () => {
    expect(splitMentions('mail al@x.com', names)).toEqual([{ text: 'mail al@x.com', mention: false }]);
  });
  it('handles several mentions and reproduces the input when concatenated', () => {
    const text = '@Al meet @Harshit Jha at 5';
    const segs = splitMentions(text, names);
    expect(segs.filter((s) => s.mention).map((s) => s.text)).toEqual(['@Al', '@Harshit Jha']);
    expect(segs.map((s) => s.text).join('')).toBe(text);
  });
  it('no roster / no @ → one plain segment', () => {
    expect(splitMentions('plain text', names)).toEqual([{ text: 'plain text', mention: false }]);
    expect(splitMentions('@Harshit Jha', [])).toEqual([{ text: '@Harshit Jha', mention: false }]);
  });
});

describe('mentionIdsInText', () => {
  const people = [
    { id: 'u1', name: 'Harshit Jha' },
    { id: 'u2', name: 'Harshit' },
    { id: 'u3', name: 'Sayli Ticketing' },
  ];

  it('collects the ids of mentioned members, deduped, in text order', () => {
    expect(mentionIdsInText('@Sayli Ticketing and @Harshit Jha and @Sayli Ticketing', people)).toEqual(['u3', 'u1']);
  });
  it('longest-name-first: "@Harshit Jha" is u1, a bare "@Harshit " is u2', () => {
    expect(mentionIdsInText('@Harshit Jha', people)).toEqual(['u1']);
    expect(mentionIdsInText('@Harshit ok', people)).toEqual(['u2']);
  });
  it('no mentions → empty', () => {
    expect(mentionIdsInText('nothing here', people)).toEqual([]);
    expect(mentionIdsInText('a@b.com', people)).toEqual([]);
  });
});

describe('hasEveryoneMention', () => {
  it('detects a clean @everyone token, case-insensitive, anywhere in the text', () => {
    expect(hasEveryoneMention('@everyone standup in 5')).toBe(true);
    expect(hasEveryoneMention('reminder @Everyone!')).toBe(true);
    expect(hasEveryoneMention('@everyone')).toBe(true);
  });
  it('word boundaries apply — emails and longer words never count', () => {
    expect(hasEveryoneMention('mail me@everyone.com')).toBe(false);
    expect(hasEveryoneMention('@everyoneelse come')).toBe(false);
    expect(hasEveryoneMention('everyone come')).toBe(false);
  });
});

import { activeMention, applyMention, rankMentionMatches } from '../logic/mentions';

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

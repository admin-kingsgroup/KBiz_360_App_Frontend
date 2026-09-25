import { applyFormat, hasFormatting, inlineRuns, parseBlocks, stripFormatting } from '../logic/formatting';

const flat = (line: string) => inlineRuns(line).map((r) => {
  const tags = [r.style.bold && 'b', r.style.italic && 'i', r.style.strike && 's', r.style.mono && 'm'].filter(Boolean).join('');
  return tags ? `${tags}(${r.text})` : r.text;
}).join('|');

describe('inlineRuns — WhatsApp inline markup', () => {
  it('bold / italic / strike / mono', () => {
    expect(flat('say *hi* there')).toBe('say |b(hi)| there');
    expect(flat('_soft_ and ~gone~ and `code`')).toBe('i(soft)| and |s(gone)| and |m(code)');
    expect(flat('```tt```')).toBe('m(tt)');
  });

  it('nests and combines styles', () => {
    expect(flat('*_both_*')).toBe('bi(both)');
    expect(flat('*bold _and italic_ end*')).toBe('b(bold )|bi(and italic)|b( end)');
  });

  it('leaves markers alone when they are not WhatsApp-valid', () => {
    expect(flat('5*3*2')).toBe('5*3*2'); // hugged by word characters
    expect(flat('snake_case_name')).toBe('snake_case_name');
    expect(flat('* not bold *')).toBe('* not bold *'); // space right inside the marker
    expect(flat('*unclosed')).toBe('*unclosed');
    expect(flat('*bold*text')).toBe('*bold*text'); // closer must be followed by a boundary
    expect(flat('(*bold*).')).toBe('(|b(bold)|).'); // punctuation is a boundary
  });

  it('does not format inside monospace', () => {
    expect(flat('`*raw*`')).toBe('m(*raw*)');
  });

  it('concatenated run text is the line without markers', () => {
    const line = 'a *b* _c_ ~d~ `e` f';
    expect(inlineRuns(line).map((r) => r.text).join('')).toBe('a b c d e f');
  });
});

describe('parseBlocks — lists, quotes, code', () => {
  it('bullets, numbers and quotes by line', () => {
    const kinds = parseBlocks('Plan:\n- one\n* two\n1. first\n2. second\n> said so\nbye').map((b) => b.kind);
    expect(kinds).toEqual(['line', 'bullet', 'bullet', 'number', 'number', 'quote', 'line']);
    const b = parseBlocks('2. *second*')[0];
    expect(b.kind === 'number' && b.n).toBe(2);
  });

  it('needs the space after the marker', () => {
    expect(parseBlocks('-item')[0].kind).toBe('line');
    expect(parseBlocks('*bold* start')[0].kind).toBe('line');
    expect(parseBlocks('>no')[0].kind).toBe('line');
  });

  it('folds a multi-line ``` fence into one code block', () => {
    const blocks = parseBlocks('see\n```\nline 1\nline 2\n```\ndone');
    expect(blocks.map((b) => b.kind)).toEqual(['line', 'code', 'line']);
    expect(blocks[1].kind === 'code' && blocks[1].text).toBe('line 1\nline 2');
  });

  it('an unclosed fence stays literal', () => {
    expect(parseBlocks('```oops\nmore').map((b) => b.kind)).toEqual(['line', 'line']);
  });
});

describe('hasFormatting / stripFormatting', () => {
  it('gates plain text cheaply', () => {
    expect(hasFormatting('just words\nand lines')).toBe(false);
    expect(hasFormatting('with *bold*')).toBe(true);
    expect(hasFormatting('- list')).toBe(true);
  });

  it('strips markers for previews', () => {
    expect(stripFormatting('*Urgent*: _read_ ~this~ `now`')).toBe('Urgent: read this now');
    expect(stripFormatting('- one\n2. two\n> q\n```c```')).toBe('• one\n2. two\nq\nc');
    expect(stripFormatting('no markers')).toBe('no markers');
  });
});

describe('applyFormat — composer toolbar', () => {
  it('wraps a selection and keeps it selected', () => {
    expect(applyFormat('hello world', { start: 6, end: 11 }, 'bold')).toEqual({ text: 'hello *world*', selection: { start: 6, end: 13 } });
  });

  it('keeps edge whitespace outside the markers', () => {
    expect(applyFormat('a b c', { start: 1, end: 4 }, 'italic')).toEqual({ text: 'a _b_ c', selection: { start: 2, end: 5 } });
  });

  it('toggles off when already wrapped (markers outside or inside the selection)', () => {
    expect(applyFormat('say *hi*', { start: 5, end: 7 }, 'bold').text).toBe('say hi');
    expect(applyFormat('say *hi*', { start: 4, end: 8 }, 'bold').text).toBe('say hi');
  });

  it('with no selection inserts a pair and parks the caret inside', () => {
    expect(applyFormat('ab', { start: 1, end: 1 }, 'strike')).toEqual({ text: 'a~~b', selection: { start: 2, end: 2 } });
  });

  it('uses a ``` fence for multi-line monospace', () => {
    expect(applyFormat('x\ny', { start: 0, end: 3 }, 'mono').text).toBe('```x\ny```');
  });

  it('prefixes every touched line for lists and quotes, numbering in order', () => {
    expect(applyFormat('one\ntwo\nthree', { start: 1, end: 6 }, 'bullet').text).toBe('- one\n- two\nthree');
    expect(applyFormat('one\ntwo', { start: 0, end: 7 }, 'number').text).toBe('1. one\n2. two');
    expect(applyFormat('one', { start: 0, end: 0 }, 'quote')).toEqual({ text: '> one', selection: { start: 0, end: 5 } });
  });

  it('toggles a list off and swaps one kind for another', () => {
    expect(applyFormat('- one\n- two', { start: 0, end: 11 }, 'bullet').text).toBe('one\ntwo');
    expect(applyFormat('- one\n- two', { start: 0, end: 11 }, 'number').text).toBe('1. one\n2. two');
  });

  it('starts a list in an empty draft', () => {
    expect(applyFormat('', { start: 0, end: 0 }, 'bullet')).toEqual({ text: '- ', selection: { start: 0, end: 2 } });
  });
});

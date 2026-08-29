import { oneLine } from '../logic/text';

describe('oneLine — single-line preview of a multi-line message', () => {
  it('folds newlines into single spaces', () => {
    expect(oneLine('• Point one\n• Point two\n• Point three')).toBe('• Point one • Point two • Point three');
  });

  it('collapses blank lines and surrounding indentation into one space', () => {
    expect(oneLine('First line.\n\n\n   Second line.')).toBe('First line. Second line.');
    expect(oneLine('Windows\r\nline endings')).toBe('Windows line endings');
  });

  it('strips WhatsApp markup so previews show the words, not the markers', () => {
    expect(oneLine('*Urgent*: _read_ this\n- one\n- two')).toBe('Urgent: read this • one • two');
  });

  it('drops leading/trailing breaks and leaves single-line text untouched', () => {
    expect(oneLine('\nhello\n')).toBe('hello');
    expect(oneLine('already one line')).toBe('already one line');
    expect(oneLine('')).toBe('');
  });
});

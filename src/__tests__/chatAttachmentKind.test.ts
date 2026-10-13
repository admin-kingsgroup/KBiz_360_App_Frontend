import { attachmentKindOf } from '../api/chat';

// A support ticket arrives as ONE message carrying a voice note, a screenshot and a recording
// (2026-10-12). Each file is drawn by its own kind; every other message has none and keeps its type.
describe('attachmentKindOf', () => {
  it("a ticket bundle's files are drawn by their own kind, whatever the message type says", () => {
    expect(attachmentKindOf({ kind: 'voice' }, 'document')).toBe('voice');
    expect(attachmentKindOf({ kind: 'image' }, 'document')).toBe('image');
    expect(attachmentKindOf({ kind: 'video' }, 'document')).toBe('video');
  });

  it('an ordinary attachment (no kind) is drawn by its message type, as before', () => {
    expect(attachmentKindOf({}, 'image')).toBe('image');
    expect(attachmentKindOf({}, 'voice')).toBe('voice');
    expect(attachmentKindOf({}, 'document')).toBe('document');
  });
});

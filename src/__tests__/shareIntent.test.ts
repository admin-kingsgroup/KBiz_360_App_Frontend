import { shareMessageType, sharedFileName, toSharedUpload, shareSummary, type SharedFile } from '../logic/shareIntent';

const file = (over: Partial<SharedFile> = {}): SharedFile => ({
  path: 'file:///data/user/0/app/cache/IMG_001.jpg',
  mimeType: 'image/jpeg',
  fileName: 'IMG_001.jpg',
  size: 1024,
  ...over,
});

describe('shareMessageType', () => {
  it('maps image/video mimes to their chat types', () => {
    expect(shareMessageType('image/png')).toBe('image');
    expect(shareMessageType('video/mp4')).toBe('video');
  });
  it('maps everything else (pdf, audio, unknown, missing) to document', () => {
    expect(shareMessageType('application/pdf')).toBe('document');
    expect(shareMessageType('audio/mpeg')).toBe('document');
    expect(shareMessageType('garbage')).toBe('document');
    expect(shareMessageType(null)).toBe('document');
    expect(shareMessageType(undefined)).toBe('document');
  });
});

describe('sharedFileName', () => {
  it('prefers the sender-provided name', () => {
    expect(sharedFileName(file({ fileName: 'report.pdf' }))).toBe('report.pdf');
  });
  it('falls back to the decoded path basename', () => {
    expect(sharedFileName(file({ fileName: null, path: 'file:///cache/My%20Doc.pdf' }))).toBe('My Doc.pdf');
    expect(sharedFileName(file({ fileName: '  ', path: 'file:///cache/pic.jpg?x=1' }))).toBe('pic.jpg');
  });
  it('falls back to a generic indexed name', () => {
    expect(sharedFileName(file({ fileName: null, path: '' }), 2)).toBe('shared-3');
  });
});

describe('toSharedUpload', () => {
  it('builds an image upload with dimensions and no doc size', () => {
    const up = toSharedUpload(file({ width: 800, height: 600 }));
    expect(up).toEqual({
      uri: 'file:///data/user/0/app/cache/IMG_001.jpg',
      name: 'IMG_001.jpg',
      mime: 'image/jpeg',
      type: 'image',
      extra: { width: 800, height: 600 },
    });
  });
  it('builds a video upload with durationMs', () => {
    const up = toSharedUpload(file({ mimeType: 'video/mp4', fileName: 'clip.mp4', width: 1920, height: 1080, duration: 20000 }));
    expect(up.type).toBe('video');
    expect(up.extra).toEqual({ width: 1920, height: 1080, durationMs: 20000 });
  });
  it('builds a document upload with size and a safe fallback mime', () => {
    const up = toSharedUpload(file({ mimeType: null, fileName: 'data.bin', size: 5000 }));
    expect(up.mime).toBe('application/octet-stream');
    expect(up.type).toBe('document');
    expect(up.extra).toEqual({ size: 5000 });
  });
});

describe('shareSummary', () => {
  it('single file → its name', () => {
    expect(shareSummary([file({ fileName: 'invoice.pdf' })])).toBe('invoice.pdf');
  });
  it('multiple files → grouped counts', () => {
    expect(shareSummary([file(), file(), file({ mimeType: 'application/pdf' })])).toBe('2 photos, 1 file');
    expect(shareSummary([file({ mimeType: 'video/mp4' }), file({ mimeType: 'video/mp4' })])).toBe('2 videos');
  });
  it('text-only share → Message; empty → empty', () => {
    expect(shareSummary([], 'hello')).toBe('Message');
    expect(shareSummary([], '  ')).toBe('');
    expect(shareSummary([])).toBe('');
  });
});
